"""Answer-checking and point calculation.

Kept deliberately separate from transport/state so future game types can reuse
or replace the rules without touching the Socket.IO layer.
"""
from __future__ import annotations

# Event types that award points. Polls are opinion-only — no scoring.
_UNSCORED_EVENT_TYPES = {"poll"}


def is_scored(event_type: str) -> bool:
    """Whether an event type accumulates a score / leaderboard."""
    return event_type not in _UNSCORED_EVENT_TYPES


def is_correct(qtype: str, correct_answer: str, submitted) -> bool:
    if submitted is None:
        return False
    expected = (correct_answer or "").strip().lower()
    given = str(submitted).strip().lower()

    if qtype == "number":
        try:
            return float(expected) == float(given)
        except ValueError:
            return expected == given

    if qtype == "true_false":
        truthy = {"true", "t", "yes", "1"}
        return (expected in truthy) == (given in truthy)

    # mcq + text: case-insensitive exact match on the answer text.
    return expected == given


def award_points(
    *,
    correct: bool,
    base_points: int,
    speed_bonus: bool,
    time_limit: int,
    elapsed: float,
    used_hint: bool = False,
    hint_penalty: int = 0,
) -> int:
    """Base points for a correct answer, plus an optional speed bonus that
    scales linearly with time remaining (full bonus = instant, zero = buzzer).

    If the participant revealed the hint, the total is reduced by
    ``hint_penalty`` percent (0-100). The penalty only matters for correct
    answers, since a wrong answer already earns nothing."""
    if not correct:
        return 0
    if not speed_bonus or time_limit <= 0:
        points = base_points
    else:
        remaining_ratio = max(0.0, (time_limit - elapsed) / time_limit)
        points = base_points + round(base_points * remaining_ratio)
    if used_hint and hint_penalty > 0:
        points = round(points * (1 - min(100, hint_penalty) / 100))
    return points
