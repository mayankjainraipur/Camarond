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

    state: str = LOBBY
    index: int = -1            # current question index (-1 = not started)
    started_at: float = 0.0    # server timestamp the current question went live
    participants: dict[str, Participant] = field(default_factory=dict)

    # ---- participants -----------------------------------------------------
    def add_participant(self, sid: str, name: str) -> Participant:
        p = Participant(sid=sid, name=name.strip()[:40] or "Player")
        self.participants[sid] = p
        return p

    def remove_participant(self, sid: str) -> None:
        self.participants.pop(sid, None)

    # ---- question access --------------------------------------------------
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
    def submit_answer(self, sid: str, answer) -> dict:
        p = self.participants.get(sid)
        q = self.current_question()
        if p is None or q is None or self.state != QUESTION:
            return {"accepted": False, "reason": "not_accepting_answers"}
        if p.answered_index == self.index:
            return {"accepted": False, "reason": "already_answered"}

        elapsed = time.time() - self.started_at
        correct = scoring.is_correct(q["type"], q["correct_answer"], answer)
        gained = scoring.award_points(
            correct=correct,
            base_points=self.base_points,
            speed_bonus=self.speed_bonus,
            time_limit=self.time_limit,
            elapsed=elapsed,
        )
        p.score += gained
        p.answered_index = self.index
        return {"accepted": True, "correct": correct, "points": gained}

    def answered_count(self) -> int:
        return sum(1 for p in self.participants.values() if p.answered_index == self.index)

    # ---- serializable payloads -------------------------------------------
    def question_payload(self) -> dict:
        """What participants see — deliberately omits the correct answer."""
        q = self.current_question() or {}
        return {
            "eventId": self.event_id,
            "index": self.index,
            "total": self.total,
            "questionId": self.index,  # index doubles as the per-game question id
            "type": q.get("type"),
            "content": q.get("content"),
            "options": q.get("options"),
            "timeLimit": self.time_limit,
            "startedAt": self.started_at,
        }

    def lobby_state(self) -> dict:
        return {
            "eventId": self.event_id,
            "eventName": self.event_name,
            "state": self.state,
            "participantCount": len(self.participants),
            "participants": [p.name for p in self.participants.values()],
            "total": self.total,
        }

    def leaderboard(self) -> list[dict]:
        ranked = sorted(self.participants.values(), key=lambda p: p.score, reverse=True)
        return [
            {"rank": i + 1, "name": p.name, "score": p.score}
            for i, p in enumerate(ranked)
        ]

    def monitor_state(self) -> dict:
        # host-only channel — safe to include the correct answer here so the
        # host can see it under the live question (never sent to participants).
        q = self.current_question()
        return {
            "eventId": self.event_id,
            "state": self.state,
            "index": self.index,
            "total": self.total,
            "participantCount": len(self.participants),
            "answeredCount": self.answered_count(),
            "correctAnswer": q.get("correct_answer") if q else None,
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

            stmt = select(Question).where(
                Question.bank_id == event.bank_id,
                Question.difficulty >= event.difficulty_min,
                Question.difficulty <= event.difficulty_max,
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
                }
                for q in db.scalars(stmt).all()
            ]

            return GameSession(
                event_id=event.id,
                event_name=event.name,
                time_limit=event.time_limit,
                base_points=event.base_points,
                speed_bonus=event.speed_bonus,
                leaderboard_after_each=event.leaderboard_after_each,
                auto_advance=event.auto_advance,
                questions=questions,
                state=COMPLETED if event.status == COMPLETED else LOBBY,
            )


game_manager = GameManager()
