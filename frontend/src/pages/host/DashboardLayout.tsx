import { createContext, useContext, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import PasswordGate, { HOST_AUTH_KEY } from "../../components/PasswordGate";
import { EventOut } from "../../lib/api";
import "../Host.css";
import "./dashboard.css";

const LIVE_EVENT_KEY = "host_live_event";

// Shared host state: the event currently being run (if any). Persisted to
// localStorage so a refresh keeps you on the live console.
interface HostCtx {
  liveEvent: EventOut | null;
  goLive: (ev: EventOut) => void;
  endLive: () => void;
}
const Ctx = createContext<HostCtx>({ liveEvent: null, goLive: () => {}, endLive: () => {} });
export const useHost = () => useContext(Ctx);

// Hydrate the persisted live event, tolerating older/partial shapes that
// predate Phase 3 (e.g. a stored event with no event_type).
function readLiveEvent(): EventOut | null {
  const raw = localStorage.getItem(LIVE_EVENT_KEY);
  if (!raw) return null;
  try {
    const ev = JSON.parse(raw);
    if (!ev || typeof ev.id !== "number" || !ev.code) {
      localStorage.removeItem(LIVE_EVENT_KEY);
      return null;
    }
    return { event_type: "quiz", ...ev } as EventOut;
  } catch {
    localStorage.removeItem(LIVE_EVENT_KEY);
    return null;
  }
}

const NAV = [
  { to: "/host", end: true, icon: "▣", label: "Overview" },
  { to: "/host/banks", icon: "▤", label: "Question Banks" },
  { to: "/host/events", icon: "◈", label: "Events" },
  { to: "/host/live", icon: "●", label: "Live Control", live: true },
  { to: "/host/reports", icon: "▦", label: "Reports" },
  { to: "/host/settings", icon: "⚙", label: "Settings" },
];

const TITLES: Record<string, { h: string; sub: string }> = {
  "/host": { h: "Overview", sub: "Your control center for live events." },
  "/host/banks": { h: "Question Banks", sub: "Upload and preview your content." },
  "/host/events": { h: "Events", sub: "Create an event and take it live." },
  "/host/live": { h: "Live Control", sub: "Run the room in real time." },
  "/host/reports": { h: "Reports", sub: "Post-event analytics." },
  "/host/settings": { h: "Settings", sub: "Host access and event defaults." },
};

export default function DashboardLayout() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(HOST_AUTH_KEY) === "1");
  const [liveEvent, setLiveEvent] = useState<EventOut | null>(() => readLiveEvent());
  const loc = useLocation();

  const ctx = useMemo<HostCtx>(
    () => ({
      liveEvent,
      goLive: (ev) => {
        localStorage.setItem(LIVE_EVENT_KEY, JSON.stringify(ev));
        setLiveEvent(ev);
      },
      endLive: () => {
        localStorage.removeItem(LIVE_EVENT_KEY);
        setLiveEvent(null);
      },
    }),
    [liveEvent]
  );

  if (!authed) {
    return (
      <PasswordGate
        help="Enter the host password to open the dashboard."
        onSuccess={() => setAuthed(true)}
      />
    );
  }

  const title = TITLES[loc.pathname] ?? { h: "Dashboard", sub: "" };

  return (
    <Ctx.Provider value={ctx}>
      <div className="host">
        <div className="dash">
          <aside className="dash-side">
            <div className="dash-brand">
              <div className="mark">C</div>
              <div>
                <b>Camarond</b>
                <span>Host Console</span>
              </div>
            </div>
            <nav className="dash-nav">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) => `dash-navitem ${isActive ? "active" : ""}`}
                >
                  <span className="ic">{n.icon}</span>
                  {n.label}
                  {n.live && liveEvent && <span className="live-dot" />}
                </NavLink>
              ))}
            </nav>
            <div className="dash-navspace" />
            <div className="dash-side-foot">
              <NavLink to="/">← Back to home</NavLink>
            </div>
          </aside>

          <div className="dash-main">
            <div className="dash-topbar">
              <div>
                <h1>{title.h}</h1>
                {title.sub && <p className="sub">{title.sub}</p>}
              </div>
              <div className="host-spacer" />
              <div className={`host-tally ${liveEvent ? "live" : ""}`}>
                <span className="dot" /> {liveEvent ? "On Air" : "Off Air"}
              </div>
            </div>
            <div className={`dash-content ${loc.pathname === "/host/live" ? "wide" : ""}`}>
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </Ctx.Provider>
  );
}
