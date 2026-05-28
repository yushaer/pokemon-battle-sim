// Matchmaking + Socket.io orchestration. This module is the only place that
// touches sockets; the engine itself is transport-agnostic.

import { fetchPokemon, fetchMove } from './pokeapi.js';
import { computeStats, validateEvs } from './statCalc.js';
import {
  createBattle,
  submitAction,
  submitForceSwitch,
  resolveTurn,
  resolveForceSwitch,
  serializeFor,
} from './battleEngine.js';

const STAT_KEYS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];

// Build one battle-ready Pokemon from a client team-slot config.
// The server re-fetches base stats & move data so it never trusts client numbers.
async function buildBattlePokemon(slot) {
  const api = await fetchPokemon(slot.species);

  if (!validateEvs(slot.evs)) {
    throw new Error(`Invalid EV spread for ${slot.species} (max 510 total / 252 per stat).`);
  }

  const ivs = {};
  const evs = {};
  for (const k of STAT_KEYS) {
    ivs[k] = clampInt(slot.ivs?.[k], 0, 31, 31);
    evs[k] = clampInt(slot.evs?.[k], 0, 252, 0);
  }

  const stats = computeStats(api.baseStats, ivs, evs, slot.nature || 'hardy', 100);

  // Validate moves against the species' real move pool, fetch their data.
  const chosen = (slot.moves || []).slice(0, 4).filter(Boolean);
  if (chosen.length === 0) throw new Error(`${slot.species} has no moves selected.`);
  const moves = [];
  for (const moveName of chosen) {
    if (!api.movePool.includes(moveName)) {
      throw new Error(`${moveName} is not in ${slot.species}'s move pool.`);
    }
    const md = await fetchMove(moveName);
    moves.push(md);
  }

  return {
    species: api.name,
    name: api.name,
    types: api.types,
    sprites: api.sprites,
    baseStats: api.baseStats,
    stats,
    maxHp: stats.hp,
    currentHp: stats.hp,
    moves,
    fainted: false,
    charging: null,
    semiInvulnerable: false,
  };
}

async function buildTeam(teamConfig) {
  if (!Array.isArray(teamConfig) || teamConfig.length < 1 || teamConfig.length > 6) {
    throw new Error('Team must have between 1 and 6 Pokemon.');
  }
  const team = [];
  for (const slot of teamConfig) {
    team.push(await buildBattlePokemon(slot));
  }
  return team;
}

function clampInt(v, lo, hi, dflt) {
  const n = Number.isFinite(v) ? Math.floor(v) : dflt;
  return Math.max(lo, Math.min(hi, n));
}

// Send the same event stream to both players, plus a per-player snapshot.
function broadcastTurn(io, battle, events) {
  for (const id of battle.order) {
    io.to(id).emit('turnResult', {
      events,
      stateAfter: serializeFor(battle, id),
    });
  }
}

export function registerBattleHandlers(io) {
  let queue = []; // [{ socket, name, teamConfig }]
  const battles = new Map(); // battleId -> battle
  const socketBattle = new Map(); // socketId -> battleId

  async function tryMatch() {
    while (queue.length >= 2) {
      const a = queue.shift();
      const b = queue.shift();
      // Skip anyone who disconnected while queued.
      if (!a.socket.connected) {
        if (b.socket.connected) queue.unshift(b);
        continue;
      }
      if (!b.socket.connected) {
        if (a.socket.connected) queue.unshift(a);
        continue;
      }

      a.socket.emit('matchStatus', { status: 'building' });
      b.socket.emit('matchStatus', { status: 'building' });

      try {
        const [teamA, teamB] = await Promise.all([buildTeam(a.teamConfig), buildTeam(b.teamConfig)]);
        const battle = createBattle([
          { id: a.socket.id, name: a.name, team: teamA },
          { id: b.socket.id, name: b.name, team: teamB },
        ]);
        battles.set(battle.id, battle);
        socketBattle.set(a.socket.id, battle.id);
        socketBattle.set(b.socket.id, battle.id);
        a.socket.emit('battleStart', serializeFor(battle, a.socket.id));
        b.socket.emit('battleStart', serializeFor(battle, b.socket.id));
      } catch (err) {
        a.socket.emit('matchError', { message: String(err.message || err) });
        b.socket.emit('matchError', { message: String(err.message || err) });
      }
    }
  }

  io.on('connection', (socket) => {
    console.log(`[socket] connected ${socket.id}`);

    socket.on('findMatch', ({ name, team }) => {
      // Avoid duplicate queue entries.
      queue = queue.filter((q) => q.socket.id !== socket.id);
      queue.push({ socket, name: name || `Trainer-${socket.id.slice(0, 4)}`, teamConfig: team });
      socket.emit('matchStatus', { status: 'queued', position: queue.length });
      tryMatch();
    });

    socket.on('cancelMatch', () => {
      queue = queue.filter((q) => q.socket.id !== socket.id);
      socket.emit('matchStatus', { status: 'idle' });
    });

    socket.on('submitAction', (action) => {
      const battle = battles.get(socketBattle.get(socket.id));
      if (!battle || battle.phase !== 'selecting') return;
      const res = submitAction(battle, socket.id, action);
      if (!res.accepted) {
        socket.emit('actionRejected', { reason: res.reason });
        return;
      }
      // Let both clients know the choice landed.
      io.to(battle.id).emit('opponentReady'); // (rooms not used; harmless no-op)
      battle.order.forEach((id) => io.to(id).emit('waiting', { from: socket.id }));

      if (res.ready) {
        const events = resolveTurn(battle);
        broadcastTurn(io, battle, events);
        cleanupIfEnded(battle);
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
        if (res.ready) {
          const events = resolveForceSwitch(battle);
          broadcastTurn(io, battle, events);
        }
      } else if (battle.phase === 'selecting') {
        // A voluntary switch is just another kind of action.
        const res = submitAction(battle, socket.id, { type: 'switch', targetIndex });
        if (res.ready) {
          const events = resolveTurn(battle);
          broadcastTurn(io, battle, events);
          cleanupIfEnded(battle);
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected ${socket.id}`);
      queue = queue.filter((q) => q.socket.id !== socket.id);
      const battleId = socketBattle.get(socket.id);
      if (battleId) {
        const battle = battles.get(battleId);
        if (battle) {
          for (const id of battle.order) {
            if (id !== socket.id) {
              io.to(id).emit('opponentLeft', { message: 'Your opponent disconnected. You win by forfeit!' });
            }
            socketBattle.delete(id);
          }
          battles.delete(battleId);
        }
      }
    });

    function cleanupIfEnded(battle) {
      if (battle.phase === 'ended') {
        for (const id of battle.order) socketBattle.delete(id);
        battles.delete(battle.id);
      }
    }
  });
}
