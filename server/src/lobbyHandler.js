// Lobby: presence, random matchmaking queue, and direct user-to-user
// challenges. Battles themselves are created via battleManager.startBattle.

import * as presence from './presence.js';
import { startBattle } from './battleManager.js';

let queue = []; // [{ socketId, name, teamConfig }]
const challenges = new Map(); // challengeId -> { id, from, to, fromTeam, fromName, timer }
let challengeSeq = 0;

function emitError(io, socketId, message) {
  io.to(socketId).emit('matchError', { message: String(message) });
}

async function tryRandomMatch(io) {
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    const aSock = io.sockets.sockets.get(a.socketId);
    const bSock = io.sockets.sockets.get(b.socketId);
    if (!aSock?.connected) {
      if (bSock?.connected) queue.unshift(b);
      continue;
    }
    if (!bSock?.connected) {
      if (aSock?.connected) queue.unshift(a);
      continue;
    }
    io.to(a.socketId).emit('matchStatus', { status: 'building' });
    io.to(b.socketId).emit('matchStatus', { status: 'building' });
    try {
      await startBattle(io, [a, b]);
    } catch (err) {
      emitError(io, a.socketId, err.message || err);
      emitError(io, b.socketId, err.message || err);
    }
  }
}

function cancelChallengesInvolving(socketId, io, reason) {
  for (const [id, c] of challenges) {
    if (c.from === socketId || c.to === socketId) {
      clearTimeout(c.timer);
      challenges.delete(id);
      const other = c.from === socketId ? c.to : c.from;
      if (reason) io.to(other).emit('challenge:cancelled', { challengeId: id, reason });
    }
  }
}

export function attachLobbyHandlers(io, socket) {
  const { userId, username } = socket.data;

  // Register presence and announce.
  presence.setOnline({ userId, username, socketId: socket.id });
  presence.broadcast(io);
  socket.emit('lobby:update', presence.list());

  socket.on('lobby:get', () => socket.emit('lobby:update', presence.list()));

  // ----- random matchmaking -----
  socket.on('queue:find', ({ name, team }) => {
    queue = queue.filter((q) => q.socketId !== socket.id);
    queue.push({ socketId: socket.id, name: name || username, teamConfig: team });
    presence.setStatus(userId, 'searching');
    presence.broadcast(io);
    socket.emit('matchStatus', { status: 'queued', position: queue.length });
    tryRandomMatch(io);
  });

  socket.on('queue:cancel', () => {
    queue = queue.filter((q) => q.socketId !== socket.id);
    presence.setStatus(userId, 'idle');
    presence.broadcast(io);
    socket.emit('matchStatus', { status: 'idle' });
  });

  // ----- direct challenges -----
  socket.on('challenge:send', ({ toUserId, name, team }) => {
    const target = presence.getByUser(toUserId);
    if (!target) return socket.emit('challenge:error', { message: 'That user is no longer online.' });
    if (target.status !== 'idle') {
      return socket.emit('challenge:error', { message: 'That user is busy right now.' });
    }
    if (toUserId === userId) {
      return socket.emit('challenge:error', { message: "You can't challenge yourself." });
    }
    const id = `chal_${++challengeSeq}`;
    const timer = setTimeout(() => {
      if (challenges.has(id)) {
        challenges.delete(id);
        socket.emit('challenge:cancelled', { challengeId: id, reason: 'timeout' });
        io.to(target.socketId).emit('challenge:expired', { challengeId: id });
      }
    }, 30000);
    challenges.set(id, {
      id,
      from: socket.id,
      to: target.socketId,
      fromUserId: userId,
      fromTeam: team,
      fromName: name || username,
    });
    challenges.get(id).timer = timer;
    io.to(target.socketId).emit('challenge:incoming', {
      challengeId: id,
      fromUsername: username,
      fromUserId: userId,
    });
    socket.emit('challenge:sent', { challengeId: id, toUsername: target.username });
  });

  socket.on('challenge:cancel', ({ challengeId }) => {
    const c = challenges.get(challengeId);
    if (!c || c.from !== socket.id) return;
    clearTimeout(c.timer);
    challenges.delete(challengeId);
    io.to(c.to).emit('challenge:expired', { challengeId });
  });

  socket.on('challenge:respond', async ({ challengeId, accept, name, team }) => {
    const c = challenges.get(challengeId);
    if (!c || c.to !== socket.id) return;
    clearTimeout(c.timer);
    challenges.delete(challengeId);

    if (!accept) {
      io.to(c.from).emit('challenge:declined', { challengeId, byUsername: username });
      return;
    }
    // Both players still online?
    const fromSock = io.sockets.sockets.get(c.from);
    if (!fromSock?.connected) {
      return socket.emit('challenge:error', { message: 'The challenger went offline.' });
    }
    try {
      await startBattle(io, [
        { socketId: c.from, name: c.fromName, teamConfig: c.fromTeam },
        { socketId: socket.id, name: name || username, teamConfig: team },
      ]);
    } catch (err) {
      emitError(io, c.from, err.message || err);
      emitError(io, socket.id, err.message || err);
    }
  });

  socket.on('disconnect', () => {
    queue = queue.filter((q) => q.socketId !== socket.id);
    cancelChallengesInvolving(socket.id, io, 'offline');
    presence.removeBySocket(socket.id);
    presence.broadcast(io);
  });
}
