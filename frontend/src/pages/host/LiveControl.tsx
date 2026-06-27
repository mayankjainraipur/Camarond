import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PollResults from "../../components/PollResults";
import { emitAck, getSocket } from "../../lib/socket";
import {
  C2S,
  S2C,
  DistributionItem,
  LeaderboardEntry,
  LeaderboardUpdate,
  MonitorState,
  QuestionShow,
  TeamEntry,
  UpcomingQuestion,
} from "../../types/contracts";
import { useHost } from "./DashboardLayout";

export default function LiveControl() {
  const { liveEvent, endLive } = useHost();

  if (!liveEvent) {
    return (
      <div className="host-card">
        <h2>No live event</h2>
        <p className="host-empty">
          Create an event and choose “Create &amp; go live”, or launch one from{" "}
          <Link to="/host/events" style={{ color: "var(--gold)" }}>Events</Link>.
        </p>
      </div>
    );
  }

  return <Live key={liveEvent.id} onCleared={endLive} />;
}

function Live({ onCleared }: { onCleared: () => void }) {
  const { liveEvent } = useHost();
  const event = liveEvent!;
  const isPoll = event.event_type === "poll";
  const isTreasure = event.event_type === "treasure_hunt";

  const [lobby, setLobby] = useState<{ participants: string[] } | null>(null);
  const [monitor, setMonitor] = useState<MonitorState | null>(null);
  const [question, setQuestion] = useState<QuestionShow | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [distribution, setDistribution] = useState<DistributionItem[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingQuestion | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const joinUrl = `${window.location.origin}/play?code=${event.code}`;

  useEffect(() => {
    const s = getSocket();
    const onLobby = (d: any) => {
      setLobby(d);
      if (d.teams) setTeams(d.teams);
    };
    const onMonitor = (d: MonitorState) => {
      setMonitor(d);
      if (d.teams) setTeams(d.teams);
      if (d.distribution) setDistribution(d.distribution);
      setUpcoming(d.upcoming ?? null);
    };
    const onQuestion = (d: QuestionShow) => setQuestion(d);
    const onBoard = (d: LeaderboardUpdate) => {
      setBoard(d.entries);
      if (d.teams) setTeams(d.teams);
      if (d.distribution) setDistribution(d.distribution);
    };
    const onComplete = (d: { leaderboard: LeaderboardEntry[]; teams?: TeamEntry[] }) => {
      setBoard(d.leaderboard);
      if (d.teams) setTeams(d.teams);
      setDone(true);
    };
    s.on(S2C.LOBBY_UPDATE, onLobby);
    s.on(S2C.HOST_MONITOR, onMonitor);
    s.on(S2C.QUESTION_SHOW, onQuestion);
    s.on(S2C.LEADERBOARD_UPDATE, onBoard);
    s.on(S2C.EVENT_COMPLETE, onComplete);

    emitAck<any>(C2S.HOST_JOIN, { eventId: event.id }).then((ack) => {
      if (!ack?.ok) return;
      if (ack.monitor) setMonitor(ack.monitor);
      if (ack.monitor?.teams) setTeams(ack.monitor.teams);
      setUpcoming(ack.monitor?.upcoming ?? null);
      if (ack.currentQuestion) setQuestion(ack.currentQuestion);
      if (ack.leaderboard?.length) setBoard(ack.leaderboard);
      if (ack.sessionState === "completed") setDone(true);
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
  const nextLabel = isTreasure ? "Next clue →" : "Next question →";
  const startLabel = isPoll ? "Open first poll" : "Start event";

  return (
    <div className="host-deck">
      {/* Left: broadcast / join + controls */}
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
                {startLabel}
              </button>
            )}
            {started && !done && (
              <>
                <button
                  className="host-btn host-btn-gold"
                  onClick={() => emitAck(C2S.HOST_NEXT, { eventId: event.id })}
                >
                  {nextLabel}
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
              <button className="host-btn host-btn-gold host-btn-block" onClick={onCleared}>
                Done — clear console
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

      {/* Center: telemetry + question + what's next */}
      <div className="host-col">
        <div className="host-tiles">
          <div className="host-tile accent">
            <span className="k">In the room</span>
            <span className="v">{participants}</span>
          </div>
          <div className="host-tile">
            <span className="k">{isTreasure ? "Clue" : isPoll ? "Poll" : "Question"}</span>
            <span className="v">
              {started ? (monitor!.index ?? 0) + 1 : "—"}
              {started && <small> / {monitor!.total}</small>}
            </span>
          </div>
          <div className="host-tile">
            <ProgressRing pct={answeredPct} />
            <span className="k">{isPoll ? "Voted" : "Answered"}</span>
            <span className="v">
              {answered}
              <small> / {participants}</small>
            </span>
          </div>
        </div>

        {question && !done && (
          <NowOnAir
            question={question}
            correctAnswer={isPoll ? null : monitor?.correctAnswer ?? null}
            hint={monitor?.hint ?? question.hint ?? null}
            isPoll={isPoll}
            distribution={distribution}
          />
        )}

        {!done && (
          <Upcoming
            upcoming={upcoming}
            started={started}
            isPoll={isPoll}
            isTreasure={isTreasure}
          />
        )}
      </div>

      {/* Right: standings / live poll results */}
      <div className="host-col">
        {/* Polls: live results instead of a leaderboard */}
        {isPoll ? (
          <div className="host-card">
            <h2>{done ? "📊 Final poll results" : "Live results"}</h2>
            <PollResults items={distribution} emptyText="Results appear as votes come in." />
          </div>
        ) : (
          <>
            {event.team_mode && (
              <div className="host-card">
                <h2>{done ? "🏆 Final team standings" : "Team standings"}</h2>
                {teams.length > 0 ? (
                  teams.map((t) => (
                    <div key={t.index} className={`host-lb-row ${t.rank === 1 ? "top1" : ""}`}>
                      <span className="rank">{t.rank}</span>
                      <span className="nm">
                        {t.name}
                        <small style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 8 }}>
                          {t.members.length} {t.members.length === 1 ? "player" : "players"}
                        </small>
                      </span>
                      <span className="sc">{t.score.toLocaleString()}</span>
                    </div>
                  ))
                ) : (
                  <p className="host-empty">Teams fill in as players join.</p>
                )}
              </div>
            )}

            <div className="host-card">
              <h2>
                {event.team_mode ? "Individual standings" : done ? "🏆 Final standings" : "Live standings"}
              </h2>
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
          </>
        )}
      </div>
    </div>
  );
}

function Upcoming({
  upcoming,
  started,
  isPoll,
  isTreasure,
}: {
  upcoming: UpcomingQuestion | null;
  started: boolean;
  isPoll: boolean;
  isTreasure: boolean;
}) {
  const noun = isTreasure ? "clue" : isPoll ? "poll" : "question";
  return (
    <div className="host-card host-upcoming">
      <h2>Upcoming</h2>
      {upcoming ? (
        <div className="host-upcoming-item">
          <span className="host-upcoming-idx">{upcoming.index + 1}</span>
          <p className="host-upcoming-text">{upcoming.content}</p>
        </div>
      ) : (
        <p className="host-empty">
          {started
            ? `This is the final ${noun} — nothing queued after it.`
            : `No ${noun}s queued.`}
        </p>
      )}
    </div>
  );
}

function NowOnAir({
  question,
  correctAnswer,
  hint,
  isPoll,
  distribution,
}: {
  question: QuestionShow;
  correctAnswer: string | null;
  hint: string | null;
  isPoll: boolean;
  distribution: DistributionItem[];
}) {
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
  const tag = (i: number) => String.fromCharCode(65 + i);
  const norm = (s: string) => s.trim().toLowerCase();
  const isCorrect = (o: string) => correctAnswer != null && norm(o) === norm(correctAnswer);

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

      {hint && (
        <p className="hint-text" style={{ marginTop: 0 }}>
          <b>Hint shown to solvers</b>
          {hint}
        </p>
      )}

      {/* Poll: show live tally under the question */}
      {isPoll ? (
        <div style={{ marginTop: 14 }}>
          <PollResults items={distribution} emptyText="Waiting for votes…" />
        </div>
      ) : (
        <>
          {question.options && question.options.length > 0 && (
            <div className="host-opts">
              {question.options.map((o, i) => (
                <div key={o} className={`host-opt ${isCorrect(o) ? "correct" : ""}`}>
                  <span className="tag">{tag(i)}</span>
                  {o}
                  {isCorrect(o) && <span className="host-opt-check">✓</span>}
                </div>
              ))}
            </div>
          )}
          {correctAnswer != null && correctAnswer !== "" && (
            <div className="host-answer">
              <span className="host-answer-label">Correct answer</span>
              <span className="host-answer-val">{correctAnswer}</span>
            </div>
          )}
        </>
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
