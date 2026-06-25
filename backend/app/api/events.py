import secrets
import string

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Event, Question, QuestionBank
from ..schemas import EventCreate, EventOut
from .deps import get_db

router = APIRouter(prefix="/api/events", tags=["events"])

_CODE_ALPHABET = string.ascii_uppercase + string.digits  # no lookalike removal for MVP


def _generate_code(db: Session) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
        if db.scalar(select(Event.id).where(Event.code == code)) is None:
            return code
    raise HTTPException(status_code=500, detail="Could not allocate a join code")


def _count_matching_questions(db: Session, event: Event) -> int:
    stmt = select(Question).where(
        Question.bank_id == event.bank_id,
        Question.difficulty >= event.difficulty_min,
        Question.difficulty <= event.difficulty_max,
    )
    if event.categories:
        stmt = stmt.where(Question.category.in_(event.categories))
    return len(db.scalars(stmt).all())


def _to_out(db: Session, event: Event) -> EventOut:
    return EventOut(
        id=event.id,
        name=event.name,
        description=event.description,
        code=event.code,
        status=event.status,
        event_type=event.event_type,
        question_count=_count_matching_questions(db, event),
        team_mode=event.team_mode,
        team_count=event.team_count,
    )


@router.post("", response_model=EventOut)
def create_event(payload: EventCreate, db: Session = Depends(get_db)):
    if db.get(QuestionBank, payload.bank_id) is None:
        raise HTTPException(status_code=404, detail="Question bank not found")
    if payload.difficulty_min > payload.difficulty_max:
        raise HTTPException(status_code=400, detail="difficulty_min cannot exceed difficulty_max")

    event = Event(
        name=payload.name,
        description=payload.description,
        bank_id=payload.bank_id,
        code=_generate_code(db),
        event_type=payload.event_type,
        categories=payload.categories,
        difficulty_min=payload.difficulty_min,
        difficulty_max=payload.difficulty_max,
        time_limit=payload.time_limit,
        base_points=payload.base_points,
        speed_bonus=payload.speed_bonus,
        leaderboard_after_each=payload.leaderboard_after_each,
        auto_advance=payload.auto_advance,
        hint_penalty=payload.hint_penalty,
        team_mode=payload.team_mode,
        team_count=payload.team_count,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    out = _to_out(db, event)
    if out.question_count == 0:
        # Not fatal — the host can still see it, but warn loudly via 422-ish detail.
        raise HTTPException(
            status_code=400,
            detail="Event created would match 0 questions; adjust category/difficulty filters.",
        )
    return out


@router.get("", response_model=list[EventOut])
def list_events(db: Session = Depends(get_db)):
    events = db.scalars(select(Event).order_by(Event.created_at.desc())).all()
    return [_to_out(db, ev) for ev in events]


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return _to_out(db, event)


@router.get("/code/{code}", response_model=EventOut)
def get_event_by_code(code: str, db: Session = Depends(get_db)):
    event = db.scalar(select(Event).where(Event.code == code.strip().upper()))
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return _to_out(db, event)
