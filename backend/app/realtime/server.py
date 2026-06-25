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
from ..models import Event, ParticipantResult, QuestionResponse, _now
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
    if session.state == COMPLETED:
        return {"ok": False, "error": "event_ended"}

    await sio.enter_room(sid, _room(event_id))
    _sid_event[sid] = event_id
    participant = session.add_participant(sid, name)

    await sio.emit(S2C.LOBBY_UPDATE, session.lobby_state(), room=_room(event_id))
    await sio.emit(S2C.HOST_MONITOR, session.monitor_state(), room=_host_room(event_id))

    payload = {
        "ok": True,
        "participantId": sid,
        "eventName": session.event_name,
        "eventType": session.event_type,
        "state": session.state,
    }
    if session.team_mode:
        payload["team"] = participant.team
        payload["teamLabel"] = session.team_label(participant.team)
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

    result = session.submit_answer(
        sid, data.get("answer"), used_hint=bool(data.get("usedHint"))
    )
    # Tell the host how many have answered (drives "X / N submitted") and,
    # for polls, lets the host watch the live vote tally accumulate.
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

    # Stamp the event's start time when the first question goes live.
    if session.index == 0:
        with SessionLocal() as db:
            event = db.get(Event, event_id)
            if event and event.started_at is None:
                event.started_at = _now()
                db.commit()

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
    # Polls always reveal their tally at lock; scored events honour the setting.
    if session.leaderboard_after_each or not session.scored:
        await _broadcast_leaderboard(event_id)
    if session.auto_advance:
        await sio.sleep(3)  # brief pause to show the leaderboard / results
        await _push_next(event_id)


async def _broadcast_leaderboard(event_id: int) -> None:
    session = game_manager.get(event_id)
    if session is None:
        return
    await sio.emit(
        S2C.LEADERBOARD_UPDATE,
        {
            "eventId": event_id,
            "eventType": session.event_type,
            "entries": session.leaderboard(),
            "teams": session.team_leaderboard(),  # [] when team mode is off
            # Vote tally of the just-locked question; rendered for polls.
            "distribution": session.distribution() if not session.scored else [],
        },
        room=_room(event_id),
    )


async def _complete(event_id: int) -> None:
    session = game_manager.get(event_id)
    if session is None:
        return
    session.complete()
    board = session.leaderboard()
    teams = session.team_leaderboard()
    scored = session.scored
    await sio.emit(
        S2C.EVENT_COMPLETE,
        {
            "eventId": event_id,
            "eventType": session.event_type,
            "leaderboard": board if scored else [],
            # Polls have no winner — they conclude with aggregate results.
            "winner": board[0] if (scored and board) else None,
            "teamMode": session.team_mode,
            "teams": teams,
            "winningTeam": teams[0] if (scored and teams) else None,
        },
        room=_room(event_id),
    )

    # Persist the durable snapshot (status, timestamps, per-participant results,
    # per-answer records) in a single transaction. Idempotent: never double-write.
    with SessionLocal() as db:
        event = db.get(Event, event_id)
        if event is None:
            return

        already_persisted = session.persisted or (
            event.status == COMPLETED and event.ended_at is not None
        )
        if not already_persisted:
            for entry in board:
                db.add(
                    ParticipantResult(
                        event_id=event_id,
                        name=entry["name"],
                        team=entry.get("team"),
                        final_score=entry["score"],
                        rank=entry["rank"],
                    )
                )
            for index, records in session.responses.items():
                snap = session.shown.get(index, {})
                for r in records:
                    db.add(
                        QuestionResponse(
                            event_id=event_id,
                            question_index=index,
                            question_content=snap.get("content", ""),
                            question_type=snap.get("type", ""),
                            correct_answer=snap.get("correct_answer", ""),
                            participant_name=r["participant_name"],
                            submitted_answer=r["submitted_answer"],
                            is_correct=r["is_correct"],
                            points=r["points"],
                            elapsed_seconds=r["elapsed_seconds"],
                        )
                    )

        event.status = COMPLETED
        if event.ended_at is None:
            event.ended_at = _now()
        if event.started_at is None:
            event.started_at = _now()
        db.commit()
        session.persisted = True
