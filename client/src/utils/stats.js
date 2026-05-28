// Client-side stat preview (identical math to the server's statCalc.js).
import { natureMultiplier, STAT_KEYS } from './natures.js';

export function calcHp(base, iv, ev, level = 100) {
  if (base === 1) return 1;
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

export function calcStat(base, iv, ev, level, natureMod) {
  const inner = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(inner * natureMod);
}

export function computeStats(baseStats, ivs, evs, nature, level = 100) {
  const out = {};
  for (const key of STAT_KEYS) {
    const base = baseStats[key] ?? 0;
    const iv = clamp(ivs?.[key] ?? 31, 0, 31);
    const ev = clamp(evs?.[key] ?? 0, 0, 252);
    out[key] =
      key === 'hp'
        ? calcHp(base, iv, ev, level)
        : calcStat(base, iv, ev, level, natureMultiplier(nature, key));
  }
  return out;
}

export function totalEvs(evs) {
  return STAT_KEYS.reduce((sum, k) => sum + (evs?.[k] || 0), 0);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
