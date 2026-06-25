"""Shared test fixtures.

A throwaway SQLite DB is wired up BEFORE any app module is imported (config
reads DATABASE_URL at import time), so tests never touch the real camarond.db.
"""
import os
import socket
import tempfile
import threading
import time

import pytest

# --- isolate the database before app modules import config/database ---
_TMP_DIR = tempfile.mkdtemp(prefix="camarond_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DIR}/test.db"
os.environ.setdefault("HOST_PASSWORD", "admin")
os.environ.setdefault("CORS_ORIGINS", "*")

SAMPLE_CSV = (
    "type,content,correct_answer,options,category,difficulty\n"
    "mcq,Capital of Japan?,Tokyo,Tokyo|Seoul|Bangkok|Beijing,Geography,2\n"
    "true_false,The Earth orbits the Sun.,True,,Science,1\n"
    "number,Players in a cricket team?,11,,Sports,2\n"
    "text,Who invented the telephone?,Alexander Graham Bell,,History,5\n"
).encode()


@pytest.fixture(scope="session", autouse=True)
def _init_db():
    from app.database import init_db

    init_db()
    yield


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import fastapi_app

    with TestClient(fastapi_app) as c:
        yield c


@pytest.fixture()
def seeded_bank(client):
    """Upload the sample bank and return its id."""
    res = client.post(
        "/api/banks/upload?name=Test%20Bank",
        files={"file": ("sample.csv", SAMPLE_CSV, "text/csv")},
    )
    assert res.status_code == 200, res.text
    return res.json()["bank"]["id"]


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture(scope="session")
def live_server():
    """Run the real ASGI app (uvicorn) in a background thread for socket tests."""
    import uvicorn

    port = _free_port()
    config = uvicorn.Config("app.main:app", host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    deadline = time.time() + 15
    while not getattr(server, "started", False):
        if time.time() > deadline:
            raise RuntimeError("uvicorn did not start in time")
        time.sleep(0.05)

    yield f"http://127.0.0.1:{port}"

    server.should_exit = True
    thread.join(timeout=5)
