import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Board from "../components/Board";
import PasswordGate, { HOST_AUTH_KEY } from "../components/PasswordGate";
import {
  EventReport,
  QuestionStat,
  ReportEventSummary,
  getReport,
  listReports,
} from "../lib/api";
import "./Host.css";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
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

export default function Reports() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(HOST_AUTH_KEY) === "1");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (!authed) {
    return (
      <PasswordGate
        title="Reports access"
        help="Enter the host password to view past results."
        onSuccess={() => setAuthed(true)}
      />
    );
  }

  return (
    <div className="host">
      <div className="host-shell">
        <div className="host-rail">
          <div className="host-brand">
            <div className="mark">C</div>
            <div>
              <b>Camarond</b>
              <span>Reports</span>
            </div>
          </div>
          <div className="host-spacer" />
          <Link to="/host" className="host-btn host-btn-ghost" style={{ textDecoration: "none" }}>
            Host console →
          </Link>
        </div>
        {selectedId == null ? (
          <ReportList onSelect={setSelectedId} />
        ) : (
          <ReportDetail id={selectedId} onBack={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  );
}

function ReportList({ onSelect }: { onSelect: (id: number) => void }) {
  const [rows, setRows] = useState<ReportEventSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listReports()
      .then(setRows)
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="host-wizard">
      <div className="host-card">
        <h2>Past events</h2>
        {error && <div className="host-error">{error}</div>}
        {rows == null && !error && <p className="host-empty">Loading…</p>}
        {rows && rows.length === 0 && (
          <p className="host-empty">No completed events yet. Run a quiz to see results here.</p>
        )}
        {rows?.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className="host-lb-row"
            style={{
              width: "100%",
              textAlign: "left",
              background: "var(--panel-2)",
              border: "1px solid var(--line)",
              cursor: "pointer",
              boxShadow: "none",
              color: "var(--ink)",
            }}
          >
            <span className="nm" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <b>{r.name}</b>
              <small style={{ color: "var(--muted)", fontWeight: 400 }}>
                {fmtDate(r.ended_at)} · {r.participant_count} players
                {r.team_mode ? " · teams" : ""}
                {r.winner ? ` · 🏆 ${r.winner}` : ""}
              </small>
            </span>
            <span className="sc" style={{ fontSize: 13, color: "var(--muted)" }}>
              {fmtDuration(r.duration_seconds)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReportDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [report, setReport] = useState<EventReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setReport(null);
    getReport(id)
      .then(setReport)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) {
    return (
      <div className="host-wizard">
        <div className="host-card">
          <div className="host-error">{error}</div>
          <div style={{ height: 12 }} />
          <button className="host-btn host-btn-ghost" onClick={onBack}>
            ← Back to list
          </button>
        </div>
      </div>
    );
  }
  if (!report) {
    return (
      <div className="host-wizard">
        <div className="host-card">
          <p className="host-empty">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="host-wizard">
      <button
        className="host-btn host-btn-ghost"
        style={{ alignSelf: "flex-start" }}
        onClick={onBack}
      >
        ← Back to list
      </button>

      <div className="host-card">
        <h2>{report.name}</h2>
        <div className="host-tiles">
          <div className="host-tile accent">
            <span className="k">Players</span>
            <span className="v">{report.participant_count}</span>
          </div>
          <div className="host-tile">
            <span className="k">Questions</span>
            <span className="v">{report.questions.length}</span>
          </div>
          <div className="host-tile">
            <span className="k">Duration</span>
            <span className="v" style={{ fontSize: 24 }}>
              {fmtDuration(report.duration_seconds)}
            </span>
          </div>
        </div>
      </div>

      {report.team_mode && report.team_standings.length > 0 && (
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

      <div className="host-card">
        <h2>{report.team_mode ? "Individual standings" : "Final standings"}</h2>
        <Board
          entries={report.leaderboard.map((e) => ({ rank: e.rank, name: e.name, score: e.score }))}
          emptyText="No participants recorded for this event."
        />
      </div>

      <div className="host-card">
        <h2>Per-question breakdown</h2>
        {report.questions.length === 0 ? (
          <p className="host-empty">No answers were submitted in this event.</p>
        ) : (
          report.questions.map((q) => <QuestionRow key={q.question_index} q={q} />)
        )}
      </div>
    </div>
  );
}

function QuestionRow({ q }: { q: QuestionStat }) {
  const pct = Math.round(q.correct_rate * 100);
  return (
    <div
      style={{
        padding: "14px 0",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <b style={{ fontSize: 15 }}>
          Q{q.question_index + 1}. {q.content}
        </b>
        <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>
          {q.avg_elapsed_seconds != null ? `${q.avg_elapsed_seconds}s avg` : "—"}
        </span>
      </div>
      <p className="host-help" style={{ marginTop: 4 }}>
        Correct answer: <b style={{ color: "var(--ink)" }}>{q.correct_answer}</b>
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <div className="host-bar" style={{ flex: 1, marginBottom: 0 }}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700 }}>
          {pct}% correct
        </span>
      </div>
      <p className="host-help" style={{ marginTop: 6 }}>
        {q.correct_count} of {q.response_count} answered correctly
      </p>
      {q.distribution.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {q.distribution.map((d) => (
            <span key={d.answer} className="pill">
              {d.answer}: {d.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
