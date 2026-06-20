import { useEffect, useState } from "react";
import {
  BankSummary,
  EventOut,
  createEvent,
  listBanks,
  uploadBank,
  verifyHostPassword,
} from "../lib/api";
import { emitAck, getSocket } from "../lib/socket";
import { C2S, S2C, LeaderboardEntry, MonitorState, QuestionShow } from "../types/contracts";

const SESSION_KEY = "host_auth";
const LIVE_EVENT_KEY = "host_live_event";

type Phase = "setup" | "live";

export default function Host() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [phase, setPhase] = useState<Phase>(() =>
    localStorage.getItem(LIVE_EVENT_KEY) ? "live" : "setup"
  );
  const [event, setEvent] = useState<EventOut | null>(() => {
    const raw = localStorage.getItem(LIVE_EVENT_KEY);
    return raw ? JSON.parse(raw) : null;
  });

  if (!authed) {
    return <PasswordGate onSuccess={() => { sessionStorage.setItem(SESSION_KEY, "1"); setAuthed(true); }} />;
  }

  function goLive(ev: EventOut) {
    localStorage.setItem(LIVE_EVENT_KEY, JSON.stringify(ev));
    setEvent(ev);
    setPhase("live");
  }

  function clearLive() {
    localStorage.removeItem(LIVE_EVENT_KEY);
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Host console</h1>
        <p className="muted">
          {phase === "setup"
            ? "Step 1 — upload a bank and create an event."
            : "Step 2 — run the event live."}
        </p>
      </div>
      {phase === "setup" ? (
        <Setup onReady={goLive} />
      ) : (
        event && <Live event={event} onDone={clearLive} />
      )}
    </div>
  );
}

function PasswordGate({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    const ok = await verifyHostPassword(pw);
    setBusy(false);
    if (ok) onSuccess();
    else setError("Incorrect password.");
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Host access</h1>
        <p className="muted">Enter the host password to continue.</p>
        <label>Password</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pw && !busy && submit()}
          placeholder="••••••"
          autoFocus
        />
        <div style={{ height: 12 }} />
        <button className="block" disabled={!pw || busy} onClick={submit}>
          {busy ? "Checking…" : "Enter"}
        </button>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}

function Setup({ onReady }: { onReady: (ev: EventOut) => void }) {
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [bankId, setBankId] = useState<number | null>(null);
  const [eventName, setEventName] = useState("Friday Quiz");
  const [timeLimit, setTimeLimit] = useState(20);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => listBanks().then(setBanks).catch(() => {});
  useEffect(() => { refresh(); }, []);

  async function doUpload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const res = await uploadBank(name || file.name, file);
      await refresh();
      setBankId(res.bank.id);
      if (res.errors.length) setError(`Imported ${res.imported}. Skipped: ${res.errors.length} rows.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doCreate() {
    if (!bankId) return;
    setBusy(true);
    setError("");
    try {
      const ev = await createEvent({
        name: eventName,
        bank_id: bankId,
        time_limit: timeLimit,
      });
      onReady(ev);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>1. Upload question bank</h2>
        <p className="muted">CSV or XLSX. Columns: type, content, correct_answer, options, category, difficulty.</p>
        <label>Bank name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="General Knowledge Pack" />
        <label>File</label>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div style={{ height: 12 }} />
        <button onClick={doUpload} disabled={!file || busy}>Upload</button>
      </div>

      <div className="card">
        <h2>2. Create event</h2>
        <label>Question bank</label>
        <select value={bankId ?? ""} onChange={(e) => setBankId(Number(e.target.value))}>
          <option value="" disabled>Select a bank…</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.question_count} questions)
            </option>
          ))}
        </select>
        <div className="row">
          <div>
            <label>Event name</label>
            <input value={eventName} onChange={(e) => setEventName(e.target.value)} />
          </div>
          <div>
            <label>Seconds / question</label>
            <input type="number" value={timeLimit} min={5} max={300}
              onChange={(e) => setTimeLimit(Number(e.target.value))} />
          </div>
        </div>
        <div style={{ height: 14 }} />
        <button onClick={doCreate} disabled={!bankId || busy}>Create &amp; go live</button>
        {error && <div className="error">{error}</div>}
      </div>
    </>
  );
}

function Live({ event, onDone }: { event: EventOut; onDone: () => void }) {
  const [lobby, setLobby] = useState<{ participants: string[] } | null>(null);
  const [monitor, setMonitor] = useState<MonitorState | null>(null);
  const [question, setQuestion] = useState<QuestionShow | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [done, setDone] = useState(false);

  const joinUrl = `${window.location.origin}/play?code=${event.code}`;

  useEffect(() => {
    const s = getSocket();
    const onLobby = (d: any) => setLobby(d);
    const onMonitor = (d: MonitorState) => setMonitor(d);
    const onQuestion = (d: QuestionShow) => setQuestion(d);
    const onBoard = (d: { entries: LeaderboardEntry[] }) => setBoard(d.entries);
    const onComplete = (d: { leaderboard: LeaderboardEntry[] }) => {
      setBoard(d.leaderboard);
      setDone(true);
      onDone();
    };
    s.on(S2C.LOBBY_UPDATE, onLobby);
    s.on(S2C.HOST_MONITOR, onMonitor);
    s.on(S2C.QUESTION_SHOW, onQuestion);
    s.on(S2C.LEADERBOARD_UPDATE, onBoard);
    s.on(S2C.EVENT_COMPLETE, onComplete);

    emitAck<any>(C2S.HOST_JOIN, { eventId: event.id }).then((ack) => {
      if (!ack?.ok) return;
      if (ack.monitor) setMonitor(ack.monitor);
      if (ack.currentQuestion) setQuestion(ack.currentQuestion);
      if (ack.leaderboard?.length) setBoard(ack.leaderboard);
      if (ack.sessionState === "completed") { setDone(true); onDone(); }
    });

    return () => {
      s.off(S2C.LOBBY_UPDATE, onLobby);
      s.off(S2C.HOST_MONITOR, onMonitor);
      s.off(S2C.QUESTION_SHOW, onQuestion);
      s.off(S2C.LEADERBOARD_UPDATE, onBoard);
      s.off(S2C.EVENT_COMPLETE, onComplete);
    };
  }, [event.id]);

  const started = monitor && monitor.index >= 0;

  return (
    <>
      <div className="card center">
        <p className="muted">Share this link or code to join</p>
        <div className="code">{event.code}</div>
        <p className="muted" style={{ wordBreak: "break-all" }}>{joinUrl}</p>
        <button className="ghost" onClick={() => navigator.clipboard?.writeText(joinUrl)}>
          Copy link
        </button>
      </div>

      <div className="card">
        <h2>Monitoring</h2>
        <span className="pill">Participants: {monitor?.participantCount ?? 0}</span>
        <span className="pill">
          Question: {started ? `${(monitor!.index ?? 0) + 1} / ${monitor!.total}` : "—"}
        </span>
        <span className="pill">Answered: {monitor?.answeredCount ?? 0}</span>
        <span className="pill">State: {monitor?.state ?? "lobby"}</span>
      </div>

      {question && !done && (
        <div className="card">
          <p className="muted">Now showing</p>
          <h2>{question.content}</h2>
          {question.options?.map((o) => <div key={o} className="pill">{o}</div>)}
        </div>
      )}

      <div className="card">
        <h2>Controls</h2>
        <div className="row">
          {!started && (
            <button onClick={() => emitAck(C2S.HOST_START, { eventId: event.id })}>
              Start event
            </button>
          )}
          {started && !done && (
            <button onClick={() => emitAck(C2S.HOST_NEXT, { eventId: event.id })}>
              Next question
            </button>
          )}
          {started && !done && (
            <button className="danger" onClick={() => emitAck(C2S.HOST_END, { eventId: event.id })}>
              End event
            </button>
          )}
        </div>
        {!started && <p className="muted">Waiting in lobby: {lobby?.participants?.join(", ") || "—"}</p>}
      </div>

      {board.length > 0 && (
        <div className="card">
          <h2>{done ? "🏆 Final leaderboard" : "Leaderboard"}</h2>
          <Leaderboard entries={board} />
        </div>
      )}
    </>
  );
}

function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <table>
      <thead>
        <tr><th>#</th><th>Name</th><th>Score</th></tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.name}>
            <td className="rank">{e.rank}</td>
            <td>{e.name}</td>
            <td>{e.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
