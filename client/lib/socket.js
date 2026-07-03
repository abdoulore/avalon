"use client";

import { io } from "socket.io-client";
import { getAuthToken } from "./api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const SOCKET_URL = API_URL.replace(/\/api$/, "");

let socket;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      // Function form: re-read the token on every (re)connect attempt, so a
      // reconnect after login/logout carries the current identity.
      auth: (cb) => cb({ token: getAuthToken() }),
    });
  }
  return socket;
}

// Drop the connection so the next getSocket() handshakes with the current
// token. Call on login and logout.
export function resetSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
