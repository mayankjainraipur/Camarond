from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Question, QuestionBank
from ..schemas import BankSummary, QuestionOut, UploadResult
from ..services.parser import parse_questions
from .deps import get_db

router = APIRouter(prefix="/api/banks", tags=["banks"])


def _summary(db: Session, bank: QuestionBank) -> BankSummary:
    questions = db.scalars(
        select(Question).where(Question.bank_id == bank.id)
    ).all()
    categories = sorted({q.category for q in questions})
    difficulties = [q.difficulty for q in questions] or [1]
    return BankSummary(
        id=bank.id,
        name=bank.name,
        question_count=len(questions),
        categories=categories,
        difficulty_range=(min(difficulties), max(difficulties)),
    )


@router.post("/upload", response_model=UploadResult)
async def upload_bank(
    name: str = "",
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    raw = await file.read()
    try:
        questions, errors = parse_questions(file.filename or "upload", raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not questions:
        raise HTTPException(
            status_code=400,
            detail="No valid questions found. " + " ".join(errors),
        )

    bank = QuestionBank(name=name.strip() or (file.filename or "Question Bank"))
    db.add(bank)
    db.flush()  # assign bank.id

    db.add_all(
        Question(
            bank_id=bank.id,
            type=q["type"],
            content=q["content"],
            correct_answer=q["correct_answer"],
            options=q["options"],
            category=q["category"],
            difficulty=q["difficulty"],
            hint=q.get("hint"),
        )
        for q in questions
    )
    db.commit()

    return UploadResult(bank=_summary(db, bank), imported=len(questions), errors=errors)


@router.get("", response_model=list[BankSummary])
def list_banks(db: Session = Depends(get_db)):
    banks = db.scalars(select(QuestionBank).order_by(QuestionBank.created_at.desc())).all()
    return [_summary(db, b) for b in banks]


@router.get("/{bank_id}/questions", response_model=list[QuestionOut])
def preview_bank(bank_id: int, db: Session = Depends(get_db)):
    if db.get(QuestionBank, bank_id) is None:
        raise HTTPException(status_code=404, detail="Bank not found")
    return db.scalars(select(Question).where(Question.bank_id == bank_id)).all()
