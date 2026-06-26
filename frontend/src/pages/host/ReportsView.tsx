import { useEffect, useState } from "react";
import Board from "../../components/Board";
import PollResults from "../../components/PollResults";
import { EventReport, QuestionStat, ReportEventSummary, getReport, listReports } from "../../lib/api";
import { csvFilename, reportToCsv } from "../../lib/reportCsv";
import { saveTextFile } from "../../lib/download";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function ReportsView() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  return selectedId == null ? (
    <ReportList onSelect={setSelectedId} />
  ) : (
    <ReportDetail id={selectedId} onBack={() => setSelectedId(null)} />
  );
}

function ReportList({ onSelect }: { onSelect: (id: number) => void }) {
  const [rows, setRows] = useState<ReportEventSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listReports().then(setRows).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="host-card">
      <h2>Past events</h2>
      {error && <div className="host-error">{error}</div>}
      {rows == null && !error && <p className="host-empty">Loading…</p>}
      {rows && rows.length === 0 && (
        <p className="host-empty">No completed events yet. Run one to see results here.</p>
      )}
      {rows?.map((r) => (
        <button key={r.id} onClick={() => onSelect(r.id)} className="evt-row" style={{ width: "100%", cursor: "pointer", textAlign: "left", color: "var(--ink)", boxShadow: "none" }}>
          <span className="nm" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <b>{r.name}</b>
            <span className="meta">
              {fmtDate(r.ended_at)} · {r.participant_count} players
              {r.team_mode ? " · teams" : ""}
              {r.winner ? ` · 🏆 ${r.winner}` : ""}
            </span>
          </span>
          <span className="evt-badge">{r.event_type.replace("_", " ")}</span>
          <span className="sc" style={{ fontSize: 13, color: "var(--muted)" }}>
            {fmtDuration(r.duration_seconds)}
          </span>
        </button>
      ))}
    </div>
  );
}

function ReportDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [report, setReport] = useState<EventReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setReport(null);
    getReport(id).then(setReport).catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) {
    return (
      <div className="host-card">
        <div className="host-error">{error}</div>
        <div style={{ height: 12 }} />
        <button className="host-btn host-btn-ghost" onClick={onBack}>← Back to list</button>
      </div>
    );
  }
  if (!report) return <div className="host-card"><p className="host-empty">Loading…</p></div>;

  const isPoll = report.event_type === "poll";

  return (
    <div className="dash-cards">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <button className="host-btn host-btn-ghost" onClick={onBack}>
          ← Back to list
        </button>
        <button
          className="host-btn"
          onClick={() => saveTextFile(csvFilename(report), reportToCsv(report), "text/csv")}
        >
          ⬇ Export CSV
        </button>
      </div>

      <div className="host-card">
        <h2>{report.name}</h2>
        <div className="host-tiles">
          <div className="host-tile accent">
            <span className="k">{isPoll ? "Voters" : "Players"}</span>
            <span className="v">{report.participant_count}</span>
          </div>
          <div className="host-tile">
            <span className="k">{isPoll ? "Polls" : "Questions"}</span>
            <span className="v">{report.questions.length}</span>
          </div>
          <div className="host-tile">
            <span className="k">Duration</span>
            <span className="v" style={{ fontSize: 24 }}>{fmtDuration(report.duration_seconds)}</span>
          </div>
        </div>
      </div>

      {!isPoll && report.team_mode && report.team_standings.length > 0 && (
        <div className="host-card">
          <h2>🏆 Team standings</h2>
          {report.team_standings.map((t) => (
            <div key={t.team} className={`host-lb-row ${t.rank === 1 ? "top1" : ""}`}>
              <span className="rank">{t.rank}</span>
              <span className="nm">
                {t.team}
                <small style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 8 }}>
                  {t.members} {t.members === 1 ? "player" : "players"}
                </small>
              </span>
              <span className="sc">{t.total_score.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {!isPoll && (
        <div className="host-card">
          <h2>{report.team_mode ? "Individual standings" : "Final standings"}</h2>
          <Board
            entries={report.leaderboard.map((e) => ({ rank: e.rank, name: e.name, score: e.score }))}
            emptyText="No participants recorded for this event."
          />
        </div>
      )}

      <div className="host-card">
        <h2>{isPoll ? "Poll results" : "Per-question breakdown"}</h2>
        {report.questions.length === 0 ? (
          <p className="host-empty">No responses were submitted in this event.</p>
        ) : (
          report.questions.map((q) => <QuestionRow key={q.question_index} q={q} isPoll={isPoll} />)
        )}
      </div>
    </div>
  );
}

function QuestionRow({ q, isPoll }: { q: QuestionStat; isPoll: boolean }) {
  const pct = Math.round(q.correct_rate * 100);
  const label = isPoll ? "Poll" : "Q";
  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <b style={{ fontSize: 15 }}>{label}{q.question_index + 1}. {q.content}</b>
        <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>
          {q.avg_elapsed_seconds != null ? `${q.avg_elapsed_seconds}s avg` : "—"}
        </span>
      </div>

      {isPoll ? (
        <div style={{ marginTop: 10 }}>
          <PollResults items={q.distribution} emptyText="No votes recorded." />
        </div>
      ) : (
        <>
          <p className="host-help" style={{ marginTop: 4 }}>
            Correct answer: <b style={{ color: "var(--ink)" }}>{q.correct_answer}</b>
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
            <div className="host-bar" style={{ flex: 1, marginBottom: 0 }}>
              <div style={{ width: `${pct}%` }} />
            </div>
            <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700 }}>{pct}% correct</span>
          </div>
          <p className="host-help" style={{ marginTop: 6 }}>
            {q.correct_count} of {q.response_count} answered correctly
          </p>
          {q.distribution.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {q.distribution.map((d) => (
                <span key={d.answer} className="pill">{d.answer}: {d.count}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
