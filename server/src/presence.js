// Tracks which authenticated users are currently online and their status.
// Keyed by userId (one active session per user; newest socket wins).

const online = new Map(); // userId -> { userId, username, socketId, status }

export function setOnline({ userId, username, socketId }) {
  online.set(userId, { userId, username, socketId, status: 'idle' });
}

export function removeBySocket(socketId) {
  for (const [userId, v] of online) {
    if (v.socketId === socketId) {
      online.delete(userId);
      return v;
    }
  }
  return null;
}

export function getByUser(userId) {
  return online.get(userId) || null;
}

export function getBySocket(socketId) {
  for (const v of online.values()) if (v.socketId === socketId) return v;
  return null;
}

export function socketOf(userId) {
  return online.get(userId)?.socketId || null;
}

export function setStatus(userId, status) {
  const v = online.get(userId);
  if (v) v.status = status;
}

export function list() {
  return [...online.values()].map(({ userId, username, status }) => ({ userId, username, status }));
}

export function broadcast(io) {
  io.emit('lobby:update', list());
}
