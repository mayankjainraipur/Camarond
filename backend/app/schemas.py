from pydantic import BaseModel, Field


# --------------------------------------------------------------------------
# REST: question banks
# --------------------------------------------------------------------------
class QuestionOut(BaseModel):
    id: int
    type: str
    content: str
    options: list[str] | None
    category: str
    difficulty: int

    class Config:
        from_attributes = True


class BankSummary(BaseModel):
    id: int
    name: str
    question_count: int
    categories: list[str]
    difficulty_range: tuple[int, int]


class UploadResult(BaseModel):
    bank: BankSummary
    imported: int
    errors: list[str]


# --------------------------------------------------------------------------
# REST: events
# --------------------------------------------------------------------------
class EventCreate(BaseModel):
    name: str
    description: str = ""
    bank_id: int
    categories: list[str] | None = None  # None => all
    difficulty_min: int = Field(default=1, ge=1, le=10)
    difficulty_max: int = Field(default=10, ge=1, le=10)
    time_limit: int = Field(default=20, ge=5, le=300)
    base_points: int = Field(default=100, ge=1)
    speed_bonus: bool = True
    leaderboard_after_each: bool = True
    auto_advance: bool = False


class EventOut(BaseModel):
    id: int
    name: str
    description: str
    code: str
    status: str
    question_count: int
