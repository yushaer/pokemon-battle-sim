// Nature definitions. Each nature raises one stat by 10% and lowers another by 10%.
// "neutral" natures (e.g. Hardy) raise and lower the same stat = no net change.
// Stat keys match the canonical order used throughout the engine.

export const STAT_KEYS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];

// nature -> { up: statKey | null, down: statKey | null }
export const NATURES = {
  hardy: { up: null, down: null },
  lonely: { up: 'attack', down: 'defense' },
  brave: { up: 'attack', down: 'speed' },
  adamant: { up: 'attack', down: 'special-attack' },
  naughty: { up: 'attack', down: 'special-defense' },
  bold: { up: 'defense', down: 'attack' },
  docile: { up: null, down: null },
  relaxed: { up: 'defense', down: 'speed' },
  impish: { up: 'defense', down: 'special-attack' },
  lax: { up: 'defense', down: 'special-defense' },
  timid: { up: 'speed', down: 'attack' },
  hasty: { up: 'speed', down: 'defense' },
  serious: { up: null, down: null },
  jolly: { up: 'speed', down: 'special-attack' },
  naive: { up: 'speed', down: 'special-defense' },
  modest: { up: 'special-attack', down: 'attack' },
  mild: { up: 'special-attack', down: 'defense' },
  quiet: { up: 'special-attack', down: 'speed' },
  bashful: { up: null, down: null },
  rash: { up: 'special-attack', down: 'special-defense' },
  calm: { up: 'special-defense', down: 'attack' },
  gentle: { up: 'special-defense', down: 'defense' },
  sassy: { up: 'special-defense', down: 'speed' },
  careful: { up: 'special-defense', down: 'special-attack' },
  quirky: { up: null, down: null },
};

// Returns the multiplier (1.1, 1.0, or 0.9) for a given stat under a nature.
export function natureMultiplier(nature, statKey) {
  const n = NATURES[nature] || NATURES.hardy;
  if (n.up === statKey) return 1.1;
  if (n.down === statKey) return 0.9;
  return 1.0;
}
