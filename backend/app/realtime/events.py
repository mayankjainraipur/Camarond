"""Single source of truth for Socket.IO event names.

Keep this in sync with `frontend/src/types/contracts.ts`. Both files describe
the same wire contract; changing one means changing the other.
"""


class C2S:
    """Client -> Server."""

    HOST_JOIN = "host:join"
    HOST_START = "host:start"
    HOST_NEXT = "host:next"
    HOST_PAUSE = "host:pause"
    HOST_RESUME = "host:resume"
    HOST_END = "host:end"

    PARTICIPANT_JOIN = "participant:join"
    PARTICIPANT_ANSWER = "participant:answer"


class S2C:
    """Server -> Client (broadcast unless noted)."""

    EVENT_STATE = "event:state"          # full state snapshot
    LOBBY_UPDATE = "lobby:update"        # participant list/count changed
    QUESTION_SHOW = "question:show"      # new question is live
    QUESTION_LOCK = "question:lock"      # answers locked (time up / host)
    LEADERBOARD_UPDATE = "leaderboard:update"
    HOST_MONITOR = "host:monitor"        # host-only: submitted count etc.
    EVENT_COMPLETE = "event:complete"    # final leaderboard + winner
    ERROR = "error"


# --------------------------------------------------------------------------
# Team mode (auto-balanced) — additive payload fields, no new event names.
#   - participant:join ack adds  {team: int, teamLabel: str}  when team mode on
#   - lobby:update / host:monitor add  {teamMode: bool, teams: TeamEntry[]}
#   - leaderboard:update adds  {teams: TeamEntry[]}  ([] when off)
#   - event:complete adds  {teamMode: bool, teams: TeamEntry[], winningTeam}
# TeamEntry = {index, rank, name, score, members: string[]}
# --------------------------------------------------------------------------
# Event types (Phase 3) — puzzle / poll / treasure_hunt. Additive fields only,
# no new event names; the question loop is shared across all types.
#   - question:show adds  {eventType: str, hint: str|None, hintPenalty: int}
#   - lobby:update / host:monitor / event:complete add  {eventType: str}
#   - participant:answer payload adds  {usedHint: bool}  (puzzle/treasure_hunt);
#     the server applies the hint_penalty% deduction authoritatively.
#   - leaderboard:update / host:monitor add  {distribution: [{answer, count}]}
#     — the vote tally, populated for unscored poll events ([] otherwise).
#   - Poll (unscored): event:complete has winner=null and leaderboard=[];
#     answer acks return {recorded: true} instead of {correct, points}.
# --------------------------------------------------------------------------
