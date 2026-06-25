from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class QuestionBank(Base):
    __tablename__ = "question_banks"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    questions: Mapped[list["Question"]] = relationship(
        back_populates="bank", cascade="all, delete-orphan"
    )


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    bank_id: Mapped[int] = mapped_column(ForeignKey("question_banks.id"))

    # One of: mcq | text | number | true_false
    type: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    # Stored as text; correctness is compared per-type (see services/scoring.py).
    correct_answer: Mapped[str] = mapped_column(Text)
    # Only used by mcq; list of option strings.
    options: Mapped[list | None] = mapped_column(JSON, nullable=True)
    category: Mapped[str] = mapped_column(String(100), default="General Knowledge")
    difficulty: Mapped[int] = mapped_column(Integer, default=1)

    bank: Mapped["QuestionBank"] = relationship(back_populates="questions")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    bank_id: Mapped[int] = mapped_column(ForeignKey("question_banks.id"))

    # Join code participants type in (short, human-friendly).
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="created")

    # --- Question selection ---
    # null => all categories; otherwise a list of category names.
    categories: Mapped[list | None] = mapped_column(JSON, nullable=True)
    difficulty_min: Mapped[int] = mapped_column(Integer, default=1)
    difficulty_max: Mapped[int] = mapped_column(Integer, default=10)

    # --- Event rules ---
    time_limit: Mapped[int] = mapped_column(Integer, default=20)  # seconds/question
    base_points: Mapped[int] = mapped_column(Integer, default=100)
    speed_bonus: Mapped[bool] = mapped_column(default=True)
    leaderboard_after_each: Mapped[bool] = mapped_column(default=True)
    auto_advance: Mapped[bool] = mapped_column(default=False)

    # --- Team mode (auto-balanced) ---
    team_mode: Mapped[bool] = mapped_column(default=False)
    team_count: Mapped[int] = mapped_column(Integer, default=4)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    # Set when the first question goes live / when the event completes.
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ParticipantResult(Base):
    """Final standing of one participant in one completed event.

    Game state is in-memory while live; these rows are the durable snapshot
    written once at event completion (see realtime/server.py:_complete).
    """

    __tablename__ = "participant_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    name: Mapped[str] = mapped_column(String(40))
    # Team label when the event ran in team mode; null otherwise.
    team: Mapped[str | None] = mapped_column(String(60), nullable=True)
    final_score: Mapped[int] = mapped_column(Integer, default=0)
    rank: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class QuestionResponse(Base):
    """One submitted answer in a completed event.

    Keyed on the in-game question *index* (which doubles as questionId on the
    wire) and denormalizes the question text/type/correct answer so reports are
    a faithful historical snapshot even if the source bank is later edited.
    """

    __tablename__ = "question_responses"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    question_index: Mapped[int] = mapped_column(Integer)
    question_content: Mapped[str] = mapped_column(Text)
    question_type: Mapped[str] = mapped_column(String(20))
    correct_answer: Mapped[str] = mapped_column(Text)
    participant_name: Mapped[str] = mapped_column(String(40))
    submitted_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_correct: Mapped[bool] = mapped_column(default=False)
    points: Mapped[int] = mapped_column(Integer, default=0)
    elapsed_seconds: Mapped[float | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
