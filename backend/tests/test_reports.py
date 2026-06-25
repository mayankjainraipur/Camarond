"""Reports: drive a full game through the real flow helpers (persisting results
at completion), then assert the report endpoints read them back correctly."""
import asyncio

# correct answers in the sample bank's question order
CORRECT = ["Tokyo", "true", "11", "Alexander Graham Bell"]
WRONG = ["Seoul", "false", "0", "Nope"]


def _play(event_id, participants):
    """participants: dict of sid -> list[answer] aligned to question order."""
    from app.realtime import server as srv
    from app.realtime.manager import game_manager

    async def run():
        session = game_manager.get_or_load(event_id)
        for sid, name in [(s, s.upper()) for s in participants]:
            session.add_participant(sid, name)
        total = session.total
        for qi in range(total):
            await srv._push_next(event_id)
            for sid, answers in participants.items():
                session.submit_answer(sid, answers[qi])
        await srv._complete(event_id)

    asyncio.run(run())


def test_full_report(client, seeded_bank):
    ev = client.post(
        "/api/events",
        json={"name": "Report Quiz", "bank_id": seeded_bank, "team_mode": True, "team_count": 2},
    ).json()
    _play(ev["id"], {"p0": CORRECT, "p1": WRONG})

    # list view
    summaries = client.get("/api/reports/events").json()
    mine = next(s for s in summaries if s["id"] == ev["id"])
    assert mine["participant_count"] == 2
    assert mine["team_mode"] is True
    assert mine["winner"] == "P0"

    # detail view
    rep = client.get(f"/api/reports/events/{ev['id']}").json()
    assert rep["participant_count"] == 2
    assert rep["leaderboard"][0]["name"] == "P0"
    assert len(rep["team_standings"]) == 2
    assert len(rep["questions"]) == 4
    for q in rep["questions"]:
        assert q["response_count"] == 2
        assert q["correct_count"] == 1
        assert q["correct_rate"] == 0.5
        assert q["avg_elapsed_seconds"] is not None
    # distributions only for mcq / true_false
    by_type = {q["type"]: q for q in rep["questions"]}
    assert by_type["mcq"]["distribution"]
    assert by_type["true_false"]["distribution"]
    assert by_type["number"]["distribution"] == []
    assert by_type["text"]["distribution"] == []


POLL_CSV = (
    "type,content,correct_answer,options,category\n"
    "poll,Best language?,,Python|Go|Rust,Tech\n"
    "poll,Tabs or spaces?,,Tabs|Spaces,Tech\n"
).encode()


def test_poll_report_has_distribution_and_no_winner(client):
    bank = client.post(
        "/api/banks/upload?name=Poll%20Bank",
        files={"file": ("poll.csv", POLL_CSV, "text/csv")},
    ).json()["bank"]["id"]
    ev = client.post(
        "/api/events",
        json={"name": "Poll Event", "bank_id": bank, "event_type": "poll"},
    ).json()
    # three voters per question; majority differs to check the tally
    _play(ev["id"], {"p0": ["Python", "Tabs"], "p1": ["Python", "Spaces"], "p2": ["Go", "Tabs"]})

    summary = next(s for s in client.get("/api/reports/events").json() if s["id"] == ev["id"])
    assert summary["winner"] is None  # polls have no winner

    rep = client.get(f"/api/reports/events/{ev['id']}").json()
    assert rep["participant_count"] == 3
    q0 = rep["questions"][0]
    assert q0["type"] == "poll"
    dist = {d["answer"]: d["count"] for d in q0["distribution"]}
    assert dist["Python"] == 2 and dist["Go"] == 1
    assert q0["correct_count"] == 0  # nothing is "correct" in a poll


def test_report_missing_event_404(client):
    assert client.get("/api/reports/events/999999").status_code == 404


def test_report_for_incomplete_event_404(client, seeded_bank):
    ev = client.post("/api/events", json={"name": "Not played", "bank_id": seeded_bank}).json()
    # never played => status still "created"
    assert client.get(f"/api/reports/events/{ev['id']}").status_code == 404
