import { useEffect, useMemo, useRef, useState } from "react";
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
import "./Host.css";

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
    return (
      <PasswordGate
        onSuccess={() => {
          sessionStorage.setItem(SESSION_KEY, "1");
          setAuthed(true);
        }}
      />
    );
  }

  function goLive(ev: EventOut) {
    localStorage.setItem(LIVE_EVENT_KEY, JSON.stringify(ev));
    setEvent(ev);
    setPhase("live");
  }

  function clearLive() {
    localStorage.removeItem(LIVE_EVENT_KEY);
  }

  function resetToSetup() {
    localStorage.removeItem(LIVE_EVENT_KEY);
    setEvent(null);
    setPhase("setup");
  }

  const liveEvent = phase === "live" && event ? event : null;

  return (
    <div className="host">
      <div className="host-shell">
        <Rail phase={phase} eventName={liveEvent?.name} />
        {liveEvent ? (
          <Live event={liveEvent} onDone={clearLive} onNewEvent={resetToSetup} />
        ) : (
          <Setup onReady={goLive} />
        )}
      </div>
    </div>
  );
}

function Rail({ phase, eventName }: { phase: Phase; eventName?: string }) {
  const live = phase === "live";
  return (
    <div className="host-rail">
      <div className="host-brand">
        <div className="mark">C</div>
        <div>
          <b>Camarond</b>
          <span>Host Console</span>
        </div>
      </div>
      <div className="host-evname">
        {live ? (
          <>Running <b>{eventName}</b></>
        ) : (
          <>Setting up <b>a new event</b></>
        )}
      </div>
      <div className="host-spacer" />
      <div className={`host-tally ${live ? "live" : ""}`}>
        <span className="dot" /> {live ? "On Air" : "Off Air"}
      </div>
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
    else setError("That password didn't match. Try again.");
  }

  return (
    <div className="host">
      <div className="host-shell">
        <div className="host-card host-gate">
          <h2>Host access</h2>
          <p className="host-help">Enter the host password to open the console.</p>
          <label>Password</label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pw && !busy && submit()}
            placeholder="••••••"
            autoFocus
          />
          <div style={{ height: 14 }} />
          <button className="host-btn host-btn-gold host-btn-block" disabled={!pw || busy} onClick={submit}>
            {busy ? "Checking…" : "Enter console"}
          </button>
          {error && <div className="host-error">{error}</div>}
        </div>
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
  const [imported, setImported] = useState<{ count: number; skipped: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => listBanks().then(setBanks).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  async function doUpload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const res = await uploadBank(name || file.name, file);
      await refresh();
      setBankId(res.bank.id);
      setImported({ count: res.imported, skipped: res.errors.length });
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
      const ev = await createEvent({ name: eventName, bank_id: bankId, time_limit: timeLimit });
      onReady(ev);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="host-wizard">
      <div className="host-steps">
        <div className="host-step active">
          <span className="n">1</span>
          <span className="t">
            <b>Question bank</b>
            <span>Upload your questions</span>
          </span>
        </div>
        <div className={`host-step ${bankId ? "active" : ""}`}>
          <span className="n">2</span>
          <span className="t">
            <b>Event details</b>
            <span>Name it &amp; set the clock</span>
          </span>
        </div>
      </div>

      <div className="host-card">
        <h2>Upload a question bank</h2>
        <p className="host-help">
          CSV or XLSX with columns: type, content, correct answer, options, category, difficulty.
        </p>
        <label>Bank name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="General Knowledge Pack" />
        <label>File</label>
        <label className="host-drop">
          <div className="big">⬆</div>
          <b>{file ? file.name : "Choose a file to upload"}</b>
          <span>.csv · .xlsx · .xls</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <div style={{ height: 14 }} />
        <button className="host-btn host-btn-ghost" onClick={doUpload} disabled={!file || busy}>
          {busy ? "Uploading…" : "Upload bank"}
        </button>
        {imported && (
          <div className="host-pill">
            ✓ {imported.count} questions imported
            {imported.skipped ? ` · ${imported.skipped} rows skipped` : ""}
          </div>
        )}
      </div>

      <div className="host-card">
        <h2>Create the event</h2>
        <label>Question bank</label>
        <select value={bankId ?? ""} onChange={(e) => setBankId(Number(e.target.value))}>
          <option value="" disabled>
            Select a bank…
          </option>
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
            <label>Seconds per question</label>
            <input
              type="number"
              value={timeLimit}
              min={5}
              max={300}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
            />
          </div>
        </div>
        <div style={{ height: 18 }} />
        <button className="host-btn host-btn-gold" onClick={doCreate} disabled={!bankId || busy}>
          Create &amp; go live
        </button>
        {error && <div className="host-error">{error}</div>}
      </div>
    </div>
  );
}

function Live({
  event,
  onDone,
  onNewEvent,
}: {
  event: EventOut;
  onDone: () => void;
  onNewEvent: () => void;
}) {
  const [lobby, setLobby] = useState<{ participants: string[] } | null>(null);
  const [monitor, setMonitor] = useState<MonitorState | null>(null);
  const [question, setQuestion] = useState<QuestionShow | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

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
      if (ack.sessionState === "completed") {
        setDone(true);
        onDone();
      }
    });

    return () => {
      s.off(S2C.LOBBY_UPDATE, onLobby);
      s.off(S2C.HOST_MONITOR, onMonitor);
      s.off(S2C.QUESTION_SHOW, onQuestion);
      s.off(S2C.LEADERBOARD_UPDATE, onBoard);
      s.off(S2C.EVENT_COMPLETE, onComplete);
    };
  }, [event.id]);

  function copyLink() {
    navigator.clipboard?.writeText(joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const started = !!monitor && monitor.index >= 0;
  const participants = monitor?.participantCount ?? 0;
  const answered = monitor?.answeredCount ?? 0;
  const answeredPct = participants > 0 ? Math.round((answered / participants) * 100) : 0;

  return (
    <div className="host-deck">
      {/* Left: broadcast / join */}
      <div className="host-col">
        <div className="host-card host-broadcast">
          <h2>Join the room</h2>
          <div className="host-codebox">
            <div className="label">Event code</div>
            <div className="code">{event.code}</div>
            <div className="code-underline" />
            <div className="url">{joinUrl}</div>
          </div>
          <button className="host-btn host-btn-ghost" onClick={copyLink}>
            {copied ? "Link copied ✓" : "Copy join link"}
          </button>
        </div>

        <div className="host-card">
          <h2>Director controls</h2>
          <div className="host-btn-row">
            {!started && !done && (
              <button
                className="host-btn host-btn-gold host-btn-block"
                onClick={() => emitAck(C2S.HOST_START, { eventId: event.id })}
              >
                Start event
              </button>
            )}
            {started && !done && (
              <>
                <button
                  className="host-btn host-btn-gold"
                  onClick={() => emitAck(C2S.HOST_NEXT, { eventId: event.id })}
                >
                  Next question →
                </button>
                <button
                  className="host-btn host-btn-danger"
                  onClick={() => emitAck(C2S.HOST_END, { eventId: event.id })}
                >
                  End event
                </button>
              </>
            )}
            {done && (
              <button className="host-btn host-btn-gold host-btn-block" onClick={onNewEvent}>
                Start a new event
              </button>
            )}
          </div>
          {!started && !done && (
            <p className="host-waiting">
              In the lobby: {lobby?.participants?.join(", ") || "waiting for players to join…"}
            </p>
          )}
        </div>
      </div>

      {/* Right: telemetry + question + standings */}
      <div className="host-col">
        <div className="host-tiles">
          <div className="host-tile accent">
            <span className="k">In the room</span>
            <span className="v">{participants}</span>
          </div>
          <div className="host-tile">
            <span className="k">Question</span>
            <span className="v">
              {started ? (monitor!.index ?? 0) + 1 : "—"}
              {started && <small> / {monitor!.total}</small>}
            </span>
          </div>
          <div className="host-tile">
            <ProgressRing pct={answeredPct} />
            <span className="k">Answered</span>
            <span className="v">
              {answered}
              <small> / {participants}</small>
            </span>
          </div>
        </div>

        {question && !done && <NowOnAir question={question} />}

        <div className="host-card">
          <h2>{done ? "🏆 Final standings" : "Live standings"}</h2>
          {board.length > 0 ? (
            board.map((e) => (
              <div key={e.name} className={`host-lb-row ${e.rank === 1 ? "top1" : ""}`}>
                <span className="rank">{e.rank}</span>
                <span className="nm">{e.name}</span>
                <span className="sc">{e.score.toLocaleString()}</span>
              </div>
            ))
          ) : (
            <p className="host-empty">Scores appear here once the first question closes.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function NowOnAir({ question }: { question: QuestionShow }) {
  const deadline = useMemo(
    () => question.startedAt * 1000 + question.timeLimit * 1000,
    [question]
  );
  const [remaining, setRemaining] = useState(question.timeLimit);
  const tick = useRef<number | null>(null);

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    update();
    tick.current = window.setInterval(update, 250);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
    };
  }, [question.questionId, deadline]);

  const pct = Math.max(0, Math.min(100, (remaining / question.timeLimit) * 100));
  const tags = ["A", "B", "C", "D", "E", "F"];

  return (
    <div className="host-card">
      <div className="host-qhead">
        <h2>Now on air</h2>
        <span className="host-qtimer">{remaining}s left</span>
      </div>
      <div className="host-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="host-qtext">{question.content}</p>
      {question.options && question.options.length > 0 && (
        <div className="host-opts">
          {question.options.map((o, i) => (
            <div key={o} className="host-opt">
              <span className="tag">{tags[i] ?? "•"}</span>
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <svg className="host-ring" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r={r} fill="none" stroke="#E4E8F0" strokeWidth="6" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="#109C73"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}
