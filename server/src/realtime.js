// Wires Socket.io: authenticates every connection via JWT, then attaches the
// lobby and battle handlers.
import { verifyToken } from './auth.js';
import { attachLobbyHandlers } from './lobbyHandler.js';
import { attachBattleHandlers } from './battleManager.js';

export function registerRealtime(io) {
  // Authenticate the socket handshake. The client passes { auth: { token } }.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.id;
      socket.data.username = payload.username;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[socket] ${socket.data.username} connected (${socket.id})`);
    attachLobbyHandlers(io, socket);
    attachBattleHandlers(io, socket);
    socket.on('disconnect', () => {
      console.log(`[socket] ${socket.data.username} disconnected (${socket.id})`);
    });
  });
}
