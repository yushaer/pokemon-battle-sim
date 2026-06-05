// Client-side mirror of the engine's stat-stage math, for the live stat panel.

export function stageMultiplier(stage) {
  const s = Math.max(-6, Math.min(6, stage || 0));
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

// Effective value of a stat given its stage and (for Atk) a burn.
export function effectiveStat(base, stage, statKey, status) {
  let v = base * stageMultiplier(stage);
  if (statKey === 'attack' && status === 'burn') v *= 0.5;
  return Math.floor(v);
}

export function stageLabel(stage) {
  if (!stage) return '';
  return stage > 0 ? `+${stage}` : `${stage}`;
}
