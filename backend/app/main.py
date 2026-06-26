"""Application entry point.

Run with:  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

The exported ``app`` is a Socket.IO ASGI app wrapping the FastAPI app, so a
single process serves both the REST API (under /api) and the WebSocket
endpoint (under /socket.io).
"""
import os
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import auth, banks, events, reports
from .config import settings
from .database import init_db
from .realtime.server import sio

# Directory holding the built frontend (Vite `dist`). Set in the Docker image;
# absent during local backend-only dev, in which case static serving is skipped.
STATIC_DIR = os.getenv("FRONTEND_DIST", "/app/static")


def create_fastapi() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        init_db()
        yield

    api = FastAPI(title="Camarond — Live Event Gaming Platform", lifespan=lifespan)
    api.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    api.include_router(auth.router)
    api.include_router(banks.router)
    api.include_router(events.router)
    api.include_router(reports.router)

    # Serve the built single-page frontend, if present. Registered last so the
    # /api routers (and the Socket.IO mount that wraps this app) keep priority.
    # The SPA uses client-side routing, so any non-/api path falls back to
    # index.html; hashed assets under /assets are served directly.
    if os.path.isdir(STATIC_DIR):
        api.mount(
            "/assets",
            StaticFiles(directory=os.path.join(STATIC_DIR, "assets")),
            name="assets",
        )

        @api.get("/{full_path:path}")
        def spa_fallback(full_path: str):
            file_path = os.path.join(STATIC_DIR, full_path)
            if full_path and os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(os.path.join(STATIC_DIR, "index.html"))

    return api


fastapi_app = create_fastapi()

# Socket.IO wraps FastAPI; this is the object uvicorn serves.
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)
