# Camarond — Codebase Guide

## Project overview

Browser-based live event platform. A host uploads a question bank, creates an event, and participants join via a 6-char code. Questions/clues are served in real time with speed-bonus scoring and a live leaderboard. Supports four **event types** — Quiz, Puzzle (typed answers + points-costing hints), Poll (unscored, live vote distributions), and Treasure Hunt (ordered clues + hints) — plus optional auto-balanced teams, persisted results, and a post-event reports dashboard. All event types share one host-paced question loop.

**Scope:** up to ~50 concurrent participants on a single process, local hosting via ngrok. No per-user auth — the host console and reports share one password (client-side gate). Multi-instance scaling and cloud deployment are out of scope.

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
| `backend/app/models.py` | SQLAlchemy models: `QuestionBank`, `Question`, `Event`, `ParticipantResult`, `QuestionResponse` |
| `backend/app/schemas.py` | Pydantic request/response shapes (incl. report schemas) |
| `backend/app/api/` | REST endpoints: banks (upload/preview), events (CRUD), reports (post-event analytics) |
| `backend/app/api/reports.py` | Report queries over persisted results (final standings + per-question stats) |
| `backend/app/realtime/events.py` | Socket.IO event-name contract — **keep in sync with `frontend/src/types/contracts.ts`** |
| `backend/app/realtime/manager.py` | In-memory `GameSession`, scoring orchestration, team assignment, per-answer capture |
| `backend/app/realtime/server.py` | Socket.IO handlers (the game loop); `_complete()` persists the final snapshot |
| `backend/app/services/parser.py` | XLSX/CSV → normalized questions |
| `backend/app/services/scoring.py` | Answer checking + speed-bonus rules |
| `frontend/src/pages/` | `Home`, `Play` (participant); host dashboard under `pages/host/` |
| `frontend/src/pages/host/` | `DashboardLayout` (sidebar shell + `useHost` live-event context) and sections: `Overview`, `Banks`, `Events` (event-type picker), `LiveControl`, `ReportsView`, `Settings` |
| `frontend/src/components/` | Shared `Board` (leaderboard), `PollResults` (vote bars), `PasswordGate` |
| `frontend/src/lib/socket.ts` | Socket.IO client singleton |
| `frontend/src/lib/api.ts` | REST helpers (banks/preview, events list/CRUD, reports, host-verify) |
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

## Tests

```bash
cd backend
pip install -r requirements-dev.txt   # pytest, pytest-asyncio, httpx
pytest
```

Tests live in `backend/tests/` and run against a temp SQLite DB (never `camarond.db`). `conftest.py` provides the temp-DB, `TestClient`, seeded-bank, and background-uvicorn `live_server` fixtures. Coverage: scoring/parser units (incl. hint penalty + poll parsing), `GameSession` (team logic, poll voting/distribution, hints/ordering), REST API (all event types), reports endpoints (incl. poll distribution), and Socket.IO game-loop E2Es (quiz + poll). No frontend test setup yet.

## Development conventions

- **Socket.IO contract:** any new event must be added to both `events.py` and `contracts.ts` together. Team mode and the Phase-3 event types add *fields* to existing payloads (no new event names) — see the comment blocks at the bottom of `events.py`.
- **Event types** live on `Event.event_type` (`quiz`/`puzzle`/`poll`/`treasure_hunt`); the loop is shared. `GameSession.scored` (via `scoring.is_scored`) is the single branch point: polls are unscored (record votes, no points, reveal a `distribution`); scored types use `is_correct` + `award_points`. Clues/poll questions load in upload order (`_load()` orders by `Question.id`).
- **Hints:** puzzle/treasure-hunt questions may carry a `hint`; revealing it (client sends `usedHint: true` on `participant:answer`) deducts `Event.hint_penalty`% via `award_points`.
- **Scoring logic** lives exclusively in `services/scoring.py` — don't inline it in handlers.
- **No auth** by design (PRD decision). The host console and reports page share a single password gate (`/api/auth/host-verify`), enforced client-side only — there's no session token. Don't add auth middleware without a separate PRD update.
- **Results persistence:** the live game is in memory; results are written to the DB only at event completion (`server.py:_complete`, idempotent). A mid-event restart loses the in-progress game. Reports read exclusively from these persisted rows.
- **Team mode** is auto-balanced (`manager.py:_assign_team`): joiners go to the smallest team. Team score = sum of member scores. Team mode off is a strict no-op.
- **Schema migrations:** none (no Alembic). New columns require recreating the local `camarond.db` or a manual `ALTER TABLE`. Phase 3 added `Event.event_type`, `Event.hint_penalty`, and `Question.hint` — delete `camarond.db` once to pick them up.
- **Question bank format:** CSV/XLSX with columns `type` (`mcq`/`text`/`number`/`true_false`/`poll`), `content`, `correct_answer` (blank for poll), `options` (pipe-separated, mcq & poll), `category`, `difficulty`, `hint` (optional, puzzle/treasure-hunt). Parser is in `services/parser.py`. See README for per-event-type bank formats.
- Frontend has no global state library — socket events drive local React state via `useState`/`useEffect`.

## Tech stack versions

| Layer | Choice |
|---|---|
| Backend | FastAPI 0.115, python-socketio 5.12, SQLAlchemy 2.0, Pydantic 2.10 |
| Frontend | React 18, TypeScript 5.7, Vite 6, socket.io-client 4.8 |
| DB | SQLite (file: `backend/camarond.db`) |
