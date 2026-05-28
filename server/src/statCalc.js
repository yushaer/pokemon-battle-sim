// Official mainline stat formulas. Level is fixed at 100 for this simulator
// (the spec asks for Level 100 calculations) but the formula keeps `level`
// as a parameter so it stays correct if you ever lower it.

import { natureMultiplier } from './natures.js';

// HP: floor((2*Base + IV + floor(EV/4)) * Level/100) + Level + 10
export function calcHp(base, iv, ev, level = 100) {
  if (base === 1) return 1; // Shedinja rule
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

// Other stats: floor((floor((2*Base + IV + floor(EV/4)) * Level/100) + 5) * NatureMod)
export function calcStat(base, iv, ev, level, natureMod) {
  const inner = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(inner * natureMod);
}

// Given base stats + spread, return the full computed stat block.
// baseStats: { hp, attack, defense, 'special-attack', 'special-defense', speed }
// ivs / evs: same keys, numeric. nature: string.
export function computeStats(baseStats, ivs, evs, nature, level = 100) {
  const out = {};
  for (const key of Object.keys(baseStats)) {
    const base = baseStats[key];
    const iv = clamp(ivs?.[key] ?? 31, 0, 31);
    const ev = clamp(evs?.[key] ?? 0, 0, 252);
    if (key === 'hp') {
      out.hp = calcHp(base, iv, ev, level);
    } else {
      out[key] = calcStat(base, iv, ev, level, natureMultiplier(nature, key));
    }
  }
  return out;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Validate an EV spread: max 510 total, max 252 per stat.
export function validateEvs(evs) {
  let total = 0;
  for (const key of Object.keys(evs || {})) {
    const v = evs[key] || 0;
    if (v < 0 || v > 252) return false;
    total += v;
  }
  return total <= 510;
}
