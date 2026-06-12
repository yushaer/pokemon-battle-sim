import { io } from 'socket.io-client';
import { getToken } from './api/auth';

// Dev talks to the local server; production defaults to same-origin (the
// server serves the built client), unless VITE_SERVER_URL overrides it.
const URL =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin);

// Connect lazily: the socket is only established after the user logs in, and
// the JWT is sent in the handshake so the server can authenticate it.
export const socket = io(URL, { autoConnect: false });

export function connectSocket() {
  socket.auth = { token: getToken() };
  if (!socket.connected) socket.connect();
}

export function disconnectSocket() {
  if (socket.connected) socket.disconnect();
}
