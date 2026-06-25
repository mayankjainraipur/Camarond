import { useState } from "react";
import { verifyHostPassword } from "../lib/api";

// Shared host-password gate (used by Host console and Reports). Auth is
// token-less by design: a successful check just sets a sessionStorage flag.
export const HOST_AUTH_KEY = "host_auth";

export default function PasswordGate({
  title = "Host access",
  help = "Enter the host password to continue.",
  onSuccess,
}: {
  title?: string;
  help?: string;
  onSuccess: () => void;
}) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    const ok = await verifyHostPassword(pw);
    setBusy(false);
    if (ok) {
      sessionStorage.setItem(HOST_AUTH_KEY, "1");
      onSuccess();
    } else setError("That password didn't match. Try again.");
  }

  return (
    <div className="host">
      <div className="host-shell">
        <div className="host-card host-gate">
          <h2>{title}</h2>
          <p className="host-help">{help}</p>
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
            {busy ? "Checking…" : "Enter"}
          </button>
          {error && <div className="host-error">{error}</div>}
        </div>
      </div>
    </div>
  );
}
