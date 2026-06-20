import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { emitAck, getSocket } from "../lib/socket";
import {
  C2S,
  S2C,
  EventComplete,
  LeaderboardEntry,
  QuestionShow,
} from "../types/contracts";

type Screen = "join" | "lobby" | "question" | "locked" | "leaderboard" | "results";

export default function Play() {
  const [params] = useSearchParams();
  const code = (params.get("code") || "").toUpperCase();

  const [screen, setScreen] = useState<Screen>("join");
  const [name, setName] = useState("");
  const [eventName, setEventName] = useState("");
  const [error, setError] = useState("");

  const [question, setQuestion] = useState<QuestionShow | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [result, setResult] = useState<EventComplete | null>(null);

  useEffect(() => {
    const s = getSocket();
    const onQuestion = (d: QuestionShow) => { setQuestion(d); setScreen("question"); };
    const onLock = () => setScreen((cur) => (cur === "question" ? "locked" : cur));
    const onBoard = (d: { entries: LeaderboardEntry[] }) => {
      setBoard(d.entries);
      setScreen((cur) => (cur === "results" ? cur : "leaderboard"));
    };
    const onComplete = (d: EventComplete) => { setResult(d); setScreen("results"); };

    s.on(S2C.QUESTION_SHOW, onQuestion);
    s.on(S2C.QUESTION_LOCK, onLock);
    s.on(S2C.LEADERBOARD_UPDATE, onBoard);
    s.on(S2C.EVENT_COMPLETE, onComplete);
    return () => {
      s.off(S2C.QUESTION_SHOW, onQuestion);
      s.off(S2C.QUESTION_LOCK, onLock);
      s.off(S2C.LEADERBOARD_UPDATE, onBoard);
      s.off(S2C.EVENT_COMPLETE, onComplete);
    };
  }, []);

  async function join() {
    setError("");
    const res = await emitAck<any>(C2S.PARTICIPANT_JOIN, { code, displayName: name });
    if (!res?.ok) {
      setError(res?.error === "invalid_code" ? "Invalid event code." : "Could not join.");
      return;
    }
    setEventName(res.eventName);
    if (res.currentQuestion) { setQuestion(res.currentQuestion); setScreen("question"); }
    else setScreen("lobby");
  }

  if (screen === "join") {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Join event</h1>
          <p className="muted">Code: <b>{code || "—"}</b></p>
          <label>Your display name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" maxLength={40} />
          <div style={{ height: 12 }} />
          <button className="block" disabled={!name.trim() || !code} onClick={join}>Join</button>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    );
  }

  if (screen === "lobby") {
    return (
      <div className="wrap">
        <div className="card center">
          <h1>{eventName}</h1>
          <p className="big">⏳</p>
          <p className="muted">You're in! Waiting for the host to start…</p>
        </div>
      </div>
    );
  }

  if ((screen === "question" || screen === "locked") && question) {
    return <QuestionView question={question} locked={screen === "locked"} />;
  }

  if (screen === "leaderboard") {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Leaderboard</h1>
          <BoardTable entries={board} />
          <p className="muted center">Waiting for the next question…</p>
        </div>
      </div>
    );
  }

  // results
  return (
    <div className="wrap">
      <div className="card center">
        <h1>🏆 Results</h1>
        {result?.winner && <p className="big">{result.winner.name}</p>}
        <p className="muted">wins!</p>
      </div>
      <div className="card">
        <BoardTable entries={result?.leaderboard ?? board} />
      </div>
    </div>
  );
}

function QuestionView({ question, locked }: { question: QuestionShow; locked: boolean }) {
  const [answer, setAnswer] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<string>("");

  // Countdown derived from the server's startedAt + timeLimit.
  const deadline = useMemo(
    () => question.startedAt * 1000 + question.timeLimit * 1000,
    [question]
  );
  const [remaining, setRemaining] = useState(question.timeLimit);
  const tick = useRef<number | null>(null);

  useEffect(() => {
    setAnswer("");
    setSubmitted(false);
    setFeedback("");
    const update = () => setRemaining(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    update();
    tick.current = window.setInterval(update, 250);
    return () => { if (tick.current) window.clearInterval(tick.current); };
  }, [question.questionId, deadline]);

  async function submit(value: string) {
    if (submitted || locked) return;
    setAnswer(value);
    setSubmitted(true);
    const res = await emitAck<any>(C2S.PARTICIPANT_ANSWER, {
      questionId: question.questionId,
      answer: value,
    });
    if (res?.accepted) setFeedback(res.correct ? `✅ +${res.points}` : "❌");
    else { setSubmitted(false); setFeedback("Could not submit"); }
  }

  const pct = (remaining / question.timeLimit) * 100;
  const disabled = submitted || locked || remaining <= 0;

  return (
    <div className="wrap">
      <div className="card">
        <p className="muted">Question {question.index + 1} / {question.total}</p>
        <div className="timer"><div style={{ width: `${pct}%` }} /></div>
        <p className="muted center">{remaining}s</p>
        <h1>{question.content}</h1>

        {question.type === "mcq" && question.options?.map((o) => (
          <button
            key={o}
            className={`option ${answer === o ? "selected" : ""}`}
            disabled={disabled}
            onClick={() => submit(o)}
          >
            {o}
          </button>
        ))}

        {question.type === "true_false" && ["True", "False"].map((o) => (
          <button
            key={o}
            className={`option ${answer === o ? "selected" : ""}`}
            disabled={disabled}
            onClick={() => submit(o)}
          >
            {o}
          </button>
        ))}

        {(question.type === "text" || question.type === "number") && (
          <FreeInput
            key={question.questionId}
            type={question.type}
            disabled={disabled}
            onSubmit={(v) => submit(v)}
          />
        )}

        {feedback && <p className="big center">{feedback}</p>}
        {locked && !feedback && <p className="muted center">⏱ Time! Answers locked.</p>}
        {submitted && !locked && !feedback && <p className="muted center">Answer sent…</p>}
      </div>
    </div>
  );
}

function FreeInput({
  type,
  disabled,
  onSubmit,
}: {
  type: "text" | "number";
  disabled: boolean;
  onSubmit: (v: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <div>
      <input
        type={type === "number" ? "number" : "text"}
        value={val}
        disabled={disabled}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Your answer"
      />
      <div style={{ height: 10 }} />
      <button className="block" disabled={disabled || !val.trim()} onClick={() => onSubmit(val)}>
        Submit
      </button>
    </div>
  );
}

function BoardTable({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <table>
      <thead><tr><th>#</th><th>Name</th><th>Score</th></tr></thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.name}><td className="rank">{e.rank}</td><td>{e.name}</td><td>{e.score}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
