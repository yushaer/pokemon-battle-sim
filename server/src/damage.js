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

// Returns { damage, effectiveness, crit, stab }.
export function calcDamage(attacker, defender, move, { level = 100 } = {}) {
  // Status moves deal no damage here.
  if (!move.power || move.damageClass === 'status') {
    return { damage: 0, effectiveness: 1, crit: false, stab: 1 };
  }

  const isPhysical = move.damageClass === 'physical';
  const atkStat = isPhysical ? attacker.stats.attack : attacker.stats['special-attack'];
  const defStat = isPhysical ? defender.stats.defense : defender.stats['special-defense'];

  const eff = effectiveness(move.type, defender.types);
  if (eff === 0) {
    return { damage: 0, effectiveness: 0, crit: false, stab: 1 };
  }

  const crit = Math.random() < 1 / 24;
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
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

// Determine which Pokemon acts first this turn.
// Higher move priority wins; then higher (effective) speed; ties broken randomly.
export function compareOrder(aMove, aSpeed, bMove, bSpeed) {
  const aPrio = aMove?.priority ?? 0;
  const bPrio = bMove?.priority ?? 0;
  if (aPrio !== bPrio) return bPrio - aPrio; // higher priority first
  if (aSpeed !== bSpeed) return bSpeed - aSpeed; // higher speed first
  return Math.random() < 0.5 ? -1 : 1;
}
