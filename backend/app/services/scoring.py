"""Answer-checking and point calculation.

Kept deliberately separate from transport/state so future game types can reuse
or replace the rules without touching the Socket.IO layer.
"""
from __future__ import annotations


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
) -> int:
    """Base points for a correct answer, plus an optional speed bonus that
    scales linearly with time remaining (full bonus = instant, zero = buzzer)."""
    if not correct:
        return 0
    if not speed_bonus or time_limit <= 0:
        return base_points
    remaining_ratio = max(0.0, (time_limit - elapsed) / time_limit)
    return base_points + round(base_points * remaining_ratio)
