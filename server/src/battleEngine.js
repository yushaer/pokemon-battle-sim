// Pure-ish battle engine. The engine owns a `battle` object and exposes
// functions to submit actions and resolve a turn into an ordered EVENT STREAM.
//
// The event stream is the key to staggered front-end animation: the server
// resolves the whole turn instantly and authoritatively, but emits a list of
// discrete events ("move", "damage", "faint", ...) that the client plays back
// one at a time with delays so HP bars drain sequentially.

import {
  calcDamage,
  compareOrder,
  isChargeMove,
  CHARGE_MOVES,
  effectiveSpeed,
  effectiveAttack,
  effectiveDefense,
  mapAilment,
  statusImmune,
  clampStage,
  accStageMultiplier,
} from './damage.js';

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
    // Reject a move with no PP left (unless every move is out of PP → Struggle).
    if (action?.type === 'move') {
      const mv = me.moves[action.moveIndex];
      const anyPp = me.moves.some((m) => (m.currentPp ?? m.pp) > 0);
      if (mv && (mv.currentPp ?? mv.pp) <= 0 && anyPp) {
        return { accepted: false, reason: 'no-pp' };
      }
    }
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

  // 4b. End-of-turn residual damage (burn / poison / toxic).
  endOfTurn(battle, events);

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
  // Switching out clears charge state and resets stat stages / flinch
  // (a major status condition, however, persists — as in the games).
  if (leaving) {
    leaving.charging = null;
    leaving.semiInvulnerable = false;
    leaving.flinched = false;
    leaving.protected = false;
    leaving.protectCounter = 0;
    leaving.boosts = emptyBoosts();
    leaving.volatile = { aquaRing: false, ingrained: false, leechSeed: false, confused: 0 };
  }
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

// Synthetic move used when a Pokemon has no PP left on any move.
const STRUGGLE = {
  name: 'struggle',
  type: 'normal',
  power: 50,
  accuracy: null,
  pp: 1,
  priority: 0,
  damageClass: 'physical',
  target: 'selected-pokemon',
  statChanges: [],
  meta: {},
  struggle: true,
};

function deductPp(move) {
  if (move.currentPp != null) move.currentPp = Math.max(0, move.currentPp - 1);
}

// How many times a multi-hit move strikes this use.
function hitCount(move) {
  const mn = move.meta?.minHits;
  const mx = move.meta?.maxHits;
  if (!mx || mx <= 1) return 1;
  if (mn === mx) return mn;
  if (mn === 2 && mx === 5) {
    const dist = [2, 2, 3, 3, 4, 5]; // standard 2–5 distribution
    return dist[Math.floor(Math.random() * dist.length)];
  }
  return mn + Math.floor(Math.random() * (mx - mn + 1));
}

function executeMove(battle, attackerId, moveIndex, events) {
  const attacker = active(battle, attackerId);
  const defenderId = opponentId(battle, attackerId);
  const defender = active(battle, defenderId);
  let move = attacker.moves[moveIndex];

  // --- can the Pokemon act at all? (sleep / freeze / confusion / para / flinch) ---
  if (!canMove(battle, attacker, attackerId, events)) {
    attacker.charging = null;
    attacker.semiInvulnerable = false;
    return;
  }

  // Using anything other than Protect/Detect resets its success ladder.
  if (move.name !== 'protect' && move.name !== 'detect') attacker.protectCounter = 0;

  // --- out of PP? fall back to Struggle if NOTHING is usable ---
  if (move.currentPp != null && move.currentPp <= 0) {
    if (attacker.moves.some((m) => (m.currentPp ?? m.pp) > 0)) {
      events.push({
        type: 'status-fail',
        side: attackerId,
        text: `${cap(attacker.name)} has no PP left for that move!`,
      });
      return;
    }
    move = STRUGGLE;
  }

  // --- multi-turn charge handling (PP is paid on the charge turn) ---
  if (isChargeMove(move.name)) {
    const info = CHARGE_MOVES[move.name];
    if (!attacker.charging) {
      deductPp(move);
      attacker.charging = { moveIndex, info };
      attacker.semiInvulnerable = !!info.invulnerable;
      events.push({
        type: 'move',
        side: attackerId,
        moveName: prettyMove(move.name),
        moveType: move.type,
        category: move.damageClass,
        text: `${cap(attacker.name)} used ${prettyMove(move.name)}!`,
      });
      events.push({ type: 'charge', side: attackerId, text: `${cap(attacker.name)} ${info.message}` });
      return; // no damage on turn 1
    }
    attacker.charging = null;
    attacker.semiInvulnerable = false;
  } else {
    deductPp(move); // PP spent even on a miss, but not when unable to move
  }

  events.push({
    type: 'move',
    side: attackerId,
    moveName: prettyMove(move.name),
    moveType: move.type,
    category: move.damageClass,
    text: `${cap(attacker.name)} used ${prettyMove(move.name)}!`,
  });

  // --- protection / accuracy / invulnerability ---
  const targetsSelf = (move.target || '').includes('user');
  if (!targetsSelf && defender.protected && !defender.fainted) {
    events.push({ type: 'text', text: `${cap(defender.name)} protected itself!` });
    return;
  }
  if (defender.semiInvulnerable) {
    events.push({ type: 'miss', side: defenderId, text: `${cap(attacker.name)}'s attack missed!` });
    return;
  }
  if (move.accuracy != null) {
    // Accuracy/evasion stages: net stage feeds the 3-based multiplier ladder.
    const netStage = (attacker.boosts?.accuracy || 0) - (defender.boosts?.evasion || 0);
    const hitChance = move.accuracy * accStageMultiplier(netStage);
    if (Math.random() * 100 > hitChance) {
      events.push({ type: 'miss', side: defenderId, text: `${cap(attacker.name)}'s attack missed!` });
      return;
    }
  }

  // --- status / non-damaging moves now have real effects ---
  if (move.damageClass === 'status' || !move.power) {
    applyStatusMove(battle, attackerId, defenderId, move, events);
    return;
  }

  // --- damage (multi-hit aware) ---
  const hits = hitCount(move);
  let total = 0;
  let landed = 0;
  for (let h = 0; h < hits; h++) {
    if (defender.fainted) break;
    const result = calcDamage(attacker, defender, move);
    if (result.effectiveness === 0) {
      events.push({ type: 'text', text: `It doesn't affect ${cap(defender.name)}...` });
      return;
    }
    const newHp = Math.max(0, defender.currentHp - result.damage);
    defender.currentHp = newHp;
    total += result.damage;
    landed += 1;
    events.push({
      type: 'damage',
      side: defenderId,
      targetIndex: battle.players[defenderId].activeIndex,
      amount: result.damage,
      newHp,
      maxHp: defender.maxHp,
      effectiveness: result.effectiveness,
      crit: result.crit,
      text: effectivenessText(result.effectiveness, result.crit),
    });
    if (newHp === 0) {
      faint(battle, defenderId, events);
      break;
    }
  }
  if (hits > 1 && landed > 0) {
    events.push({ type: 'text', text: `Hit ${landed} time${landed > 1 ? 's' : ''}!` });
  }

  // Struggle recoil: 1/4 of the user's max HP.
  if (move.struggle) {
    const recoil = Math.max(1, Math.floor(attacker.maxHp / 4));
    const hp = Math.max(0, attacker.currentHp - recoil);
    attacker.currentHp = hp;
    events.push({
      type: 'damage',
      side: attackerId,
      targetIndex: battle.players[attackerId].activeIndex,
      amount: recoil,
      newHp: hp,
      maxHp: attacker.maxHp,
      effectiveness: 1,
      crit: false,
      text: `${cap(attacker.name)} is hit with recoil!`,
    });
    if (hp === 0) faint(battle, attackerId, events);
    return;
  }

  // Drain still heals even if the target fainted; secondary effects don't.
  applyDrainRecoil(battle, attackerId, move, total, events);
  if (defender.fainted) return;

  const meta = move.meta || {};
  if (meta.ailment && meta.ailment !== 'none' && meta.ailmentChance > 0 && roll(meta.ailmentChance)) {
    if (meta.ailment === 'confusion') {
      applyConfusion(defender, events);
    } else {
      const st = mapAilment(meta.ailment, move.name);
      if (st) applyStatus(defender, defenderId, st, events);
    }
  }
  if (move.statChanges?.length && meta.statChance > 0 && roll(meta.statChance)) {
    const toUser = (move.target || '').includes('user');
    const tgtId = toUser ? attackerId : defenderId;
    for (const sc of move.statChanges) applyBoost(active(battle, tgtId), tgtId, sc.stat, sc.change, events);
  }
  if (meta.flinchChance > 0 && roll(meta.flinchChance)) defender.flinched = true;
}

// Moves whose real effect is a recurring "volatile" not captured by PokeAPI's
// numeric meta fields (meta.healing is 0 for these). Handled by name.
const SPECIAL_MOVES = new Set(['aqua-ring', 'ingrain', 'leech-seed', 'protect', 'detect']);

// Apply the primary effect of a non-damaging move.
function applyStatusMove(battle, attackerId, defenderId, move, events) {
  // Volatile/recurring moves are special-cased and fully handle their own text.
  if (SPECIAL_MOVES.has(move.name)) {
    applySpecialMove(battle, attackerId, defenderId, move, events);
    return;
  }

  const attacker = active(battle, attackerId);
  const defender = active(battle, defenderId);
  const meta = move.meta || {};
  let didSomething = false;

  // Stat-stage changes (Swords Dance, Growl, ...). target decides self vs foe.
  if (move.statChanges?.length) {
    const toUser = (move.target || '').includes('user');
    const tgtId = toUser ? attackerId : defenderId;
    const tgt = active(battle, tgtId);
    for (const sc of move.statChanges) {
      if (applyBoost(tgt, tgtId, sc.stat, sc.change, events)) didSomething = true;
    }
  }

  // Major status (Thunder Wave, Toxic, Will-O-Wisp, Spore, Rest, ...).
  const st = mapAilment(meta.ailment, move.name);
  if (st) {
    const toUser = (move.target || '').includes('user'); // e.g. Rest
    const tgtId = toUser ? attackerId : defenderId;
    if (applyStatus(active(battle, tgtId), tgtId, st, events)) didSomething = true;
  } else if (meta.ailment === 'confusion') {
    // Confuse Ray, Supersonic, Swagger-likes.
    if (applyConfusion(defender, events)) didSomething = true;
  }

  // Healing moves (Recover, Roost, ...).
  if (meta.healing > 0) {
    const heal = Math.max(1, Math.floor((attacker.maxHp * meta.healing) / 100));
    const before = attacker.currentHp;
    attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + heal);
    if (attacker.currentHp !== before) {
      events.push({
        type: 'heal',
        side: attackerId,
        targetIndex: battle.players[attackerId].activeIndex,
        newHp: attacker.currentHp,
        maxHp: attacker.maxHp,
        text: `${cap(attacker.name)} restored its HP!`,
      });
      didSomething = true;
    }
  }

  if (!didSomething) {
    events.push({ type: 'status-fail', side: attackerId, text: 'But it failed!' });
  }
}

function ensureVolatile(p) {
  if (!p.volatile) p.volatile = { aquaRing: false, ingrained: false, leechSeed: false, confused: 0 };
  if (p.volatile.confused == null) p.volatile.confused = 0;
  return p.volatile;
}

// Recurring "volatile" moves (Aqua Ring, Ingrain, Leech Seed). The actual HP
// changes happen in endOfTurn(); here we just set the flag.
function applySpecialMove(battle, attackerId, defenderId, move, events) {
  const attacker = active(battle, attackerId);
  const defender = active(battle, defenderId);
  const av = ensureVolatile(attacker);
  const dv = ensureVolatile(defender);

  switch (move.name) {
    case 'aqua-ring':
      if (av.aquaRing) return fail(attackerId, events);
      av.aquaRing = true;
      events.push({ type: 'text', text: `${cap(attacker.name)} surrounded itself with a veil of water!` });
      return true;
    case 'ingrain':
      if (av.ingrained) return fail(attackerId, events);
      av.ingrained = true;
      events.push({ type: 'text', text: `${cap(attacker.name)} planted its roots!` });
      return true;
    case 'leech-seed':
      if (defender.types.includes('grass')) {
        events.push({ type: 'text', text: `It doesn't affect ${cap(defender.name)}...` });
        return false;
      }
      if (dv.leechSeed) return fail(attackerId, events);
      dv.leechSeed = true;
      events.push({ type: 'text', text: `${cap(defender.name)} was seeded!` });
      return true;
    case 'protect':
    case 'detect': {
      // Success chance drops to 1/3^n for consecutive uses.
      const chance = 1 / Math.pow(3, attacker.protectCounter || 0);
      if (Math.random() < chance) {
        attacker.protected = true;
        attacker.protectCounter = (attacker.protectCounter || 0) + 1;
        events.push({ type: 'text', text: `${cap(attacker.name)} protected itself!` });
        return true;
      }
      attacker.protectCounter = 0;
      return fail(attackerId, events);
    }
    default:
      return false;
  }
}

// Confusion is a volatile, separate from major status. Returns true if applied.
function applyConfusion(target, events) {
  if (!target || target.fainted) return false;
  const v = ensureVolatile(target);
  if (v.confused > 0) {
    events.push({ type: 'text', text: 'But it failed!' });
    return false;
  }
  v.confused = 2 + Math.floor(Math.random() * 4); // 2–5 turns incl. snap-out
  events.push({ type: 'text', text: `${cap(target.name)} became confused!` });
  return true;
}

function fail(sideId, events) {
  events.push({ type: 'status-fail', side: sideId, text: 'But it failed!' });
  return false;
}

// --- low-level HP helpers used by residual effects ---
function damagePokemon(battle, sideId, amount, text, events) {
  const p = active(battle, sideId);
  const before = p.currentHp;
  const newHp = Math.max(0, before - amount);
  p.currentHp = newHp;
  events.push({
    type: 'damage',
    side: sideId,
    targetIndex: battle.players[sideId].activeIndex,
    amount: before - newHp,
    newHp,
    maxHp: p.maxHp,
    effectiveness: 1,
    crit: false,
    text,
  });
  if (newHp === 0) faint(battle, sideId, events);
  return before - newHp;
}
function healPokemon(battle, sideId, amount, text, events) {
  const p = active(battle, sideId);
  const before = p.currentHp;
  p.currentHp = Math.min(p.maxHp, before + amount);
  if (p.currentHp !== before) {
    events.push({
      type: 'heal',
      side: sideId,
      targetIndex: battle.players[sideId].activeIndex,
      newHp: p.currentHp,
      maxHp: p.maxHp,
      text,
    });
  }
  return p.currentHp - before;
}

// --- can-move gate ---
function canMove(battle, p, sideId, events) {
  if (p.status === 'sleep') {
    p.sleepTurns -= 1;
    if (p.sleepTurns <= 0) {
      p.status = null;
      events.push({ type: 'text', text: `${cap(p.name)} woke up!` });
    } else {
      events.push({ type: 'text', text: `${cap(p.name)} is fast asleep.` });
      return false;
    }
  }
  if (p.status === 'freeze') {
    if (Math.random() < 0.2) {
      p.status = null;
      events.push({ type: 'text', text: `${cap(p.name)} thawed out!` });
    } else {
      events.push({ type: 'text', text: `${cap(p.name)} is frozen solid!` });
      return false;
    }
  }
  if (p.flinched) {
    events.push({ type: 'text', text: `${cap(p.name)} flinched and couldn't move!` });
    return false;
  }
  // Confusion: counts down each action; 33% chance to hit itself instead.
  const v = ensureVolatile(p);
  if (v.confused > 0) {
    v.confused -= 1;
    if (v.confused <= 0) {
      events.push({ type: 'text', text: `${cap(p.name)} snapped out of its confusion!` });
    } else {
      events.push({ type: 'text', text: `${cap(p.name)} is confused!` });
      if (Math.random() < 1 / 3) {
        // 40-power typeless physical hit against itself.
        const atk = effectiveAttack(p, false);
        const def = effectiveDefense(p, false);
        const baseDmg =
          Math.floor(Math.floor((Math.floor((2 * 100) / 5 + 2) * 40 * atk) / def) / 50) + 2;
        const dmg = Math.max(1, Math.floor(baseDmg * (0.85 + Math.random() * 0.15)));
        damagePokemon(battle, sideId, dmg, `${cap(p.name)} hurt itself in its confusion!`, events);
        return false;
      }
    }
  }
  if (p.status === 'paralysis' && Math.random() < 0.25) {
    events.push({ type: 'text', text: `${cap(p.name)} is paralyzed! It can't move!` });
    return false;
  }
  return true;
}

// --- stat-stage application; returns true if anything changed ---
function applyBoost(target, sideId, statName, change, events) {
  if (!target || target.fainted) return false;
  if (!target.boosts) target.boosts = {};
  const cur = target.boosts[statName] || 0;
  const next = clampStage(cur + change);
  if (next === cur) {
    events.push({
      type: 'text',
      text: `${cap(target.name)}'s ${statLabel(statName)} won't go ${change > 0 ? 'any higher' : 'any lower'}!`,
    });
    return false;
  }
  target.boosts[statName] = next;
  // Structured event so the client can update its live stat panel mid-animation.
  events.push({
    type: 'boost',
    side: sideId,
    stat: statName,
    stage: next,
    delta: next - cur,
    text: `${cap(target.name)}'s ${statLabel(statName)} ${changeWord(change)}!`,
  });
  return true;
}

// --- status condition application; returns true if applied ---
function applyStatus(target, sideId, status, events) {
  if (!target || target.fainted) return false;
  if (target.status) {
    events.push({ type: 'text', text: `But it failed!` });
    return false;
  }
  if (statusImmune(status, target.types)) {
    events.push({ type: 'text', text: `It doesn't affect ${cap(target.name)}...` });
    return false;
  }
  target.status = status;
  if (status === 'sleep') target.sleepTurns = 1 + Math.floor(Math.random() * 3);
  if (status === 'toxic') target.toxicCounter = 1;
  events.push({ type: 'status', side: sideId, status, text: statusInflictText(target.name, status) });
  return true;
}

// --- drain (heal) / recoil on damaging moves ---
function applyDrainRecoil(battle, attackerId, move, damageDealt, events) {
  const drain = move.meta?.drain || 0;
  if (!drain || !damageDealt) return;
  const attacker = active(battle, attackerId);
  if (drain > 0) {
    const heal = Math.max(1, Math.floor((damageDealt * drain) / 100));
    const before = attacker.currentHp;
    attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + heal);
    if (attacker.currentHp !== before) {
      events.push({
        type: 'heal',
        side: attackerId,
        targetIndex: battle.players[attackerId].activeIndex,
        newHp: attacker.currentHp,
        maxHp: attacker.maxHp,
        text: `${cap(attacker.name)} had its energy drained!`,
      });
    }
  } else {
    const recoil = Math.max(1, Math.floor((damageDealt * Math.abs(drain)) / 100));
    const newHp = Math.max(0, attacker.currentHp - recoil);
    attacker.currentHp = newHp;
    events.push({
      type: 'damage',
      side: attackerId,
      targetIndex: battle.players[attackerId].activeIndex,
      amount: recoil,
      newHp,
      maxHp: attacker.maxHp,
      effectiveness: 1,
      crit: false,
      text: `${cap(attacker.name)} is hit with recoil!`,
    });
    if (newHp === 0) faint(battle, attackerId, events);
  }
}

// --- end-of-turn residual effects, in roughly the canonical order ---
function endOfTurn(battle, events) {
  const order = [...battle.order].sort(
    (a, b) => effectiveSpeed(active(battle, b)) - effectiveSpeed(active(battle, a)),
  );
  for (const id of order) {
    const p = active(battle, id);
    if (p.fainted) continue;
    const v = ensureVolatile(p);

    // 1. Aqua Ring / Ingrain self-heal (1/16 max HP).
    if (v.aquaRing) {
      healPokemon(battle, id, Math.max(1, Math.floor(p.maxHp / 16)), `${cap(p.name)} is healed by Aqua Ring!`, events);
    }
    if (v.ingrained) {
      healPokemon(battle, id, Math.max(1, Math.floor(p.maxHp / 16)), `${cap(p.name)} absorbed nutrients with its roots!`, events);
    }
    if (p.fainted) continue;

    // 2. Leech Seed: the seeded Pokemon loses 1/8 and the opponent recovers it.
    if (v.leechSeed) {
      const drained = damagePokemon(battle, id, Math.max(1, Math.floor(p.maxHp / 8)), `${cap(p.name)}'s health is sapped by Leech Seed!`, events);
      const oppId = opponentId(battle, id);
      if (drained > 0 && !active(battle, oppId).fainted) {
        healPokemon(battle, oppId, drained, null, events);
      }
    }
    if (p.fainted) continue;

    // 3. Burn / Poison / Toxic damage.
    let dmg = 0;
    let text = '';
    if (p.status === 'burn') {
      dmg = Math.max(1, Math.floor(p.maxHp / 16));
      text = `${cap(p.name)} was hurt by its burn!`;
    } else if (p.status === 'poison') {
      dmg = Math.max(1, Math.floor(p.maxHp / 8));
      text = `${cap(p.name)} was hurt by poison!`;
    } else if (p.status === 'toxic') {
      dmg = Math.max(1, Math.floor((p.maxHp * p.toxicCounter) / 16));
      p.toxicCounter += 1;
      text = `${cap(p.name)} was hurt by poison!`;
    }
    if (dmg > 0) damagePokemon(battle, id, dmg, text, events);
  }
  // Flinch and Protect only last the turn they were used.
  for (const id of battle.order) {
    const p = active(battle, id);
    p.flinched = false;
    p.protected = false;
  }
}

// --- faint helper ---
function faint(battle, sideId, events) {
  const p = active(battle, sideId);
  p.fainted = true;
  p.charging = null;
  p.semiInvulnerable = false;
  events.push({
    type: 'faint',
    side: sideId,
    targetIndex: battle.players[sideId].activeIndex,
    text: `${cap(p.name)} fainted!`,
  });
}

function roll(chancePercent) {
  return Math.random() * 100 < chancePercent;
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
    status: p.status || null,
    boosts: p.boosts || emptyBoosts(),
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
    status: p.status || null,
    boosts: p.boosts || emptyBoosts(),
    level: 100,
    charging: p.charging ? prettyMove(p.moves[p.charging.moveIndex]?.name) : null,
    moves: p.moves.map((m) => ({
      name: prettyMove(m.name),
      raw: m.name,
      type: m.type,
      power: m.power,
      accuracy: m.accuracy,
      pp: m.maxPp ?? m.pp,
      currentPp: m.currentPp ?? m.pp,
      priority: m.priority,
      damageClass: m.damageClass,
      // Extra detail for the in-battle hover tooltip.
      shortEffect: m.shortEffect || '',
      target: m.target || 'selected-pokemon',
      statChanges: m.statChanges || [],
      meta: m.meta || null,
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
      teamSize: opp.team.length,
      active: publicPokemon(opp.team[opp.activeIndex]),
    },
  };
}

// ---------- text helpers ----------

function emptyBoosts() {
  return {
    attack: 0,
    defense: 0,
    'special-attack': 0,
    'special-defense': 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  };
}

const STAT_LABELS = {
  attack: 'Attack',
  defense: 'Defense',
  'special-attack': 'Sp. Atk',
  'special-defense': 'Sp. Def',
  speed: 'Speed',
  accuracy: 'accuracy',
  evasion: 'evasiveness',
};
function statLabel(key) {
  return STAT_LABELS[key] || key;
}
function changeWord(change) {
  const n = Math.abs(change);
  if (change > 0) return n >= 3 ? 'rose drastically' : n === 2 ? 'sharply rose' : 'rose';
  return n >= 3 ? 'severely fell' : n === 2 ? 'harshly fell' : 'fell';
}
function statusInflictText(name, status) {
  switch (status) {
    case 'paralysis':
      return `${cap(name)} is paralyzed! It may be unable to move!`;
    case 'burn':
      return `${cap(name)} was burned!`;
    case 'poison':
      return `${cap(name)} was poisoned!`;
    case 'toxic':
      return `${cap(name)} was badly poisoned!`;
    case 'sleep':
      return `${cap(name)} fell asleep!`;
    case 'freeze':
      return `${cap(name)} was frozen solid!`;
    default:
      return `${cap(name)} was afflicted!`;
  }
}

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
