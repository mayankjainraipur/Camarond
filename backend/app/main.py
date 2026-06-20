"""Application entry point.

Run with:  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

The exported ``app`` is a Socket.IO ASGI app wrapping the FastAPI app, so a
single process serves both the REST API (under /api) and the WebSocket
endpoint (under /socket.io).
"""
import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import banks, events
from .config import settings
from .database import init_db
from .realtime.server import sio


def create_fastapi() -> FastAPI:
    api = FastAPI(title="Camarond — Live Event Gaming Platform")
    api.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.on_event("startup")
    def _startup() -> None:
        init_db()

    @api.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    api.include_router(banks.router)
    api.include_router(events.router)
    return api


fastapi_app = create_fastapi()

# Socket.IO wraps FastAPI; this is the object uvicorn serves.
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)
