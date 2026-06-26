import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During dev, proxy API + Socket.IO to the FastAPI server so the frontend can
// use same-origin relative URLs. In production you'd serve both behind one host.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 so ngrok / LAN devices can reach it
    allowedHosts: true, // accept any Host header (e.g. ngrok tunnel domains)
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      "/socket.io": { target: "http://localhost:8000", ws: true, changeOrigin: true },
    },
  },
});
