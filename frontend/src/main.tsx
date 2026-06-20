import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import "./index.css";
import Home from "./pages/Home";
import Host from "./pages/Host";
import Play from "./pages/Play";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host" element={<Host />} />
        {/* Participants land here from the shared link: /play?code=ABC123 */}
        <Route path="/play" element={<Play />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
