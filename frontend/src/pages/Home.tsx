import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Home.css";

// Landing page: pick a role. Hosts jump to the console; participants
// enter an event code, then continue to the live play view.
export default function Home() {
  const [step, setStep] = useState<"choose" | "join">("choose");
  const [code, setCode] = useState("");
  const nav = useNavigate();

  const ready = code.length >= 4;
  const join = () => ready && nav(`/play?code=${code}`);

  return (
    <div className="home">
      <div className="brand">
        <div className="mark">C</div>
        <div>
          <b>Camarond</b>
          <span>Live Quiz</span>
        </div>
      </div>

      {step === "choose" ? (
        <>
          <h1 className="home-title">Welcome! How will you join today?</h1>

          <div className="home-choices">
            <div
              className="home-card"
              role="button"
              tabIndex={0}
              onClick={() => nav("/host")}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav("/host")}
            >
              <div className="icon role-host" aria-hidden>
                <ShieldIcon />
              </div>
              <h3>I am a Host</h3>
              <p>Create and manage activities</p>
            </div>

            <div
              className="home-card"
              role="button"
              tabIndex={0}
              onClick={() => setStep("join")}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setStep("join")}
            >
              <div className="icon role-participant" aria-hidden>
                <PeopleIcon />
              </div>
              <h3>I am a Participant</h3>
              <p>Join an ongoing activity</p>
            </div>
          </div>
        </>
      ) : (
        <div className="home-join">
          <button className="home-back" onClick={() => setStep("choose")}>
            ← Back
          </button>
          <div className="card">
            <h2>Join an event</h2>
            <label>Event code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="7K2Q9X"
              maxLength={6}
              autoFocus
              style={{
                fontFamily: "var(--mono)",
                fontSize: "1.4rem",
                letterSpacing: "6px",
                textAlign: "center",
                fontWeight: 800,
              }}
            />
            <div className="spacer-12" />
            <button className="block" disabled={!ready} onClick={join}>
              Join event
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
