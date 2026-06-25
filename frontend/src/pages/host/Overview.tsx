import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listBanks, listEvents, listReports } from "../../lib/api";
import { useHost } from "./DashboardLayout";

export default function Overview() {
  const { liveEvent } = useHost();
  const [counts, setCounts] = useState({ banks: 0, events: 0, completed: 0 });

  useEffect(() => {
    Promise.all([listBanks(), listEvents(), listReports()])
      .then(([b, e, r]) => setCounts({ banks: b.length, events: e.length, completed: r.length }))
      .catch(() => {});
  }, []);

  return (
    <div className="dash-cards">
      <div className="host-tiles">
        <div className="host-tile accent">
          <span className="k">Question banks</span>
          <span className="v">{counts.banks}</span>
        </div>
        <div className="host-tile">
          <span className="k">Events created</span>
          <span className="v">{counts.events}</span>
        </div>
        <div className="host-tile">
          <span className="k">Completed</span>
          <span className="v">{counts.completed}</span>
        </div>
      </div>

      {liveEvent && (
        <div className="host-card">
          <h2>On air now</h2>
          <div className="evt-row">
            <span className="nm" style={{ display: "flex", flexDirection: "column" }}>
              <b>{liveEvent.name}</b>
              <span className="meta">code {liveEvent.code} · {(liveEvent.event_type ?? "quiz").replace("_", " ")}</span>
            </span>
            <span />
            <Link to="/host/live" className="host-btn host-btn-gold" style={{ textDecoration: "none" }}>
              Open live control →
            </Link>
          </div>
        </div>
      )}

      <div className="host-card">
        <h2>Quick start</h2>
        <p className="host-help" style={{ marginBottom: 16 }}>
          Upload a bank, create an event of any type, and take it live.
        </p>
        <div className="host-btn-row">
          <Link to="/host/banks" className="host-btn host-btn-ghost" style={{ textDecoration: "none" }}>
            ▤ Upload a bank
          </Link>
          <Link to="/host/events" className="host-btn host-btn-gold" style={{ textDecoration: "none" }}>
            ◈ Create an event
          </Link>
          <Link to="/host/reports" className="host-btn host-btn-ghost" style={{ textDecoration: "none" }}>
            ▦ View reports
          </Link>
        </div>
      </div>
    </div>
  );
}
