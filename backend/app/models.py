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

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
