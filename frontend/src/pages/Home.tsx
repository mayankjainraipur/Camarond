import { useState } from "react";
import { useNavigate } from "react-router-dom";

// Landing page: a participant enters a code, or a host jumps to the console.
export default function Home() {
  const [code, setCode] = useState("");
  const nav = useNavigate();

  return (
    <div className="wrap">
      <div className="card center">
        <h1>Camarond</h1>
        <p className="muted">Live event gaming — join a quiz or host your own.</p>
      </div>

      <div className="card">
        <h2>Join an event</h2>
        <label>Event code</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          maxLength={6}
        />
        <div style={{ height: 12 }} />
        <button
          className="block"
          disabled={code.length < 4}
          onClick={() => nav(`/play?code=${code}`)}
        >
          Join
        </button>
      </div>

      <div className="card">
        <h2>Host an event</h2>
        <p className="muted">Upload a question bank, configure rules, and run it live.</p>
        <button className="ghost" onClick={() => nav("/host")}>
          Open host console
        </button>
      </div>
    </div>
  );
}
