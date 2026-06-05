// Battle session management: owns live battles, starts them from two teams
// (used by both random matchmaking and direct challenges), and wires the
// per-socket battle action handlers. Transport details only — the rules live
// in battleEngine.js.

import {
  createBattle,
  submitAction,
  submitForceSwitch,
  resolveTurn,
  resolveForceSwitch,
  serializeFor,
} from './battleEngine.js';
import { buildTeam } from './teamBuilder.js';
import * as presence from './presence.js';

const battles = new Map(); // battleId -> battle
const socketBattle = new Map(); // socketId -> battleId

function markStatus(io, socketId, status) {
  const u = presence.getBySocket(socketId);
  if (u) presence.setStatus(u.userId, status);
}

// players = [{ socketId, name, teamConfig }]. Throws on bad teams (caller emits the error).
export async function startBattle(io, players) {
  const [a, b] = players;
  const [teamA, teamB] = await Promise.all([buildTeam(a.teamConfig), buildTeam(b.teamConfig)]);
  const battle = createBattle([
    { id: a.socketId, name: a.name, team: teamA },
    { id: b.socketId, name: b.name, team: teamB },
  ]);
  battles.set(battle.id, battle);
  socketBattle.set(a.socketId, battle.id);
  socketBattle.set(b.socketId, battle.id);

  for (const p of players) {
    markStatus(io, p.socketId, 'battle');
    io.to(p.socketId).emit('battleStart', serializeFor(battle, p.socketId));
  }
  presence.broadcast(io);
  return battle.id;
}

function broadcastTurn(io, battle, events) {
  for (const id of battle.order) {
    io.to(id).emit('turnResult', { events, stateAfter: serializeFor(battle, id) });
  }
}

function endBattle(io, battle) {
  for (const id of battle.order) {
    socketBattle.delete(id);
    markStatus(io, id, 'idle');
  }
  battles.delete(battle.id);
  presence.broadcast(io);
}

export function attachBattleHandlers(io, socket) {
  socket.on('submitAction', (action) => {
    const battle = battles.get(socketBattle.get(socket.id));
    if (!battle || battle.phase !== 'selecting') return;
    const res = submitAction(battle, socket.id, action);
    if (!res.accepted) {
      socket.emit('actionRejected', { reason: res.reason });
      return;
    }
    battle.order.forEach((id) => io.to(id).emit('waiting', { from: socket.id }));
    if (res.ready) {
      const events = resolveTurn(battle);
      broadcastTurn(io, battle, events);
      if (battle.phase === 'ended') endBattle(io, battle);
    }
  });

  socket.on('submitSwitch', ({ targetIndex }) => {
    const battle = battles.get(socketBattle.get(socket.id));
    if (!battle) return;
    if (battle.phase === 'forceSwitch') {
      const res = submitForceSwitch(battle, socket.id, targetIndex);
      if (!res.accepted) {
        socket.emit('actionRejected', { reason: res.reason || 'invalid-switch' });
        return;
      }
      if (res.ready) broadcastTurn(io, battle, resolveForceSwitch(battle));
    } else if (battle.phase === 'selecting') {
      const res = submitAction(battle, socket.id, { type: 'switch', targetIndex });
      if (res.ready) {
        const events = resolveTurn(battle);
        broadcastTurn(io, battle, events);
        if (battle.phase === 'ended') endBattle(io, battle);
      }
    }
  });

  // Voluntary forfeit (the "Forfeit" button during battle).
  socket.on('forfeit', () => {
    const battle = battles.get(socketBattle.get(socket.id));
    if (!battle || battle.phase === 'ended') return;
    for (const id of battle.order) {
      if (id === socket.id) io.to(id).emit('forfeited', { message: 'You forfeited the battle.' });
      else io.to(id).emit('opponentLeft', { message: 'Your opponent forfeited. You win!' });
    }
    battle.phase = 'ended';
    endBattle(io, battle);
  });

  // Forfeit / cleanup when a battler disconnects.
  socket.on('disconnect', () => {
    const battleId = socketBattle.get(socket.id);
    if (!battleId) return;
    const battle = battles.get(battleId);
    if (!battle) return;
    for (const id of battle.order) {
      if (id !== socket.id) {
        io.to(id).emit('opponentLeft', {
          message: 'Your opponent disconnected. You win by forfeit!',
        });
      }
    }
    endBattle(io, battle);
  });
}
