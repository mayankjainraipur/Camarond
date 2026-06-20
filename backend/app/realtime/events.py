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
