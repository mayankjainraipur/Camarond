// Build a CSV export of an EventReport. Pure functions, no DOM/IO — the
// caller hands the result to saveTextFile(). Columns adapt by event type:
// polls export vote distributions, scored events export standings + per-question
// correctness.
import { EventReport } from "./api";

// RFC-4180: quote fields containing comma, quote, CR or LF; double internal quotes.
function escape(field: string | number): string {
  const s = String(field);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(...cells: (string | number)[]): string {
  return cells.map(escape).join(",");
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function pct(rate0to1: number): string {
  return `${Math.round(rate0to1 * 100)}%`;
}

/** Slugified filename, e.g. "Friday Quiz!" -> "friday-quiz-report.csv". */
export function csvFilename(report: EventReport): string {
  const slug = report.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "event"}-report.csv`;
}

export function reportToCsv(report: EventReport): string {
  const isPoll = report.event_type === "poll";
  const lines: string[] = [];

  // Summary header.
  lines.push(row("Event", report.name));
  lines.push(row("Type", report.event_type));
  lines.push(row(isPoll ? "Voters" : "Players", report.participant_count));
  lines.push(row("Duration", fmtDuration(report.duration_seconds)));
  lines.push(row("Ended", fmtDate(report.ended_at)));

  if (isPoll) {
    // Poll results: one row per option.
    lines.push("");
    lines.push("POLL RESULTS");
    lines.push(row("Poll#", "Question", "Option", "Votes", "% of Votes"));
    for (const q of report.questions) {
      const total = q.distribution.reduce((sum, d) => sum + d.count, 0);
      for (const d of q.distribution) {
        const share = total > 0 ? pct(d.count / total) : "0%";
        lines.push(row(q.question_index + 1, q.content, d.answer, d.count, share));
      }
    }
    return lines.join("\r\n");
  }

  // Scored events: standings, optional team standings, per-question breakdown.
  lines.push("");
  lines.push("STANDINGS");
  if (report.team_mode) {
    lines.push(row("Rank", "Name", "Score", "Team"));
    for (const e of report.leaderboard) {
      lines.push(row(e.rank, e.name, e.score, e.team ?? ""));
    }
  } else {
    lines.push(row("Rank", "Name", "Score"));
    for (const e of report.leaderboard) {
      lines.push(row(e.rank, e.name, e.score));
    }
  }

  if (report.team_mode && report.team_standings.length > 0) {
    lines.push("");
    lines.push("TEAM STANDINGS");
    lines.push(row("Rank", "Team", "Score", "Members"));
    for (const t of report.team_standings) {
      lines.push(row(t.rank, t.team, t.total_score, t.members));
    }
  }

  lines.push("");
  lines.push("PER-QUESTION BREAKDOWN");
  lines.push(row("Q#", "Question", "Correct Answer", "Correct %", "Correct", "Responses", "Avg Time (s)"));
  for (const q of report.questions) {
    lines.push(
      row(
        q.question_index + 1,
        q.content,
        q.correct_answer,
        pct(q.correct_rate),
        q.correct_count,
        q.response_count,
        q.avg_elapsed_seconds ?? "—",
      ),
    );
  }

  return lines.join("\r\n");
}
