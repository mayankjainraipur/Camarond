"""End-to-end game loop over a real Socket.IO connection against a running
ASGI server, asserting the persisted report afterwards."""
import asyncio

import httpx
import socketio

from .conftest import SAMPLE_CSV

CORRECT = ["Tokyo", "True", "11", "Alexander Graham Bell"]

POLL_CSV = (
    "type,content,correct_answer,options,category\n"
    "poll,Best language?,,Python|Go|Rust,Tech\n"
    "poll,Tabs or spaces?,,Tabs|Spaces,Tech\n"
).encode()


async def test_socket_game_flow(live_server):
    # seed bank + create a team event over real HTTP
    async with httpx.AsyncClient(base_url=live_server, timeout=10) as http:
        up = (
            await http.post(
                "/api/banks/upload",
                params={"name": "Socket Bank"},
                files={"file": ("s.csv", SAMPLE_CSV, "text/csv")},
            )
        ).json()
        ev = (
            await http.post(
                "/api/events",
                json={"name": "Socket Quiz", "bank_id": up["bank"]["id"], "team_mode": True, "team_count": 2},
            )
        ).json()
    event_id, code, total = ev["id"], ev["code"], ev["question_count"]

    host = socketio.AsyncClient()
    await host.connect(live_server)
    assert (await host.call("host:join", {"eventId": event_id}))["ok"]

    parts, holders = [], []
    for i in range(2):
        c = socketio.AsyncClient()
        qev, holder = asyncio.Event(), {"q": None}

        @c.on("question:show")
        async def _on_q(data, _h=holder, _e=qev):
            _h["q"] = data
            _e.set()

        await c.connect(live_server)
        join = await c.call("participant:join", {"code": code, "displayName": f"P{i}"})
        assert join["teamLabel"]  # assigned to a team
        parts.append(c)
        holders.append((qev, holder))

    complete, cdone = {}, asyncio.Event()

    @host.on("event:complete")
    async def _on_complete(d):
        complete.update(d)
        cdone.set()

    # play every question: P0 answers correctly, P1 wrong
    for qi in range(total):
        for qev, holder in holders:
            qev.clear()
            holder["q"] = None
        await host.call("host:start" if qi == 0 else "host:next", {"eventId": event_id})
        await asyncio.wait_for(asyncio.gather(*[qev.wait() for qev, _ in holders]), timeout=5)
        for idx, (c, (_qev, holder)) in enumerate(zip(parts, holders)):
            answer = CORRECT[qi] if idx == 0 else "definitely wrong"
            await c.call("participant:answer", {"questionId": holder["q"]["questionId"], "answer": answer})

    await host.call("host:end", {"eventId": event_id})
    await asyncio.wait_for(cdone.wait(), timeout=5)
    assert complete["winningTeam"] is not None
    assert len(complete["teams"]) == 2

    await host.disconnect()
    for c in parts:
        await c.disconnect()

    # the event's results are now persisted and queryable
    async with httpx.AsyncClient(base_url=live_server, timeout=10) as http:
        rep = (await http.get(f"/api/reports/events/{event_id}")).json()
    assert rep["participant_count"] == 2
    assert len(rep["questions"]) == total
    assert rep["leaderboard"][0]["name"] == "P0"


async def test_socket_poll_flow(live_server):
    """A poll event: votes accumulate, the lock reveals a distribution, and the
    event completes with no winner."""
    async with httpx.AsyncClient(base_url=live_server, timeout=10) as http:
        up = (
            await http.post(
                "/api/banks/upload",
                params={"name": "Poll Bank"},
                files={"file": ("p.csv", POLL_CSV, "text/csv")},
            )
        ).json()
        ev = (
            await http.post(
                "/api/events",
                json={"name": "Live Poll", "bank_id": up["bank"]["id"], "event_type": "poll"},
            )
        ).json()
    event_id, code, total = ev["id"], ev["code"], ev["question_count"]
    assert ev["event_type"] == "poll"

    host = socketio.AsyncClient()
    await host.connect(live_server)
    assert (await host.call("host:join", {"eventId": event_id}))["ok"]

    parts, holders = [], []
    votes = ["Python", "Python", "Go"]
    for i in range(3):
        c = socketio.AsyncClient()
        qev, holder = asyncio.Event(), {"q": None}

        @c.on("question:show")
        async def _on_q(data, _h=holder, _e=qev):
            _h["q"] = data
            _e.set()

        await c.connect(live_server)
        await c.call("participant:join", {"code": code, "displayName": f"V{i}"})
        parts.append(c)
        holders.append((qev, holder))

    complete, cdone = {}, asyncio.Event()

    @host.on("event:complete")
    async def _on_complete(d):
        complete.update(d)
        cdone.set()

    # first poll question: everyone votes, the ack is "recorded" not scored
    for qev, _ in holders:
        qev.clear()
    await host.call("host:start", {"eventId": event_id})
    await asyncio.wait_for(asyncio.gather(*[qev.wait() for qev, _ in holders]), timeout=5)
    assert holders[0][1]["q"]["type"] == "poll"
    for idx, (c, (_qev, holder)) in enumerate(zip(parts, holders)):
        ack = await c.call("participant:answer", {"answer": votes[idx]})
        assert ack["accepted"] and ack.get("recorded") is True
        assert "correct" not in ack

    # remaining poll questions just need advancing to reach completion
    for qi in range(1, total):
        for qev, _ in holders:
            qev.clear()
        await host.call("host:next", {"eventId": event_id})
        await asyncio.wait_for(asyncio.gather(*[qev.wait() for qev, _ in holders]), timeout=5)
        for c in parts:
            await c.call("participant:answer", {"answer": "Spaces"})

    await host.call("host:end", {"eventId": event_id})
    await asyncio.wait_for(cdone.wait(), timeout=5)
    assert complete["eventType"] == "poll"
    assert complete["winner"] is None
    assert complete["leaderboard"] == []

    await host.disconnect()
    for c in parts:
        await c.disconnect()
