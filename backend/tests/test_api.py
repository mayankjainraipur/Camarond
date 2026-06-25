from .conftest import SAMPLE_CSV


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_upload_and_list_banks(client):
    res = client.post(
        "/api/banks/upload?name=API%20Bank",
        files={"file": ("sample.csv", SAMPLE_CSV, "text/csv")},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["imported"] == 4
    bank_id = body["bank"]["id"]

    banks = client.get("/api/banks").json()
    assert any(b["id"] == bank_id for b in banks)


def test_create_event_defaults(client, seeded_bank):
    res = client.post("/api/events", json={"name": "Solo", "bank_id": seeded_bank})
    assert res.status_code == 200, res.text
    ev = res.json()
    assert ev["question_count"] == 4
    assert ev["team_mode"] is False
    assert ev["team_count"] == 4
    assert len(ev["code"]) == 6


def test_create_team_event_echoes_team_fields(client, seeded_bank):
    res = client.post(
        "/api/events",
        json={"name": "Teams", "bank_id": seeded_bank, "team_mode": True, "team_count": 3},
    )
    assert res.status_code == 200, res.text
    ev = res.json()
    assert ev["team_mode"] is True and ev["team_count"] == 3


def test_create_event_unknown_bank_404(client):
    res = client.post("/api/events", json={"name": "X", "bank_id": 999999})
    assert res.status_code == 404


def test_create_event_zero_matches_rejected(client, seeded_bank):
    res = client.post(
        "/api/events",
        json={"name": "Empty", "bank_id": seeded_bank, "categories": ["Nonexistent"]},
    )
    assert res.status_code == 400


def test_create_event_inverted_difficulty_rejected(client, seeded_bank):
    res = client.post(
        "/api/events",
        json={"name": "Bad", "bank_id": seeded_bank, "difficulty_min": 8, "difficulty_max": 2},
    )
    assert res.status_code == 400


def test_lookup_event_by_code(client, seeded_bank):
    ev = client.post("/api/events", json={"name": "Lookup", "bank_id": seeded_bank}).json()
    found = client.get(f"/api/events/code/{ev['code']}")
    assert found.status_code == 200
    assert found.json()["id"] == ev["id"]


def test_host_verify(client):
    assert client.post("/api/auth/host-verify", json={"password": "admin"}).status_code == 200
    assert client.post("/api/auth/host-verify", json={"password": "wrong"}).status_code == 401
