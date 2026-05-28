import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

// Single shared socket instance for the whole app.
export const socket = io(URL, { autoConnect: true });
