"""Socket.IO server + event handlers — the real-time game orchestration.

Connection model:
    - Every participant and the host join the room ``event:{id}``.
    - The host additionally joins ``host:{id}`` for host-only monitoring.
    - We track which event each socket belongs to in ``_sid_event`` so we can
      clean up on disconnect.
"""
from __future__ import annotations

import socketio
from sqlalchemy import select

from ..config import settings
from ..database import SessionLocal
from ..models import Event
from .events import C2S, S2C
from .manager import COMPLETED, LOCKED, QUESTION, game_manager

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.cors_origin_list,
)

# sid -> event_id, so disconnect can find the right session.
_sid_event: dict[str, int] = {}


def _room(event_id: int) -> str:
    return f"event:{event_id}"


def _host_room(event_id: int) -> str:
    return f"host:{event_id}"


def _resolve_code(code: str) -> int | None:
    with SessionLocal() as db:
        event_id = db.scalar(select(Event.id).where(Event.code == code.strip().upper()))
        return event_id


# --------------------------------------------------------------------------
# Connection lifecycle
# --------------------------------------------------------------------------
@sio.event
async def connect(sid, environ, auth):
    # Auth/room assignment happens on explicit join events, not on connect.
    pass


@sio.event
async def disconnect(sid):
    event_id = _sid_event.pop(sid, None)
    if event_id is None:
        return
    session = game_manager.get(event_id)
    if session is None:
        return
    session.remove_participant(sid)
    await sio.emit(S2C.LOBBY_UPDATE, session.lobby_state(), room=_room(event_id))
    await sio.emit(S2C.HOST_MONITOR, session.monitor_state(), room=_host_room(event_id))


# --------------------------------------------------------------------------
# Host handlers
# --------------------------------------------------------------------------
@sio.on(C2S.HOST_JOIN)
async def host_join(sid, data):
    event_id = int(data["eventId"])
    session = game_manager.get_or_load(event_id)
    if session is None:
        return {"ok": False, "error": "event_not_found"}

    await sio.enter_room(sid, _room(event_id))
    await sio.enter_room(sid, _host_room(event_id))
    _sid_event[sid] = event_id

    await sio.emit(S2C.LOBBY_UPDATE, session.lobby_state(), room=_host_room(event_id))
    payload: dict = {
        "ok": True,
        "state": session.lobby_state(),
        "monitor": session.monitor_state(),
        "sessionState": session.state,
        "leaderboard": session.leaderboard(),
    }
    if session.state in (QUESTION, LOCKED):
        payload["currentQuestion"] = session.question_payload()
    return payload


@sio.on(C2S.HOST_START)
async def host_start(sid, data):
    event_id = int(data["eventId"])
    session = game_manager.get(event_id)
    if session is None:
        return {"ok": False, "error": "no_session"}
    if session.total == 0:
        return {"ok": False, "error": "no_questions_match_filters"}
    await _push_next(event_id)
    return {"ok": True}


@sio.on(C2S.HOST_NEXT)
async def host_next(sid, data):
    event_id = int(data["eventId"])
    await _push_next(event_id)
    return {"ok": True}


@sio.on(C2S.HOST_PAUSE)
async def host_pause(sid, data):
    event_id = int(data["eventId"])
    session = game_manager.get(event_id)
    if session:
        session.pause()
        await sio.emit(S2C.EVENT_STATE, session.monitor_state(), room=_room(event_id))
    return {"ok": True}


@sio.on(C2S.HOST_RESUME)
async def host_resume(sid, data):
    event_id = int(data["eventId"])
    session = game_manager.get(event_id)
    if session:
        session.resume()
        await sio.emit(S2C.EVENT_STATE, session.monitor_state(), room=_room(event_id))
    return {"ok": True}


@sio.on(C2S.HOST_END)
async def host_end(sid, data):
    event_id = int(data["eventId"])
    await _complete(event_id)
    return {"ok": True}


# --------------------------------------------------------------------------
# Participant handlers
# --------------------------------------------------------------------------
@sio.on(C2S.PARTICIPANT_JOIN)
async def participant_join(sid, data):
    code = str(data.get("code", ""))
    name = str(data.get("displayName", ""))
    event_id = _resolve_code(code)
    if event_id is None:
        return {"ok": False, "error": "invalid_code"}

    session = game_manager.get_or_load(event_id)
    if session is None:
        return {"ok": False, "error": "event_not_found"}

    await sio.enter_room(sid, _room(event_id))
    _sid_event[sid] = event_id
    session.add_participant(sid, name)

    await sio.emit(S2C.LOBBY_UPDATE, session.lobby_state(), room=_room(event_id))
    await sio.emit(S2C.HOST_MONITOR, session.monitor_state(), room=_host_room(event_id))

    payload = {
        "ok": True,
        "participantId": sid,
        "eventName": session.event_name,
        "state": session.state,
    }
    # If they joined mid-question, send them the current question immediately.
    if session.state == QUESTION:
        payload["currentQuestion"] = session.question_payload()
    return payload


@sio.on(C2S.PARTICIPANT_ANSWER)
async def participant_answer(sid, data):
    event_id = _sid_event.get(sid)
    if event_id is None:
        return {"ok": False, "error": "not_in_event"}
    session = game_manager.get(event_id)
    if session is None:
        return {"ok": False, "error": "no_session"}

    result = session.submit_answer(sid, data.get("answer"))
    # Tell the host how many have answered (drives "X / N submitted").
    await sio.emit(S2C.HOST_MONITOR, session.monitor_state(), room=_host_room(event_id))
    return {"ok": True, **result}


# --------------------------------------------------------------------------
# Shared flow helpers
# --------------------------------------------------------------------------
async def _push_next(event_id: int) -> None:
    session = game_manager.get(event_id)
    if session is None:
        return
    question = session.show_next()
    if question is None:
        await _complete(event_id)
        return

    await sio.emit(S2C.QUESTION_SHOW, session.question_payload(), room=_room(event_id))
    await sio.emit(S2C.HOST_MONITOR, session.monitor_state(), room=_host_room(event_id))
    # Server-authoritative timer: lock answers when time runs out.
    sio.start_background_task(_question_timer, event_id, session.index, session.time_limit)


async def _question_timer(event_id: int, index: int, time_limit: int) -> None:
    await sio.sleep(time_limit)
    session = game_manager.get(event_id)
    # Only act if this exact question is still the live one.
    if session is None or session.index != index or session.state != QUESTION:
        return
    session.lock()
    await sio.emit(
        S2C.QUESTION_LOCK, {"eventId": event_id, "questionId": index}, room=_room(event_id)
    )
    if session.leaderboard_after_each:
        await _broadcast_leaderboard(event_id)
    if session.auto_advance:
        await sio.sleep(3)  # brief pause to show the leaderboard
        await _push_next(event_id)


async def _broadcast_leaderboard(event_id: int) -> None:
    session = game_manager.get(event_id)
    if session is None:
        return
    await sio.emit(
        S2C.LEADERBOARD_UPDATE,
        {"eventId": event_id, "entries": session.leaderboard()},
        room=_room(event_id),
    )


async def _complete(event_id: int) -> None:
    session = game_manager.get(event_id)
    if session is None:
        return
    session.complete()
    board = session.leaderboard()
    await sio.emit(
        S2C.EVENT_COMPLETE,
        {"eventId": event_id, "leaderboard": board, "winner": board[0] if board else None},
        room=_room(event_id),
    )

    # Persist final status; game state itself stays in memory until restart.
    with SessionLocal() as db:
        event = db.get(Event, event_id)
        if event:
            event.status = COMPLETED
            db.commit()
