import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BankSummary, EventOut, EventType, createEvent, listBanks, listEvents } from "../../lib/api";
import { useHost } from "./DashboardLayout";

const TYPES: { id: EventType; emoji: string; t: string; d: string }[] = [
  { id: "quiz", emoji: "❓", t: "Quiz", d: "Timed questions, speed-bonus scoring." },
  { id: "puzzle", emoji: "🧩", t: "Puzzle", d: "Solve & type the answer; optional hints." },
  { id: "poll", emoji: "📊", t: "Poll", d: "Vote — no scoring, live results." },
  { id: "treasure_hunt", emoji: "🗺️", t: "Treasure Hunt", d: "Ordered clues with hints." },
];

// Sensible per-type starting points.
const DEFAULT_TIME: Record<EventType, number> = { quiz: 20, puzzle: 60, poll: 30, treasure_hunt: 90 };

// Cap the "Recent events" list — newest first; older ones aren't shown here.
const RECENT_LIMIT = 12;

export default function Events() {
  const { goLive } = useHost();
  const nav = useNavigate();

  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [events, setEvents] = useState<EventOut[]>([]);
  const [type, setType] = useState<EventType>("quiz");
  const [bankId, setBankId] = useState<number | null>(null);
  const [eventName, setEventName] = useState("Friday Quiz");
  const [timeLimit, setTimeLimit] = useState(20);
  const [hintPenalty, setHintPenalty] = useState(50);
  const [teamMode, setTeamMode] = useState(false);
  const [teamCount, setTeamCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshEvents = () => listEvents().then(setEvents).catch(() => {});
  useEffect(() => {
    listBanks().then(setBanks).catch(() => {});
    refreshEvents();
  }, []);

  function pickType(t: EventType) {
    setType(t);
    setTimeLimit(DEFAULT_TIME[t]);
    if (t === "poll") setTeamMode(false); // polls are unscored
  }

  const hasHints = type === "puzzle" || type === "treasure_hunt";
  const canTeam = type !== "poll";

  async function create(launch: boolean) {
    if (!bankId) return;
    setBusy(true);
    setError("");
    try {
      const ev = await createEvent({
        name: eventName,
        bank_id: bankId,
        event_type: type,
        time_limit: timeLimit,
        hint_penalty: hintPenalty,
        team_mode: canTeam && teamMode,
        team_count: teamCount,
      });
      await refreshEvents();
      if (launch) {
        goLive(ev);
        nav("/host/live");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dash-grid2">
      <div className="host-card">
        <h2>Create an event</h2>

        <label>Event type</label>
        <div className="type-grid">
          {TYPES.map((t) => (
            <button
              key={t.id}
              className={`type-card ${type === t.id ? "active" : ""}`}
              onClick={() => pickType(t.id)}
            >
              <span className="emoji">{t.emoji}</span>
              <span className="t">{t.t}</span>
              <span className="d">{t.d}</span>
            </button>
          ))}
        </div>

        <label>Question bank</label>
        <select value={bankId ?? ""} onChange={(e) => setBankId(Number(e.target.value))}>
          <option value="" disabled>Select a bank…</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.question_count} questions)
            </option>
          ))}
        </select>

        <div className="host-grid2">
          <div>
            <label>Event name</label>
            <input value={eventName} onChange={(e) => setEventName(e.target.value)} />
          </div>
          <div>
            <label>{type === "treasure_hunt" ? "Seconds per clue" : "Seconds per question"}</label>
            <input
              type="number"
              value={timeLimit}
              min={5}
              max={300}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
            />
          </div>
        </div>

        {hasHints && (
          <div>
            <label>Hint penalty (% of points)</label>
            <input
              type="number"
              value={hintPenalty}
              min={0}
              max={100}
              onChange={(e) => setHintPenalty(Number(e.target.value))}
            />
            <p className="host-help" style={{ marginTop: 6 }}>
              Revealing a clue's hint forfeits this share of its points.
            </p>
          </div>
        )}

        {type === "treasure_hunt" && (
          <p className="host-help" style={{ marginTop: 12 }}>
            Clues are revealed in the order they appear in the bank.
          </p>
        )}
        {type === "poll" && (
          <p className="host-help" style={{ marginTop: 12 }}>
            Polls are unscored — participants see live results, no leaderboard.
          </p>
        )}

        {canTeam && (
          <label className="check-row">
            <input type="checkbox" checked={teamMode} onChange={(e) => setTeamMode(e.target.checked)} />
            Team mode (auto-balanced)
          </label>
        )}
        {canTeam && teamMode && (
          <div>
            <label>Number of teams</label>
            <input
              type="number"
              value={teamCount}
              min={2}
              max={12}
              onChange={(e) => setTeamCount(Number(e.target.value))}
            />
          </div>
        )}

        <div style={{ height: 18 }} />
        <div className="host-btn-row">
          <button className="host-btn host-btn-gold" onClick={() => create(true)} disabled={!bankId || busy}>
            Create &amp; go live
          </button>
          <button className="host-btn host-btn-ghost" onClick={() => create(false)} disabled={!bankId || busy}>
            Create only
          </button>
        </div>
        {error && <div className="host-error">{error}</div>}
      </div>

      <div className="host-card">
        <h2>Recent events</h2>
        {events.length === 0 ? (
          <p className="host-empty">No events yet. Create one to take it live.</p>
        ) : (
          <div className="evt-list">
            {events.slice(0, RECENT_LIMIT).map((ev) => (
              <div key={ev.id} className="evt-row">
                <span className="nm" style={{ display: "flex", flexDirection: "column" }}>
                  <b>{ev.name}</b>
                  <span className="meta">
                    code {ev.code} · {ev.question_count} questions · {ev.status}
                  </span>
                </span>
                <span className="evt-badge">{ev.event_type.replace("_", " ")}</span>
                <button
                  className="host-btn host-btn-ghost"
                  onClick={() => {
                    goLive(ev);
                    nav("/host/live");
                  }}
                >
                  {ev.status === "completed" ? "Reopen" : "Go live"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
