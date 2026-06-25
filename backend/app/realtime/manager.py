"""In-memory live game state.

For the MVP's scale (<=50 participants per event) keeping the active game in
memory is the right call: it's simple and fast. Persistent data (banks,
events, questions) lives in the DB; only the *running* game is here.

To scale to multiple server instances later, this is the component you'd back
with Redis (shared state + a Socket.IO Redis manager). Nothing else needs to
change.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

from sqlalchemy import select

from ..database import SessionLocal
from ..models import Event, Question
from ..services import scoring

# Event lifecycle states.
LOBBY = "lobby"
QUESTION = "question"
LOCKED = "locked"
PAUSED = "paused"
COMPLETED = "completed"


@dataclass
class Participant:
    sid: str
    name: str
    score: int = 0
    answered_index: int = -1  # last question index this participant answered
    team: int = -1            # 0-based team index; -1 when team mode is off


@dataclass
class GameSession:
    event_id: int
    event_name: str
    time_limit: int
    base_points: int
    speed_bonus: bool
    leaderboard_after_each: bool
    auto_advance: bool
    questions: list[dict]  # normalized question dicts, including correct_answer

    # Event type governs scoring + reveal behaviour. "quiz" is the default and
    # the only scored-with-no-hints type; "puzzle"/"treasure_hunt" add hints;
    # "poll" is unscored (opinion only).
    event_type: str = "quiz"
    hint_penalty: int = 0  # percent of points forfeited when a hint is used

    # Team mode: 0-based teams labelled "Team 1".."Team N". team_count is 0
    # when team mode is off, which makes every team code path a no-op.
    team_mode: bool = False
    team_count: int = 0

    state: str = LOBBY
    index: int = -1            # current question index (-1 = not started)
    started_at: float = 0.0    # server timestamp the current question went live
    participants: dict[str, Participant] = field(default_factory=dict)

    # --- result capture (persisted once at completion) ---
    # question index -> list of answer records
    responses: dict[int, list[dict]] = field(default_factory=dict)
    # question index -> {content, type, correct_answer} snapshot taken when shown
    shown: dict[int, dict] = field(default_factory=dict)
    persisted: bool = False    # guards against double-writing on re-complete

    # ---- participants -----------------------------------------------------
    def add_participant(self, sid: str, name: str) -> Participant:
        p = Participant(sid=sid, name=name.strip()[:40] or "Player")
        if self.team_mode and self.team_count > 0:
            # Assign before inserting so the joiner isn't counted against itself.
            p.team = self._assign_team()
        self.participants[sid] = p
        return p

    def remove_participant(self, sid: str) -> None:
        self.participants.pop(sid, None)

    # ---- teams ------------------------------------------------------------
    def _assign_team(self) -> int:
        """Pick the team with the fewest current members (ties -> lowest index)."""
        counts = [0] * self.team_count
        for p in self.participants.values():
            if 0 <= p.team < self.team_count:
                counts[p.team] += 1
        return min(range(self.team_count), key=lambda i: (counts[i], i))

    def team_label(self, index: int) -> str:
        return f"Team {index + 1}"

    def team_leaderboard(self) -> list[dict]:
        """Ranked team standings (sum of member scores). Empty when team mode
        is off; otherwise always returns all N teams (empty ones rank last)."""
        if not self.team_mode or self.team_count <= 0:
            return []
        scores = [0] * self.team_count
        members: list[list[str]] = [[] for _ in range(self.team_count)]
        for p in self.participants.values():
            if 0 <= p.team < self.team_count:
                scores[p.team] += p.score
                members[p.team].append(p.name)
        rows = [
            {
                "index": i,
                "name": self.team_label(i),
                "score": scores[i],
                "members": members[i],
            }
            for i in range(self.team_count)
        ]
        rows.sort(key=lambda r: r["score"], reverse=True)
        for rank, r in enumerate(rows, start=1):
            r["rank"] = rank
        return rows

    # ---- question access --------------------------------------------------
    @property
    def scored(self) -> bool:
        return scoring.is_scored(self.event_type)

    @property
    def total(self) -> int:
        return len(self.questions)

    def current_question(self) -> dict | None:
        if 0 <= self.index < self.total:
            return self.questions[self.index]
        return None

    # ---- lifecycle --------------------------------------------------------
    def show_next(self) -> dict | None:
        """Advance to the next question and mark it live. Returns the question
        or None when the bank is exhausted (caller should complete the event)."""
        self.index += 1
        q = self.current_question()
        if q is None:
            self.state = COMPLETED
            return None
        self.state = QUESTION
        self.started_at = time.time()
        # Snapshot the question for the durable report (denormalized).
        self.shown[self.index] = {
            "content": q.get("content", ""),
            "type": q.get("type", ""),
            "correct_answer": q.get("correct_answer", ""),
        }
        return q

    def lock(self) -> None:
        if self.state == QUESTION:
            self.state = LOCKED

    def pause(self) -> None:
        if self.state == QUESTION:
            self.state = PAUSED

    def resume(self) -> None:
        if self.state == PAUSED:
            self.state = QUESTION

    def complete(self) -> None:
        self.state = COMPLETED

    # ---- answers ----------------------------------------------------------
    def submit_answer(self, sid: str, answer, used_hint: bool = False) -> dict:
        p = self.participants.get(sid)
        q = self.current_question()
        if p is None or q is None or self.state != QUESTION:
            return {"accepted": False, "reason": "not_accepting_answers"}
        if p.answered_index == self.index:
            return {"accepted": False, "reason": "already_answered"}

        elapsed = time.time() - self.started_at
        p.answered_index = self.index

        if not self.scored:
            # Poll: record the vote, no correctness, no points.
            self.responses.setdefault(self.index, []).append(
                {
                    "participant_name": p.name,
                    "submitted_answer": str(answer) if answer is not None else None,
                    "is_correct": False,
                    "points": 0,
                    "elapsed_seconds": round(elapsed, 3),
                }
            )
            return {"accepted": True, "recorded": True}

        correct = scoring.is_correct(q["type"], q["correct_answer"], answer)
        gained = scoring.award_points(
            correct=correct,
            base_points=self.base_points,
            speed_bonus=self.speed_bonus,
            time_limit=self.time_limit,
            elapsed=elapsed,
            used_hint=used_hint,
            hint_penalty=self.hint_penalty,
        )
        p.score += gained
        # Record for the durable report. The already_answered guard above
        # ensures exactly one record per participant per question.
        self.responses.setdefault(self.index, []).append(
            {
                "participant_name": p.name,
                "submitted_answer": str(answer) if answer is not None else None,
                "is_correct": correct,
                "points": gained,
                "elapsed_seconds": round(elapsed, 3),
            }
        )
        return {"accepted": True, "correct": correct, "points": gained, "usedHint": used_hint}

    def answered_count(self) -> int:
        return sum(1 for p in self.participants.values() if p.answered_index == self.index)

    def distribution(self, index: int | None = None) -> list[dict]:
        """Tally of submitted answers for a question (defaults to current),
        ordered most-voted first. Drives the poll results view."""
        if index is None:
            index = self.index
        counts: dict[str, int] = {}
        for r in self.responses.get(index, []):
            ans = r["submitted_answer"] if r["submitted_answer"] is not None else "(no answer)"
            counts[ans] = counts.get(ans, 0) + 1
        rows = [{"answer": ans, "count": n} for ans, n in counts.items()]
        rows.sort(key=lambda r: r["count"], reverse=True)
        return rows

    # ---- serializable payloads -------------------------------------------
    def question_payload(self) -> dict:
        """What participants see — deliberately omits the correct answer."""
        q = self.current_question() or {}
        return {
            "eventId": self.event_id,
            "eventType": self.event_type,
            "index": self.index,
            "total": self.total,
            "questionId": self.index,  # index doubles as the per-game question id
            "type": q.get("type"),
            "content": q.get("content"),
            "options": q.get("options"),
            "hint": q.get("hint"),
            "hintPenalty": self.hint_penalty,
            "timeLimit": self.time_limit,
            "startedAt": self.started_at,
        }

    def lobby_state(self) -> dict:
        return {
            "eventId": self.event_id,
            "eventName": self.event_name,
            "eventType": self.event_type,
            "state": self.state,
            "participantCount": len(self.participants),
            "participants": [p.name for p in self.participants.values()],
            "total": self.total,
            "teamMode": self.team_mode,
            "teams": self.team_leaderboard(),
        }

    def leaderboard(self) -> list[dict]:
        ranked = sorted(self.participants.values(), key=lambda p: p.score, reverse=True)
        rows = []
        for i, p in enumerate(ranked):
            row = {"rank": i + 1, "name": p.name, "score": p.score}
            if self.team_mode and 0 <= p.team < self.team_count:
                row["team"] = self.team_label(p.team)
            rows.append(row)
        return rows

    def monitor_state(self) -> dict:
        # host-only channel — safe to include the correct answer here so the
        # host can see it under the live question (never sent to participants).
        q = self.current_question()
        return {
            "eventId": self.event_id,
            "eventType": self.event_type,
            "state": self.state,
            "index": self.index,
            "total": self.total,
            "participantCount": len(self.participants),
            "answeredCount": self.answered_count(),
            "correctAnswer": q.get("correct_answer") if q else None,
            "hint": q.get("hint") if q else None,
            # Live vote tally for polls; the host watches it accumulate.
            "distribution": self.distribution() if not self.scored else [],
            "teamMode": self.team_mode,
            "teams": self.team_leaderboard(),
        }


class GameManager:
    """Owns all live sessions, keyed by event id."""

    def __init__(self) -> None:
        self._sessions: dict[int, GameSession] = {}

    def get(self, event_id: int) -> GameSession | None:
        return self._sessions.get(event_id)

    def get_or_load(self, event_id: int) -> GameSession | None:
        """Return the live session, loading event config + questions from the
        DB on first access."""
        if event_id in self._sessions:
            return self._sessions[event_id]
        session = self._load(event_id)
        if session is not None:
            self._sessions[event_id] = session
        return session

    def drop(self, event_id: int) -> None:
        self._sessions.pop(event_id, None)

    def _load(self, event_id: int) -> GameSession | None:
        with SessionLocal() as db:
            event = db.get(Event, event_id)
            if event is None:
                return None

            stmt = (
                select(Question)
                .where(
                    Question.bank_id == event.bank_id,
                    Question.difficulty >= event.difficulty_min,
                    Question.difficulty <= event.difficulty_max,
                )
                # Preserve upload order — essential for treasure-hunt clue trails.
                .order_by(Question.id)
            )
            if event.categories:
                stmt = stmt.where(Question.category.in_(event.categories))

            questions = [
                {
                    "type": q.type,
                    "content": q.content,
                    "correct_answer": q.correct_answer,
                    "options": q.options,
                    "category": q.category,
                    "difficulty": q.difficulty,
                    "hint": q.hint,
                }
                for q in db.scalars(stmt).all()
            ]

            return GameSession(
                event_id=event.id,
                event_name=event.name,
                event_type=event.event_type,
                hint_penalty=event.hint_penalty,
                time_limit=event.time_limit,
                base_points=event.base_points,
                speed_bonus=event.speed_bonus,
                leaderboard_after_each=event.leaderboard_after_each,
                auto_advance=event.auto_advance,
                team_mode=event.team_mode,
                team_count=event.team_count if event.team_mode else 0,
                questions=questions,
                state=COMPLETED if event.status == COMPLETED else LOBBY,
            )


game_manager = GameManager()
