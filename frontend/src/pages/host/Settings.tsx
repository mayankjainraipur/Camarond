import { useNavigate } from "react-router-dom";
import { HOST_AUTH_KEY } from "../../components/PasswordGate";

// The platform is token-less by design (PRD decision): a single shared host
// password gates the console and reports, enforced client-side only. So
// "settings" here are informational plus a lock action — no server state.
export default function Settings() {
  const nav = useNavigate();

  function lock() {
    sessionStorage.removeItem(HOST_AUTH_KEY);
    nav("/");
  }

  return (
    <div className="dash-cards">
      <div className="host-card">
        <h2>Host access</h2>
        <p className="host-help">
          The host console and reports share a single password, set on the server via the{" "}
          <code>HOST_PASSWORD</code> environment variable. There are no per-user accounts — this is
          a deliberate MVP decision. To change the password, update the backend env and restart.
        </p>
        <div style={{ height: 14 }} />
        <button className="host-btn host-btn-danger" onClick={lock}>
          Lock console (sign out)
        </button>
      </div>

      <div className="host-card">
        <h2>Event defaults</h2>
        <p className="host-help">
          Defaults are applied per event type when you create an event (e.g. puzzles and treasure
          hunts get a longer clock and a 50% hint penalty). Adjust them on the{" "}
          <b>Events</b> screen before going live. Per-event settings live with the event, not here.
        </p>
        <ul className="host-help" style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Quiz — 20s, speed bonus on, scored.</li>
          <li>Puzzle — 60s, hints with a points penalty, scored.</li>
          <li>Poll — 30s, unscored, live results.</li>
          <li>Treasure Hunt — 90s per clue, ordered clues with hints, scored.</li>
        </ul>
      </div>
    </div>
  );
}
