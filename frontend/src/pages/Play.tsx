import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { emitAck, getSocket } from "../lib/socket";
import Board from "../components/Board";
import PollResults from "../components/PollResults";
import {
  C2S,
  S2C,
  DistributionItem,
  EventComplete,
  EventType,
  LeaderboardEntry,
  LeaderboardUpdate,
  QuestionShow,
  TeamEntry,
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

  const [team, setTeam] = useState("");
  const [eventType, setEventType] = useState<EventType>("quiz");
  const [question, setQuestion] = useState<QuestionShow | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [distribution, setDistribution] = useState<DistributionItem[]>([]);
  const [result, setResult] = useState<EventComplete | null>(null);

  const isPoll = eventType === "poll";

  useEffect(() => {
    const s = getSocket();
    const onQuestion = (d: QuestionShow) => {
      setQuestion(d);
      if (d.eventType) setEventType(d.eventType);
      setScreen("question");
    };
    const onLock = () => setScreen((cur) => (cur === "question" ? "locked" : cur));
    const onBoard = (d: LeaderboardUpdate) => {
      setBoard(d.entries);
      if (d.teams) setTeams(d.teams);
      if (d.eventType) setEventType(d.eventType);
      setDistribution(d.distribution ?? []);
      setScreen((cur) => (cur === "results" ? cur : "leaderboard"));
    };
    const onComplete = (d: EventComplete) => {
      setResult(d);
      if (d.teams) setTeams(d.teams);
      if (d.eventType) setEventType(d.eventType);
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
    if (res.eventType) setEventType(res.eventType);
    if (res.teamLabel) setTeam(res.teamLabel);
    if (res.currentQuestion) {
      setQuestion(res.currentQuestion);
      if (res.currentQuestion.eventType) setEventType(res.currentQuestion.eventType);
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
          {team && (
            <p className="muted" style={{ marginTop: 14 }}>
              You're on <b style={{ color: "var(--ink)" }}>{team}</b>
            </p>
          )}
          <p className="muted" style={{ marginTop: 18 }}>
            {isPoll
              ? "Sit tight — the host will open the first poll any second now."
              : "Sit tight — the host will start the event any second now."}
          </p>
        </div>
      </div>
    );
  }

  if ((screen === "question" || screen === "locked") && question) {
    return <QuestionView question={question} locked={screen === "locked"} isPoll={isPoll} />;
  }

  if (screen === "leaderboard") {
    // Polls show the live vote distribution instead of a leaderboard.
    if (isPoll) {
      return (
        <div className="wrap">
          <Brand />
          <div className="card">
            <h2>Results so far</h2>
            <PollResults items={distribution} emptyText="Votes are being tallied…" />
            <p className="muted center" style={{ marginTop: 14 }}>
              Next poll coming up…
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="wrap">
        <Brand />
        {teams.length > 0 && (
          <div className="card">
            <h2>Team standings</h2>
            <Board entries={teams} />
          </div>
        )}
        <div className="card">
          <h2>{teams.length > 0 ? "Your standings" : "Standings"}</h2>
          <Board entries={board} />
          <p className="muted center" style={{ marginTop: 14 }}>
            Next question coming up…
          </p>
        </div>
      </div>
    );
  }

  // results — polls have no winner, just a thank-you + last tally.
  if (isPoll) {
    return (
      <div className="wrap">
        <Brand />
        <div className="card center">
          <h2 className="plain" style={{ justifyContent: "center" }}>Poll complete</h2>
          <p style={{ fontSize: "2.6rem", margin: "4px 0" }}>📊</p>
          <p className="big" style={{ color: "var(--gold)" }}>Thanks for voting!</p>
          <p className="muted">Your responses have been recorded.</p>
        </div>
        {distribution.length > 0 && (
          <div className="card">
            <h2>Last poll results</h2>
            <PollResults items={distribution} />
          </div>
        )}
      </div>
    );
  }

  const winner = result?.winner;
  const winningTeam = result?.winningTeam;
  const isTeam = (result?.teams?.length ?? teams.length) > 0;
  return (
    <div className="wrap">
      <Brand />
      <div className="card center">
        <h2 className="plain" style={{ justifyContent: "center" }}>Final result</h2>
        <p style={{ fontSize: "2.6rem", margin: "4px 0" }}>🏆</p>
        {isTeam ? (
          winningTeam && <p className="big" style={{ color: "var(--gold)" }}>{winningTeam.name}</p>
        ) : (
          winner && <p className="big" style={{ color: "var(--gold)" }}>{winner.name}</p>
        )}
        <p className="muted">takes the crown</p>
      </div>
      {isTeam && (
        <div className="card">
          <h2>Team standings</h2>
          <Board entries={result?.teams ?? teams} />
        </div>
      )}
      <div className="card">
        <h2>{isTeam ? "Individual standings" : "Final standings"}</h2>
        <Board entries={result?.leaderboard ?? board} />
      </div>
    </div>
  );
}

function QuestionView({
  question,
  locked,
  isPoll,
}: {
  question: QuestionShow;
  locked: boolean;
  isPoll: boolean;
}) {
  const [answer, setAnswer] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; points?: number } | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [failed, setFailed] = useState("");
  const [hintShown, setHintShown] = useState(false);

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
    setRecorded(false);
    setFailed("");
    setHintShown(false);
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
      usedHint: hintShown,
    });
    if (res?.accepted) {
      if (isPoll) setRecorded(true);
      else setFeedback({ correct: res.correct, points: res.points });
    } else {
      setSubmitted(false);
      setFailed("That didn't go through — try once more.");
    }
  }

  const pct = (remaining / question.timeLimit) * 100;
  const disabled = submitted || locked || remaining <= 0;
  const tag = (i: number) => String.fromCharCode(65 + i);
  const hasHint = !isPoll && !!question.hint;
  const penalty = question.hintPenalty ?? 0;
  const counterLabel = isPoll ? "Poll" : "Question";

  return (
    <div className="wrap">
      <Brand />
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="qcount">{counterLabel} {question.index + 1} / {question.total}</span>
          <span className="qcount" style={{ color: remaining <= 5 ? "var(--signal)" : "var(--gold)", fontWeight: 700 }}>
            {remaining}s
          </span>
        </div>
        <div className="timer"><div style={{ width: `${pct}%` }} /></div>
        <p className="qtext">{question.content}</p>

        {hasHint && (
          <div className="hint-box">
            {hintShown ? (
              <p className="hint-text">
                <b>Hint{penalty > 0 ? ` · −${penalty}% points` : ""}</b>
                {question.hint}
              </p>
            ) : (
              <button className="hint-btn" disabled={disabled} onClick={() => setHintShown(true)}>
                {penalty > 0 ? `Need a hint? (−${penalty}% points)` : "Need a hint?"}
              </button>
            )}
          </div>
        )}

        {(question.type === "mcq" || question.type === "poll") && question.options?.map((o, i) => (
          <button
            key={o}
            className={`option ${answer === o ? "selected" : ""}`}
            disabled={disabled}
            onClick={() => submit(o)}
          >
            <span className="tag">{tag(i)}</span>
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
            <span className="tag">{tag(i)}</span>
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
        {recorded && (
          <p className="center feedback-good" style={{ marginTop: 18 }}>✓ Vote recorded</p>
        )}
        {locked && !feedback && !recorded && (
          <p className="muted center" style={{ marginTop: 16 }}>⏱ Time! Answers are locked.</p>
        )}
        {submitted && !locked && !feedback && !recorded && !failed && (
          <p className="muted center" style={{ marginTop: 16 }}>{isPoll ? "Submitting…" : "Answer locked in…"}</p>
        )}
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
