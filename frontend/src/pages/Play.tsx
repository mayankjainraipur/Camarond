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

function Brand() {
  return (
    <div className="brand">
      <div className="mark">C</div>
      <div>
        <b>Camarond</b>
        <span>Live Quiz</span>
      </div>
    </div>
  );
}

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
    const onQuestion = (d: QuestionShow) => {
      setQuestion(d);
      setScreen("question");
    };
    const onLock = () => setScreen((cur) => (cur === "question" ? "locked" : cur));
    const onBoard = (d: { entries: LeaderboardEntry[] }) => {
      setBoard(d.entries);
      setScreen((cur) => (cur === "results" ? cur : "leaderboard"));
    };
    const onComplete = (d: EventComplete) => {
      setResult(d);
      setScreen("results");
    };

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
      if (res?.error === "invalid_code") setError("We couldn't find that code. Check it with your host.");
      else if (res?.error === "event_ended") setError("This event has already wrapped up.");
      else setError("Couldn't join right now. Try again in a moment.");
      return;
    }
    setEventName(res.eventName);
    if (res.currentQuestion) {
      setQuestion(res.currentQuestion);
      setScreen("question");
    } else setScreen("lobby");
  }

  if (screen === "join") {
    return (
      <div className="wrap">
        <Brand />
        <div className="card">
          <h2>Join the event</h2>
          <p className="muted" style={{ margin: "0 0 4px" }}>
            Event code: <b style={{ color: "var(--ink)", fontFamily: "var(--mono)", letterSpacing: "2px" }}>{code || "—"}</b>
          </p>
          <label>Your display name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && code && join()}
            placeholder="What should we call you?"
            maxLength={40}
            autoFocus
          />
          <div className="spacer-12" />
          <button className="block" disabled={!name.trim() || !code} onClick={join}>
            Join event
          </button>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    );
  }

  if (screen === "lobby") {
    return (
      <div className="wrap">
        <Brand />
        <div className="card center">
          <h1>{eventName}</h1>
          <div style={{ height: 16 }} />
          <span className="tally go">
            <span className="dot" /> You're in
          </span>
          <p className="muted" style={{ marginTop: 18 }}>
            Sit tight — the host will start the quiz any second now.
          </p>
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
        <Brand />
        <div className="card">
          <h2>Standings</h2>
          <Board entries={board} />
          <p className="muted center" style={{ marginTop: 14 }}>
            Next question coming up…
          </p>
        </div>
      </div>
    );
  }

  // results
  const winner = result?.winner;
  return (
    <div className="wrap">
      <Brand />
      <div className="card center">
        <h2 className="plain" style={{ justifyContent: "center" }}>Final result</h2>
        <p style={{ fontSize: "2.6rem", margin: "4px 0" }}>🏆</p>
        {winner && <p className="big" style={{ color: "var(--gold)" }}>{winner.name}</p>}
        <p className="muted">takes the crown</p>
      </div>
      <div className="card">
        <h2>Final standings</h2>
        <Board entries={result?.leaderboard ?? board} />
      </div>
    </div>
  );
}

function QuestionView({ question, locked }: { question: QuestionShow; locked: boolean }) {
  const [answer, setAnswer] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; points?: number } | null>(null);
  const [failed, setFailed] = useState("");

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
    setFeedback(null);
    setFailed("");
    const update = () => setRemaining(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    update();
    tick.current = window.setInterval(update, 250);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
    };
  }, [question.questionId, deadline]);

  async function submit(value: string) {
    if (submitted || locked) return;
    setAnswer(value);
    setSubmitted(true);
    setFailed("");
    const res = await emitAck<any>(C2S.PARTICIPANT_ANSWER, {
      questionId: question.questionId,
      answer: value,
    });
    if (res?.accepted) setFeedback({ correct: res.correct, points: res.points });
    else {
      setSubmitted(false);
      setFailed("That didn't go through — try once more.");
    }
  }

  const pct = (remaining / question.timeLimit) * 100;
  const disabled = submitted || locked || remaining <= 0;
  const tags = ["A", "B", "C", "D", "E", "F"];

  return (
    <div className="wrap">
      <Brand />
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="qcount">Question {question.index + 1} / {question.total}</span>
          <span className="qcount" style={{ color: remaining <= 5 ? "var(--signal)" : "var(--gold)", fontWeight: 700 }}>
            {remaining}s
          </span>
        </div>
        <div className="timer"><div style={{ width: `${pct}%` }} /></div>
        <p className="qtext">{question.content}</p>

        {question.type === "mcq" && question.options?.map((o, i) => (
          <button
            key={o}
            className={`option ${answer === o ? "selected" : ""}`}
            disabled={disabled}
            onClick={() => submit(o)}
          >
            <span className="tag">{tags[i] ?? "•"}</span>
            {o}
          </button>
        ))}

        {question.type === "true_false" && ["True", "False"].map((o, i) => (
          <button
            key={o}
            className={`option ${answer === o ? "selected" : ""}`}
            disabled={disabled}
            onClick={() => submit(o)}
          >
            <span className="tag">{tags[i]}</span>
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

        {feedback && (
          <p className={`center ${feedback.correct ? "feedback-good" : "feedback-bad"}`} style={{ marginTop: 18 }}>
            {feedback.correct ? `✓ +${feedback.points}` : "✗ Not this time"}
          </p>
        )}
        {locked && !feedback && <p className="muted center" style={{ marginTop: 16 }}>⏱ Time! Answers are locked.</p>}
        {submitted && !locked && !feedback && !failed && <p className="muted center" style={{ marginTop: 16 }}>Answer locked in…</p>}
        {failed && <div className="error center">{failed}</div>}
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
        onKeyDown={(e) => e.key === "Enter" && !disabled && val.trim() && onSubmit(val)}
        placeholder="Type your answer"
        autoFocus
      />
      <div className="spacer-12" />
      <button className="block" disabled={disabled || !val.trim()} onClick={() => onSubmit(val)}>
        Submit answer
      </button>
    </div>
  );
}

function Board({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return <p className="muted">Scores will show up after the first question.</p>;
  }
  return (
    <div>
      {entries.map((e) => (
        <div key={e.name} className={`lb-row ${e.rank === 1 ? "top1" : ""}`}>
          <span className="rank">{e.rank}</span>
          <span className="nm">{e.name}</span>
          <span className="sc">{e.score.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
