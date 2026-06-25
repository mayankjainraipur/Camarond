"""Post-event analytics. Reads the durable snapshot persisted at event
completion (ParticipantResult + QuestionResponse) — never the live game state.

Aggregation is done in Python: the data is tiny (<=50 participants x N
questions per event), which keeps this dialect-agnostic and simple.

Auth note: like the rest of the API this is server-unauthenticated; the host
password gate is enforced client-side only (token-less by design).
"""
from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Event, ParticipantResult, QuestionResponse
from ..schemas import (
    AnswerDistributionItem,
    EventReport,
    QuestionStat,
    ReportEventSummary,
    ReportLeaderboardEntry,
    TeamStanding,
)
from .deps import get_db

router = APIRouter(prefix="/api/reports", tags=["reports"])

COMPLETED = "completed"
# Question types whose answers are worth showing as a distribution.
_DISTRIBUTION_TYPES = {"mcq", "true_false"}


def _duration_seconds(event: Event) -> int | None:
    if event.started_at and event.ended_at:
        return max(0, int((event.ended_at - event.started_at).total_seconds()))
    return None


@router.get("/events", response_model=list[ReportEventSummary])
def list_reports(db: Session = Depends(get_db)):
    events = db.scalars(
        select(Event).where(Event.status == COMPLETED).order_by(Event.ended_at.desc())
    ).all()
    out: list[ReportEventSummary] = []
    for ev in events:
        results = db.scalars(
            select(ParticipantResult)
            .where(ParticipantResult.event_id == ev.id)
            .order_by(ParticipantResult.rank)
        ).all()
        winner = results[0].name if results else None
        out.append(
            ReportEventSummary(
                id=ev.id,
                name=ev.name,
                code=ev.code,
                ended_at=ev.ended_at,
                participant_count=len(results),
                team_mode=ev.team_mode,
                winner=winner,
                duration_seconds=_duration_seconds(ev),
            )
        )
    return out


@router.get("/events/{event_id}", response_model=EventReport)
def get_report(event_id: int, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if event is None or event.status != COMPLETED:
        raise HTTPException(status_code=404, detail="No completed report for this event")

    results = db.scalars(
        select(ParticipantResult)
        .where(ParticipantResult.event_id == event_id)
        .order_by(ParticipantResult.rank)
    ).all()
    responses = db.scalars(
        select(QuestionResponse).where(QuestionResponse.event_id == event_id)
    ).all()

    leaderboard = [
        ReportLeaderboardEntry(rank=r.rank, name=r.name, score=r.final_score, team=r.team)
        for r in results
    ]

    # Team standings: group persisted results by team (present only in team mode).
    team_standings: list[TeamStanding] = []
    if event.team_mode:
        totals: dict[str, int] = defaultdict(int)
        counts: dict[str, int] = defaultdict(int)
        for r in results:
            if r.team:
                totals[r.team] += r.final_score
                counts[r.team] += 1
        ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
        team_standings = [
            TeamStanding(rank=i + 1, team=team, total_score=score, members=counts[team])
            for i, (team, score) in enumerate(ranked)
        ]

    # Per-question stats, grouped by the in-game question index.
    by_index: dict[int, list[QuestionResponse]] = defaultdict(list)
    for resp in responses:
        by_index[resp.question_index].append(resp)

    questions: list[QuestionStat] = []
    for index in sorted(by_index):
        group = by_index[index]
        first = group[0]
        response_count = len(group)
        correct_count = sum(1 for r in group if r.is_correct)
        elapsed = [r.elapsed_seconds for r in group if r.elapsed_seconds is not None]
        avg_elapsed = round(sum(elapsed) / len(elapsed), 2) if elapsed else None

        distribution: list[AnswerDistributionItem] = []
        if first.question_type in _DISTRIBUTION_TYPES:
            counter = Counter(
                (r.submitted_answer if r.submitted_answer is not None else "(no answer)")
                for r in group
            )
            distribution = [
                AnswerDistributionItem(answer=ans, count=n)
                for ans, n in counter.most_common()
            ]

        questions.append(
            QuestionStat(
                question_index=index,
                content=first.question_content,
                type=first.question_type,
                correct_answer=first.correct_answer,
                response_count=response_count,
                correct_count=correct_count,
                correct_rate=(correct_count / response_count) if response_count else 0.0,
                avg_elapsed_seconds=avg_elapsed,
                distribution=distribution,
            )
        )

    return EventReport(
        id=event.id,
        name=event.name,
        code=event.code,
        started_at=event.started_at,
        ended_at=event.ended_at,
        duration_seconds=_duration_seconds(event),
        participant_count=len(results),
        team_mode=event.team_mode,
        leaderboard=leaderboard,
        team_standings=team_standings,
        questions=questions,
    )
