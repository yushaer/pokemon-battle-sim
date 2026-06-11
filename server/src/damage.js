// Damage calculation following the mainline formula (simplified: no weather,
// abilities, or items beyond what the spec asks for). Everything runs on the
// server so both clients receive identical results.

import { effectiveness } from './typechart.js';

// Moves that charge on turn 1 and strike on turn 2. The "invulnerable" flag
// means the user cannot normally be hit while charging.
export const CHARGE_MOVES = {
  fly: { invulnerable: true, message: 'flew up high!' },
  dig: { invulnerable: true, message: 'burrowed underground!' },
  dive: { invulnerable: true, message: 'hid underwater!' },
  bounce: { invulnerable: true, message: 'sprang up!' },
  'solar-beam': { invulnerable: false, message: 'absorbed light!' },
  'skull-bash': { invulnerable: false, message: 'lowered its head!' },
};

export function isChargeMove(moveName) {
  return Object.prototype.hasOwnProperty.call(CHARGE_MOVES, moveName);
}

// --- stat stages (-6..+6) ---
export function clampStage(stage) {
  return Math.max(-6, Math.min(6, stage));
}
// Multiplier for the regular battle stats (Atk/Def/SpA/SpD/Spe).
export function stageMultiplier(stage) {
  const s = clampStage(stage);
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

// Effective attack/defense stat including stat stages and burn.
export function effectiveAttack(p, special) {
  const key = special ? 'special-attack' : 'attack';
  let v = p.stats[key] * stageMultiplier(p.boosts?.[key] || 0);
  if (!special && p.status === 'burn') v *= 0.5; // burn halves physical attack
  return v;
}
export function effectiveDefense(p, special) {
  const key = special ? 'special-defense' : 'defense';
  return p.stats[key] * stageMultiplier(p.boosts?.[key] || 0);
}
// Effective speed including paralysis + speed stage (used for turn order).
export function effectiveSpeed(p) {
  let v = p.stats.speed * stageMultiplier(p.boosts?.speed || 0);
  if (p.status === 'paralysis') v *= 0.5;
  return Math.floor(v);
}

// Accuracy/evasion stages use a 3-based ladder instead of the 2-based one.
export function accStageMultiplier(stage) {
  const s = Math.max(-6, Math.min(6, stage));
  return s >= 0 ? (3 + s) / 3 : 3 / (3 - s);
}

// Returns { damage, effectiveness, crit, stab }.
export function calcDamage(attacker, defender, move, { level = 100 } = {}) {
  // Status moves deal no damage here.
  if (!move.power || move.damageClass === 'status') {
    return { damage: 0, effectiveness: 1, crit: false, stab: 1 };
  }

  const isPhysical = move.damageClass === 'physical';
  const atkStat = effectiveAttack(attacker, !isPhysical);
  const defStat = effectiveDefense(defender, !isPhysical);

  // Struggle is typeless: always neutral, never gets STAB.
  const eff = move.struggle ? 1 : effectiveness(move.type, defender.types);
  if (eff === 0) {
    return { damage: 0, effectiveness: 0, crit: false, stab: 1 };
  }

  // High-crit-ratio moves (meta.critRate > 0) crit more often.
  const critChance = (move.meta?.critRate || 0) > 0 ? 1 / 8 : 1 / 24;
  const crit = Math.random() < critChance;
  const stab = !move.struggle && attacker.types.includes(move.type) ? 1.5 : 1;
  const random = 0.85 + Math.random() * 0.15; // 0.85 .. 1.00

  const baseDamage =
    Math.floor(
      Math.floor((Math.floor((2 * level) / 5 + 2) * move.power * atkStat) / defStat) / 50,
    ) + 2;

  const critMod = crit ? 1.5 : 1;
  let damage = Math.floor(baseDamage * critMod * stab * eff * random);
  damage = Math.max(1, damage);

  return { damage, effectiveness: eff, crit, stab };
}

// --- status conditions ---
// Map a PokeAPI ailment name (+ move name for Toxic) to our internal status.
export function mapAilment(ailment, moveName) {
  if (moveName === 'toxic') return 'toxic';
  switch (ailment) {
    case 'paralysis':
      return 'paralysis';
    case 'burn':
      return 'burn';
    case 'poison':
      return 'poison';
    case 'freeze':
      return 'freeze';
    case 'sleep':
      return 'sleep';
    default:
      return null; // confusion, leech-seed, etc. not simulated
  }
}

// Type-based immunities to a major status.
export function statusImmune(status, types) {
  if (status === 'burn') return types.includes('fire');
  if (status === 'paralysis') return types.includes('electric');
  if (status === 'freeze') return types.includes('ice');
  if (status === 'poison' || status === 'toxic')
    return types.includes('poison') || types.includes('steel');
  return false;
}

export const STATUS_ABBR = {
  paralysis: 'PAR',
  burn: 'BRN',
  poison: 'PSN',
  toxic: 'TOX',
  sleep: 'SLP',
  freeze: 'FRZ',
};

// Determine which Pokemon acts first this turn.
// Higher move priority wins; then higher (effective) speed; ties broken randomly.
export function compareOrder(aMove, aSpeed, bMove, bSpeed) {
  const aPrio = aMove?.priority ?? 0;
  const bPrio = bMove?.priority ?? 0;
  if (aPrio !== bPrio) return bPrio - aPrio; // higher priority first
  if (aSpeed !== bSpeed) return bSpeed - aSpeed; // higher speed first
  return Math.random() < 0.5 ? -1 : 1;
}
