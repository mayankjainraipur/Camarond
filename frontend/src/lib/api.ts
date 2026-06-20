// Thin REST helpers. Relative URLs => same-origin (Vite proxy / ngrok friendly).

export interface BankSummary {
  id: number;
  name: string;
  question_count: number;
  categories: string[];
  difficulty_range: [number, number];
}

export interface EventOut {
  id: number;
  name: string;
  description: string;
  code: string;
  status: string;
  question_count: number;
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

export async function createEvent(payload: Record<string, unknown>) {
  const res = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<EventOut>(res);
}

export async function getEventByCode(code: string) {
  return handle<EventOut>(await fetch(`/api/events/code/${encodeURIComponent(code)}`));
}
