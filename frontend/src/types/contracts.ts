// Wire contract — keep in sync with backend/app/realtime/events.py.
// This is the manual "shared types" step: a Python backend can't share types
// with the TS frontend automatically, so the socket contract lives in both.

export const C2S = {
  HOST_JOIN: "host:join",
  HOST_START: "host:start",
  HOST_NEXT: "host:next",
  HOST_PAUSE: "host:pause",
  HOST_RESUME: "host:resume",
  HOST_END: "host:end",
  PARTICIPANT_JOIN: "participant:join",
  PARTICIPANT_ANSWER: "participant:answer",
} as const;

export const S2C = {
  EVENT_STATE: "event:state",
  LOBBY_UPDATE: "lobby:update",
  QUESTION_SHOW: "question:show",
  QUESTION_LOCK: "question:lock",
  LEADERBOARD_UPDATE: "leaderboard:update",
  HOST_MONITOR: "host:monitor",
  EVENT_COMPLETE: "event:complete",
  ERROR: "error",
} as const;

export type QuestionType = "mcq" | "text" | "number" | "true_false" | "poll";
export type EventType = "quiz" | "puzzle" | "poll" | "treasure_hunt";

// A single answer tally (poll results / answer distribution).
export interface DistributionItem {
  answer: string;
  count: number;
}

export interface QuestionShow {
  eventId: number;
  eventType?: EventType;
  index: number;
  total: number;
  questionId: number;
  type: QuestionType;
  content: string;
  options: string[] | null;
  hint?: string | null;
  hintPenalty?: number; // percent forfeited if the hint is revealed
  timeLimit: number;
  startedAt: number;
}

// Team standings row (auto-balanced team mode). Present only when team mode
// is on; a superset of LeaderboardEntry so it renders in the same <Board />.
export interface TeamEntry {
  index: number;
  rank: number;
  name: string;
  score: number;
  members: string[];
}

export interface LobbyState {
  eventId: number;
  eventName: string;
  eventType?: EventType;
  state: string;
  participantCount: number;
  participants: string[];
  total: number;
  teamMode?: boolean;
  teams?: TeamEntry[];
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  team?: string; // team label in team mode; absent otherwise
}

// Payload of S2C.LEADERBOARD_UPDATE.
export interface LeaderboardUpdate {
  eventId: number;
  eventType?: EventType;
  entries: LeaderboardEntry[];
  teams?: TeamEntry[];
  // Vote tally of the just-locked question; populated for polls ([] otherwise).
  distribution?: DistributionItem[];
}

export interface MonitorState {
  eventId: number;
  eventType?: EventType;
  state: string;
  index: number;
  total: number;
  participantCount: number;
  answeredCount: number;
  // host-only: the correct answer for the current question (never sent to players).
  correctAnswer?: string | null;
  hint?: string | null;
  // host-only live vote tally for polls.
  distribution?: DistributionItem[];
  // host-only preview of the next question; null once the bank is exhausted.
  upcoming?: UpcomingQuestion | null;
  teamMode?: boolean;
  teams?: TeamEntry[];
}

// host-only peek at the next question/clue (shown under "Now on air").
export interface UpcomingQuestion {
  index: number;
  type: QuestionType;
  content: string;
}

export interface EventComplete {
  eventId: number;
  eventType?: EventType;
  leaderboard: LeaderboardEntry[];
  winner: LeaderboardEntry | null;
  teamMode?: boolean;
  teams?: TeamEntry[];
  winningTeam?: TeamEntry | null;
}
