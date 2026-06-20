# Camarond — Codebase Guide

## Project overview

Browser-based live quiz event platform. A host uploads a question bank, creates an event, and participants join via a 6-char code. Questions are served in real time with speed-bonus scoring and a live leaderboard.

**In-scope for MVP:** ≤50 concurrent participants, local hosting via ngrok, no auth.

## Architecture

```
backend/   FastAPI + python-socketio (ASGI on port 8000)
frontend/  React + TypeScript + Vite (port 5173, proxies /api and /socket.io to backend)
```

Game state lives **in memory** (`GameManager` / `GameSession`). Persistent data (banks, questions, events) goes to SQLite via SQLAlchemy. To scale later: swap SQLite → Postgres, back `GameManager` with Redis + Socket.IO Redis adapter — nothing else changes.

## Key files

| File | Purpose |
|---|---|
| `backend/app/main.py` | FastAPI app + Socket.IO ASGI mount |
| `backend/app/models.py` | SQLAlchemy models: `QuestionBank`, `Question`, `Event` |
| `backend/app/schemas.py` | Pydantic request/response shapes |
| `backend/app/api/` | REST endpoints: banks (upload/preview), events (CRUD) |
| `backend/app/realtime/events.py` | Socket.IO event-name contract — **keep in sync with `frontend/src/types/contracts.ts`** |
| `backend/app/realtime/manager.py` | In-memory `GameSession` + scoring orchestration |
| `backend/app/realtime/server.py` | Socket.IO handlers (the game loop) |
| `backend/app/services/parser.py` | XLSX/CSV → normalized questions |
| `backend/app/services/scoring.py` | Answer checking + speed-bonus rules |
| `frontend/src/pages/` | `Home`, `Host` (console), `Play` (participant) |
| `frontend/src/lib/socket.ts` | Socket.IO client singleton |
| `frontend/src/lib/api.ts` | REST helpers |
| `frontend/src/types/contracts.ts` | Socket.IO contract mirror of `events.py` |

## Running locally

```bash
# Backend
cd backend
python -m venv .venv && .venv\Scripts\Activate.ps1   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

API docs: http://localhost:8000/docs  
UI: http://localhost:5173

## Development conventions

- **Socket.IO contract:** any new event must be added to both `events.py` and `contracts.ts` together.
- **Scoring logic** lives exclusively in `services/scoring.py` — don't inline it in handlers.
- **No auth** by design (PRD decision). Don't add auth middleware without a separate PRD update.
- **Question bank format:** CSV/XLSX with columns `type`, `content`, `correct_answer`, `options` (pipe-separated, MCQ only), `category`, `difficulty`. Parser is in `services/parser.py`.
- Frontend has no global state library — socket events drive local React state via `useState`/`useEffect`.

## Tech stack versions

| Layer | Choice |
|---|---|
| Backend | FastAPI 0.115, python-socketio 5.12, SQLAlchemy 2.0, Pydantic 2.10 |
| Frontend | React 18, TypeScript 5.7, Vite 6, socket.io-client 4.8 |
| DB | SQLite (file: `backend/camarond.db`) |
