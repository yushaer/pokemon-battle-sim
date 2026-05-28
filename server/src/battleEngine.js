// Pure-ish battle engine. The engine owns a `battle` object and exposes
// functions to submit actions and resolve a turn into an ordered EVENT STREAM.
//
// The event stream is the key to staggered front-end animation: the server
// resolves the whole turn instantly and authoritatively, but emits a list of
// discrete events ("move", "damage", "faint", ...) that the client plays back
// one at a time with delays so HP bars drain sequentially.

import { calcDamage, compareOrder, isChargeMove, CHARGE_MOVES } from './damage.js';

let battleCounter = 0;

// ---------- construction ----------

// `players` = [{ id, name, team }] where each team entry is a fully-built
// battle Pokemon (see buildBattlePokemon in battleHandler).
export function createBattle(players) {
  const battle = {
    id: `battle_${++battleCounter}`,
    players: {},
    order: [players[0].id, players[1].id],
    turn: 1,
    phase: 'selecting', // selecting | forceSwitch | ended
    pending: {}, // playerId -> action
    forceSwitch: {}, // playerId -> true when that player must pick a replacement
    winner: null,
  };
  for (const p of players) {
    battle.players[p.id] = {
      id: p.id,
      name: p.name,
      team: p.team,
      activeIndex: 0,
    };
  }
  return battle;
}

export function active(battle, playerId) {
  const p = battle.players[playerId];
  return p.team[p.activeIndex];
}

function opponentId(battle, playerId) {
  return battle.order.find((id) => id !== playerId);
}

function effectiveSpeed(pokemon) {
  // Hook for status/item speed modifiers; paralysis etc. would go here.
  return pokemon.stats.speed;
}

function aliveCount(player) {
  return player.team.filter((p) => !p.fainted).length;
}

// ---------- action intake ----------

export function submitAction(battle, playerId, action) {
  if (battle.phase !== 'selecting') return { accepted: false, reason: 'not-selecting' };
  const me = active(battle, playerId);

  // A Pokemon mid-charge is locked into completing its move.
  if (me.charging) {
    battle.pending[playerId] = { type: 'move', moveIndex: me.charging.moveIndex, forced: true };
  } else {
    battle.pending[playerId] = action;
  }

  const bothReady = battle.order.every((id) => battle.pending[id]);
  return { accepted: true, ready: bothReady };
}

export function submitForceSwitch(battle, playerId, targetIndex) {
  if (battle.phase !== 'forceSwitch' || !battle.forceSwitch[playerId]) {
    return { accepted: false };
  }
  const player = battle.players[playerId];
  const target = player.team[targetIndex];
  if (!target || target.fainted || targetIndex === player.activeIndex) {
    return { accepted: false, reason: 'invalid-target' };
  }
  battle.players[playerId]._pendingSwitchTo = targetIndex;
  const allDone = Object.keys(battle.forceSwitch).every(
    (id) => battle.players[id]._pendingSwitchTo !== undefined,
  );
  return { accepted: true, ready: allDone };
}

// ---------- turn resolution ----------

export function resolveTurn(battle) {
  const events = [];
  const [id1, id2] = battle.order;

  // 1. Switches resolve before any move.
  for (const id of battle.order) {
    const action = battle.pending[id];
    if (action?.type === 'switch') {
      doSwitch(battle, id, action.targetIndex, events);
    }
  }

  // 2. Build the list of players who chose to use a move.
  const movers = battle.order.filter((id) => battle.pending[id]?.type === 'move');

  // 3. Sort by priority then speed.
  movers.sort((a, b) => {
    const aMove = active(battle, a).moves[battle.pending[a].moveIndex];
    const bMove = active(battle, b).moves[battle.pending[b].moveIndex];
    return compareOrder(aMove, effectiveSpeed(active(battle, a)), bMove, effectiveSpeed(active(battle, b)));
  });

  // 4. Execute moves in order, skipping fainted attackers.
  for (const id of movers) {
    const attacker = active(battle, id);
    if (attacker.fainted) continue; // fainted before it could act
    executeMove(battle, id, battle.pending[id].moveIndex, events);
  }

  // 5. Clean up and decide next phase.
  battle.pending = {};
  battle.forceSwitch = {};

  // Win check.
  for (const id of battle.order) {
    if (aliveCount(battle.players[id]) === 0) {
      battle.phase = 'ended';
      battle.winner = opponentId(battle, id);
      events.push({
        type: 'end',
        winnerSide: battle.winner,
        text: `${battle.players[battle.winner].name} wins the battle!`,
      });
      return events;
    }
  }

  // Force-switch any side whose active fainted.
  let needSwitch = false;
  for (const id of battle.order) {
    if (active(battle, id).fainted) {
      battle.forceSwitch[id] = true;
      needSwitch = true;
    }
  }
  if (needSwitch) {
    battle.phase = 'forceSwitch';
  } else {
    battle.phase = 'selecting';
    battle.turn += 1;
  }
  return events;
}

// Resolve queued force-switches (after faints) and return their events.
export function resolveForceSwitch(battle) {
  const events = [];
  for (const id of Object.keys(battle.forceSwitch)) {
    const to = battle.players[id]._pendingSwitchTo;
    delete battle.players[id]._pendingSwitchTo;
    doSwitch(battle, id, to, events, /*silentFrom*/ true);
  }
  battle.forceSwitch = {};
  battle.phase = 'selecting';
  battle.turn += 1;
  return events;
}

// ---------- mechanics ----------

function doSwitch(battle, playerId, targetIndex, events, silentFrom = false) {
  const player = battle.players[playerId];
  const fromIndex = player.activeIndex;
  const leaving = player.team[fromIndex];
  // Switching out clears charge state.
  if (leaving) leaving.charging = null;
  player.activeIndex = targetIndex;
  const incoming = player.team[targetIndex];
  events.push({
    type: 'switch',
    side: playerId,
    fromIndex,
    toIndex: targetIndex,
    pokemon: publicPokemon(incoming),
    text: silentFrom
      ? `${player.name} sent out ${cap(incoming.name)}!`
      : `${player.name} withdrew ${cap(leaving.name)} and sent out ${cap(incoming.name)}!`,
  });
}

function executeMove(battle, attackerId, moveIndex, events) {
  const attacker = active(battle, attackerId);
  const defenderId = opponentId(battle, attackerId);
  const defender = active(battle, defenderId);
  const move = attacker.moves[moveIndex];

  // --- multi-turn charge handling ---
  if (isChargeMove(move.name)) {
    const info = CHARGE_MOVES[move.name];
    if (!attacker.charging) {
      // Turn 1: begin charging, become (maybe) semi-invulnerable.
      attacker.charging = { moveIndex, info };
      attacker.semiInvulnerable = !!info.invulnerable;
      events.push({
        type: 'move',
        side: attackerId,
        moveName: prettyMove(move.name),
        text: `${cap(attacker.name)} used ${prettyMove(move.name)}!`,
      });
      events.push({
        type: 'charge',
        side: attackerId,
        text: `${cap(attacker.name)} ${info.message}`,
      });
      return; // no damage on turn 1
    }
    // Turn 2: release.
    attacker.charging = null;
    attacker.semiInvulnerable = false;
  }

  events.push({
    type: 'move',
    side: attackerId,
    moveName: prettyMove(move.name),
    text: `${cap(attacker.name)} used ${prettyMove(move.name)}!`,
  });

  // --- accuracy / invulnerability ---
  if (defender.semiInvulnerable) {
    events.push({ type: 'miss', side: defenderId, text: `${cap(attacker.name)}'s attack missed!` });
    return;
  }
  if (move.accuracy != null && Math.random() * 100 > move.accuracy) {
    events.push({ type: 'miss', side: defenderId, text: `${cap(attacker.name)}'s attack missed!` });
    return;
  }

  // --- status moves: acknowledged but effects not simulated ---
  if (move.damageClass === 'status' || !move.power) {
    events.push({
      type: 'status-fail',
      side: attackerId,
      text: `But nothing happened... (${prettyMove(move.name)} is a status move)`,
    });
    return;
  }

  // --- damage ---
  const result = calcDamage(attacker, defender, move);
  if (result.effectiveness === 0) {
    events.push({
      type: 'text',
      text: `It doesn't affect ${cap(defender.name)}...`,
    });
    return;
  }

  const newHp = Math.max(0, defender.currentHp - result.damage);
  defender.currentHp = newHp;

  events.push({
    type: 'damage',
    side: defenderId, // the side LOSING hp
    targetIndex: battle.players[defenderId].activeIndex,
    amount: result.damage,
    newHp,
    maxHp: defender.maxHp,
    effectiveness: result.effectiveness,
    crit: result.crit,
    text: effectivenessText(result.effectiveness, result.crit),
  });

  if (newHp === 0) {
    defender.fainted = true;
    defender.charging = null;
    defender.semiInvulnerable = false;
    events.push({
      type: 'faint',
      side: defenderId,
      targetIndex: battle.players[defenderId].activeIndex,
      text: `${cap(defender.name)} fainted!`,
    });
  }
}

// ---------- serialization ----------

// Public view of a Pokemon (what the OPPONENT may see).
export function publicPokemon(p) {
  return {
    name: p.name,
    types: p.types,
    sprite: p.sprites.front,
    spriteAnim: p.sprites.frontAnim,
    maxHp: p.maxHp,
    currentHp: p.currentHp,
    fainted: p.fainted,
    level: 100,
  };
}

// Full view of a Pokemon (what its OWNER sees) — includes moves & stats.
export function selfPokemon(p) {
  return {
    name: p.name,
    types: p.types,
    sprite: p.sprites.back,
    spriteAnim: p.sprites.backAnim,
    frontSprite: p.sprites.front,
    maxHp: p.maxHp,
    currentHp: p.currentHp,
    fainted: p.fainted,
    stats: p.stats,
    level: 100,
    charging: p.charging ? prettyMove(p.moves[p.charging.moveIndex]?.name) : null,
    moves: p.moves.map((m) => ({
      name: prettyMove(m.name),
      raw: m.name,
      type: m.type,
      power: m.power,
      accuracy: m.accuracy,
      pp: m.pp,
      priority: m.priority,
      damageClass: m.damageClass,
    })),
  };
}

// Per-player snapshot used to sync the UI after animations finish.
export function serializeFor(battle, playerId) {
  const me = battle.players[playerId];
  const opp = battle.players[opponentId(battle, playerId)];
  return {
    battleId: battle.id,
    turn: battle.turn,
    phase: battle.phase,
    winner: battle.winner,
    needsAction: battle.phase === 'selecting',
    needsSwitch: battle.phase === 'forceSwitch' && !!battle.forceSwitch[playerId],
    you: {
      id: me.id,
      name: me.name,
      activeIndex: me.activeIndex,
      team: me.team.map(selfPokemon),
    },
    opponent: {
      id: opp.id,
      name: opp.name,
      remaining: aliveCount(opp),
      active: publicPokemon(opp.team[opp.activeIndex]),
    },
  };
}

// ---------- text helpers ----------

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function prettyMove(name) {
  return (name || '')
    .split('-')
    .map((w) => cap(w))
    .join(' ');
}
function effectivenessText(eff, crit) {
  const parts = [];
  if (crit) parts.push('A critical hit!');
  if (eff > 1) parts.push("It's super effective!");
  else if (eff < 1 && eff > 0) parts.push("It's not very effective...");
  return parts.join(' ');
}
