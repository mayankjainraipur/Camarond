"""End-to-end game loop over a real Socket.IO connection against a running
ASGI server, asserting the persisted report afterwards."""
import asyncio

import httpx
import socketio

from .conftest import SAMPLE_CSV

CORRECT = ["Tokyo", "True", "11", "Alexander Graham Bell"]


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
