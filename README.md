# Camarond — Live Event Gaming Platform

A browser-based platform for running **live, real-time quiz events**. A host
uploads a question bank, configures an event, and shares a link/code;
participants join from any browser and compete in real time with a live
leaderboard.

It supports four question types, optional auto-balanced teams, speed-bonus
scoring, a live leaderboard, and a post-event reports dashboard — for up to ~50
concurrent participants, hosted locally and shared over ngrok.

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
    models.py          # QuestionBank, Question, Event, ParticipantResult, QuestionResponse
    schemas.py         # Pydantic request/response models (incl. reports)
    api/               # REST: banks (upload/preview), events (create/lookup), reports
      reports.py       # post-event analytics over persisted results
    realtime/
      events.py        # Socket.IO event-name contract (mirror of frontend)
      manager.py       # in-memory GameSession, scoring, team assignment, answer capture
      server.py        # Socket.IO handlers (the game loop); _complete persists results
    services/
      parser.py        # XLSX/CSV -> normalized questions
      scoring.py       # answer checking + point/speed-bonus rules
frontend/
  src/
    pages/             # Home, Host (console), Play (participant), Reports (dashboard)
    components/        # Board (leaderboard), PasswordGate (shared)
    lib/               # socket.ts, api.ts
    types/contracts.ts # Socket.IO contract (mirror of backend events.py)
Questionbank/
  sample_questions.csv # ready-to-upload test bank
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

1. Open **`/host`** → **Question Banks** → upload `Questionbank/sample_questions.csv`.
2. Go to **Events** → pick an event type (Quiz/Puzzle/Poll/Treasure Hunt),
   choose the bank (optionally enable **Team mode**) → **Create & go live**.
3. On **Live Control**, copy the join link / 6-char code.
4. Open the link in another browser/phone, enter a name, join.
5. Back on Live Control: **Start event**, then **Next question** (or **Next clue**).
6. After the event ends, open **Reports** (`/host/reports`) for the final
   standings / poll results and per-question breakdown.

## Tests

Backend tests (pytest) run against a throwaway SQLite DB, so they never touch
`camarond.db`:

```bash
cd backend
pip install -r requirements-dev.txt   # pytest, pytest-asyncio, httpx
pytest
```

They cover the scoring and parser units, `GameSession` logic (incl. team
balancing), the REST API, the reports endpoints, and a full Socket.IO game
loop end-to-end.

## Going live over the internet (ngrok)

The frontend talks to the backend same-origin (Vite proxy), so expose the
**Vite port**:

```bash
ngrok http 5173
```

Share the `https://<id>.ngrok-free.app/play?code=XXXXXX` URL with participants.
(For production you'd build the frontend and serve it behind one host with the
API.)

## Question bank format

CSV or XLSX with these columns (case-insensitive, order-independent):

| column           | required        | notes                                              |
|------------------|-----------------|----------------------------------------------------|
| `type`           | yes             | `mcq` \| `text` \| `number` \| `true_false` \| `poll` |
| `content`        | yes             | the question text                                  |
| `correct_answer` | yes (not poll)  | for `mcq`, must match one of the options; blank for `poll` |
| `options`        | mcq & poll      | pipe-separated: `Tokyo\|Seoul\|Beijing\|Osaka`     |
| `category`       | no              | defaults to "General Knowledge"                    |
| `difficulty`     | no              | integer 1–10, defaults to 1                        |
| `hint`           | no              | clue revealed in-game (puzzle / treasure hunt)     |

### Bank formats by event type

A bank is just content — the **event type** (chosen when you create the event)
decides how it's scored and shown. Use the right `type` values for the event
you intend to run:

| Event type     | `type` values             | `correct_answer` | `options` | `hint`   | Example row |
|----------------|---------------------------|------------------|-----------|----------|-------------|
| **Quiz**       | `mcq`/`text`/`number`/`true_false` | required | mcq only  | —        | `mcq,Capital of Japan?,Tokyo,Tokyo\|Seoul\|Bangkok\|Beijing,Geography,2,` |
| **Puzzle**     | `text`/`number`/`mcq`     | required         | mcq only  | optional | `text,I speak without a mouth?,echo,,Riddles,6,You repeat after others` |
| **Poll**       | `poll`                    | **blank**        | required  | —        | `poll,Best language?,,Python\|Go\|Rust\|JS,Tech,1,` |
| **Treasure Hunt** | `text`/`number`/`mcq`  | required         | mcq only  | optional | `text,Find where books sleep,library,,Clues,3,It's quiet and full of shelves` |

Notes:
- **Clues and poll questions are served in upload order** — keep treasure-hunt
  clues sequenced in the file.
- **Hints** are optional per question; the **hint penalty** (% of points lost
  when a solver reveals the hint) is set per *event*, not per question.
- **Polls are unscored** — there's no correct answer, no leaderboard; players
  see live vote distributions instead.

## Features

- **Question banks** — upload and validate CSV/XLSX banks, reuse them across
  events, and filter questions by category and difficulty.
- **Event configuration** — per-question time limit, base points, speed bonus,
  leaderboard cadence, and manual/auto advance.
- **Four event types** — **Quiz**, **Puzzle** (typed answers with optional,
  points-costing hints), **Poll** (unscored, live vote distributions), and
  **Treasure Hunt** (ordered clues with hints). All share one real-time loop.
- **Five question types** — multiple choice, true/false, text, number, and poll.
- **Real-time gameplay** — join via 6-char code, lobby, server-timed questions,
  live leaderboard, and host controls (start / next / pause / resume / end).
- **Admin dashboard** — a sidebar console (Overview, Question Banks, Events,
  Live Control, Reports, Settings) for the whole host workflow.
- **Auto-balanced teams** (optional) — the host sets a team count; joiners are
  spread evenly across teams; a team's score is the sum of its members';
  standings show teams alongside individuals.
- **Persisted results** — every completed event is saved (final standings and
  per-answer records).
- **Reports** (`/host/reports`, password-gated) — past events with final /
  team standings (or poll results), per-question correct-rate, average
  time-to-answer, and answer distribution.

### Notes & limitations

- **Auth:** a single shared host password gates the host console and reports
  (client-side gate, no per-user accounts) — by design per the PRD.
- **In-memory game loop:** live state is held in memory and results are written
  to the DB only at event completion, so a server restart mid-event loses the
  in-progress game.
- **Single instance / SQLite:** sized for ~50 participants on one process.
  Reconnection/resume mid-game, category/difficulty pickers in the create-event
  UI (the API already supports them), multi-instance scaling, and cloud
  deployment are not included.
```
