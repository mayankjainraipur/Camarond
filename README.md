# Camarond — Live Event Gaming Platform (MVP)

A browser-based platform for running **live, real-time quiz events**. A host
uploads a question bank, configures an event, and shares a link/code;
participants join from any browser and compete in real time with a live
leaderboard.

This is the MVP scaffold described in the PRD — Quiz events, ≤50 concurrent
participants, local hosting via ngrok.

## Tech stack

| Layer        | Choice                                  |
|--------------|-----------------------------------------|
| Backend      | FastAPI + python-socketio (ASGI)        |
| Realtime     | Socket.IO (rooms = events)              |
| Data         | SQLAlchemy + SQLite (swap to Postgres later) |
| Validation   | Pydantic                                |
| File upload  | pandas + openpyxl (XLSX/CSV)            |
| Frontend     | React + TypeScript + Vite               |
| Realtime client | socket.io-client                     |

The live game state runs **in memory** (perfect for ≤50 players). Persistent
data (banks, questions, events) lives in the DB. To scale to multiple server
instances later, back `GameManager` with Redis + the Socket.IO Redis manager —
nothing else changes.

## Project layout

```
backend/
  app/
    main.py            # FastAPI + Socket.IO ASGI app
    config.py          # env-driven settings
    database.py        # SQLAlchemy engine/session
    models.py          # QuestionBank, Question, Event
    schemas.py         # Pydantic request/response models
    api/               # REST: banks (upload/preview), events (create/lookup)
    realtime/
      events.py        # Socket.IO event-name contract (mirror of frontend)
      manager.py       # in-memory GameSession + scoring orchestration
      server.py        # Socket.IO handlers (the game loop)
    services/
      parser.py        # XLSX/CSV -> normalized questions
      scoring.py       # answer checking + point/speed-bonus rules
frontend/
  src/
    pages/             # Home, Host (console), Play (participant)
    lib/               # socket.ts, api.ts
    types/contracts.ts # Socket.IO contract (mirror of backend events.py)
sample_questions.csv   # ready-to-upload test bank
```

## Run it locally

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell:  .venv\Scripts\Activate.ps1
# macOS/Linux:         source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # optional; defaults work out of the box
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs at http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` and `/socket.io` to the backend.

### 3. Try it

1. Go to **Host console** → upload `sample_questions.csv` → create event.
2. Copy the join link / 6-char code.
3. Open the link in another browser/phone, enter a name, join.
4. Back in the host console: **Start event**, then **Next question**.

## Going live over the internet (ngrok)

The frontend talks to the backend same-origin (Vite proxy), so expose the
**Vite port**:

```bash
ngrok http 5173
```

Share the `https://<id>.ngrok-free.app/play?code=XXXXXX` URL with participants.
(For production you'd build the frontend and serve it behind one host with the
API; ngrok on the dev server is the MVP path from the PRD.)

## Question bank format

CSV or XLSX with these columns (case-insensitive):

| column           | required | notes                                            |
|------------------|----------|--------------------------------------------------|
| `type`           | yes      | `mcq` \| `text` \| `number` \| `true_false`      |
| `content`        | yes      | the question text                                |
| `correct_answer` | yes      | for `mcq`, must match one of the options         |
| `options`        | mcq only | pipe-separated: `Tokyo\|Seoul\|Beijing\|Osaka`   |
| `category`       | no       | defaults to "General Knowledge"                  |
| `difficulty`     | no       | integer 1–10, defaults to 1                      |

## What's implemented vs. stubbed

**Working end-to-end:** upload/validate banks, create events with
category+difficulty filters, join via code, lobby, server-timed questions, all
4 question types, speed-bonus scoring, live leaderboard, host controls
(start/next/pause/resume/end), final results.

**Intentionally minimal for MVP (extend as needed):** auth (none — by design
per PRD), reconnection/resume mid-game, bank category/difficulty pickers in the
create-event UI (the API already supports them), persistence of per-participant
results to the DB (only final event status is persisted).
```
