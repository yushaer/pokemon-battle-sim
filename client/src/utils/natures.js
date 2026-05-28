// Mirror of the server nature table so the team builder can preview final
// stats live without a round-trip. The server remains the source of truth.

export const STAT_KEYS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];

export const STAT_LABELS = {
  hp: 'HP',
  attack: 'Atk',
  defense: 'Def',
  'special-attack': 'SpA',
  'special-defense': 'SpD',
  speed: 'Spe',
};

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

export const NATURE_NAMES = Object.keys(NATURES);

export function natureMultiplier(nature, statKey) {
  const n = NATURES[nature] || NATURES.hardy;
  if (n.up === statKey) return 1.1;
  if (n.down === statKey) return 0.9;
  return 1.0;
}
