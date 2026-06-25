import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import "./index.css";
import Home from "./pages/Home";
import Play from "./pages/Play";
import DashboardLayout from "./pages/host/DashboardLayout";
import Overview from "./pages/host/Overview";
import Banks from "./pages/host/Banks";
import Events from "./pages/host/Events";
import LiveControl from "./pages/host/LiveControl";
import ReportsView from "./pages/host/ReportsView";
import Settings from "./pages/host/Settings";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Participants land here from the shared link: /play?code=ABC123 */}
        <Route path="/play" element={<Play />} />

        {/* Host dashboard — sidebar shell with nested sections. */}
        <Route path="/host" element={<DashboardLayout />}>
          <Route index element={<Overview />} />
          <Route path="banks" element={<Banks />} />
          <Route path="events" element={<Events />} />
          <Route path="live" element={<LiveControl />} />
          <Route path="reports" element={<ReportsView />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Back-compat: the old standalone reports route. */}
        <Route path="/reports" element={<Navigate to="/host/reports" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
