import { useState } from "react";
import { useNavigate } from "react-router-dom";

// Landing page: a participant enters a code, or a host jumps to the console.
export default function Home() {
  const [code, setCode] = useState("");
  const nav = useNavigate();

  const ready = code.length >= 4;
  const join = () => ready && nav(`/play?code=${code}`);

  return (
    <div className="wrap">
      <div className="brand">
        <div className="mark">C</div>
        <div>
          <b>Camarond</b>
          <span>Live Quiz</span>
        </div>
      </div>

      <div className="card center">
        <h1>Quiz night, live.</h1>
        <p className="muted">Got a code from the host? Drop it in and you're on the board.</p>
      </div>

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

      <div className="card">
        <h2>Host an event</h2>
        <p className="muted" style={{ margin: "0 0 16px" }}>
          Upload a question bank, set the clock, and run the room live.
        </p>
        <button className="ghost block" onClick={() => nav("/host")}>
          Open host console →
        </button>
      </div>
    </div>
  );
}
