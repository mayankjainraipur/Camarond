// Thin REST helpers. Relative URLs => same-origin (Vite proxy / ngrok friendly).

export interface BankSummary {
  id: number;
  name: string;
  question_count: number;
  categories: string[];
  difficulty_range: [number, number];
}

export type EventType = "quiz" | "puzzle" | "poll" | "treasure_hunt";

export interface EventOut {
  id: number;
  name: string;
  description: string;
  code: string;
  status: string;
  event_type: EventType;
  question_count: number;
  team_mode: boolean;
  team_count: number;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function uploadBank(name: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/banks/upload?name=${encodeURIComponent(name)}`, {
    method: "POST",
    body: form,
  });
  return handle<{ bank: BankSummary; imported: number; errors: string[] }>(res);
}

export async function listBanks() {
  return handle<BankSummary[]>(await fetch("/api/banks"));
}

export interface BankQuestion {
  id: number;
  type: string;
  content: string;
  options: string[] | null;
  category: string;
  difficulty: number;
  hint: string | null;
}

export async function previewBank(bankId: number) {
  return handle<BankQuestion[]>(await fetch(`/api/banks/${bankId}/questions`));
}

export async function createEvent(payload: Record<string, unknown>) {
  const res = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<EventOut>(res);
}

export async function listEvents() {
  return handle<EventOut[]>(await fetch("/api/events"));
}

export async function getEventByCode(code: string) {
  return handle<EventOut>(await fetch(`/api/events/code/${encodeURIComponent(code)}`));
}

// --- Reports (post-event analytics) ---
export interface ReportEventSummary {
  id: number;
  name: string;
  code: string;
  event_type: EventType;
  ended_at: string | null;
  participant_count: number;
  team_mode: boolean;
  winner: string | null;
  duration_seconds: number | null;
}

export interface AnswerDistributionItem {
  answer: string;
  count: number;
}

export interface QuestionStat {
  question_index: number;
  content: string;
  type: string;
  correct_answer: string;
  response_count: number;
  correct_count: number;
  correct_rate: number; // 0..1
  avg_elapsed_seconds: number | null;
  distribution: AnswerDistributionItem[];
}

export interface ReportLeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  team: string | null;
}

export interface TeamStanding {
  rank: number;
  team: string;
  total_score: number;
  members: number;
}

export interface EventReport {
  id: number;
  name: string;
  code: string;
  event_type: EventType;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  participant_count: number;
  team_mode: boolean;
  leaderboard: ReportLeaderboardEntry[];
  team_standings: TeamStanding[];
  questions: QuestionStat[];
}

export async function listReports() {
  return handle<ReportEventSummary[]>(await fetch("/api/reports/events"));
}

export async function getReport(id: number) {
  return handle<EventReport>(await fetch(`/api/reports/events/${id}`));
}

export async function verifyHostPassword(password: string): Promise<boolean> {
  const res = await fetch("/api/auth/host-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}
