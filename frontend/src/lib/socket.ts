import { io, Socket } from "socket.io-client";

// Same-origin: in dev, Vite proxies /socket.io to the FastAPI server; with
// ngrok the single public URL serves both, so no hardcoded host is needed.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
  }
  return socket;
}

// Promise wrapper around emit-with-ack, so handlers can `await` server replies.
export function emitAck<T = any>(event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    getSocket().emit(event, payload, (response: T) => resolve(response));
  });
}
