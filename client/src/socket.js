import { io } from 'socket.io-client';
import { getToken } from './api/auth';

const URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

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
