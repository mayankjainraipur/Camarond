from datetime import datetime

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
    team_mode: bool = False
    team_count: int = Field(default=4, ge=2, le=12)


class EventOut(BaseModel):
    id: int
    name: str
    description: str
    code: str
    status: str
    question_count: int
    team_mode: bool = False
    team_count: int = 4


# --------------------------------------------------------------------------
# REST: reports (post-event analytics; reads persisted results)
# --------------------------------------------------------------------------
class ReportEventSummary(BaseModel):
    id: int
    name: str
    code: str
    ended_at: datetime | None
    participant_count: int
    team_mode: bool
    winner: str | None
    duration_seconds: int | None


class AnswerDistributionItem(BaseModel):
    answer: str
    count: int


class QuestionStat(BaseModel):
    question_index: int
    content: str
    type: str
    correct_answer: str
    response_count: int
    correct_count: int
    correct_rate: float  # 0.0–1.0
    avg_elapsed_seconds: float | None
    distribution: list[AnswerDistributionItem]


class ReportLeaderboardEntry(BaseModel):
    rank: int
    name: str
    score: int
    team: str | None = None


class TeamStanding(BaseModel):
    rank: int
    team: str
    total_score: int
    members: int


class EventReport(BaseModel):
    id: int
    name: str
    code: str
    started_at: datetime | None
    ended_at: datetime | None
    duration_seconds: int | None
    participant_count: int
    team_mode: bool
    leaderboard: list[ReportLeaderboardEntry]
    team_standings: list[TeamStanding]
    questions: list[QuestionStat]
