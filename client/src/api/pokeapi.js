// Front-end PokeAPI helper for the team builder. Caches in-memory so flipping
// between Pokemon doesn't refetch. Data is fetched dynamically — nothing is
// hardcoded per the spec.

const BASE = 'https://pokeapi.co/api/v2';
const cache = new Map();

async function getJson(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PokeAPI ${res.status}`);
  const json = await res.json();
  cache.set(url, json);
  return json;
}

// All 1025 canonical species (Gen 1–9). Each entry: { name, id }.
export async function getPokemonList(limit = 1025) {
  const data = await getJson(`${BASE}/pokemon?limit=${limit}&offset=0`);
  return data.results.map((r) => {
    const id = Number(r.url.split('/').filter(Boolean).pop());
    return { name: r.name, id };
  });
}

// National-dex ranges per generation, for the team-builder filter.
export const GENERATIONS = [
  { label: 'All generations', min: 1, max: 1025 },
  { label: 'Gen 1 — Kanto', min: 1, max: 151 },
  { label: 'Gen 2 — Johto', min: 152, max: 251 },
  { label: 'Gen 3 — Hoenn', min: 252, max: 386 },
  { label: 'Gen 4 — Sinnoh', min: 387, max: 493 },
  { label: 'Gen 5 — Unova', min: 494, max: 649 },
  { label: 'Gen 6 — Kalos', min: 650, max: 721 },
  { label: 'Gen 7 — Alola', min: 722, max: 809 },
  { label: 'Gen 8 — Galar', min: 810, max: 905 },
  { label: 'Gen 9 — Paldea', min: 906, max: 1025 },
];

export async function getPokemon(nameOrId) {
  const d = await getJson(`${BASE}/pokemon/${String(nameOrId).toLowerCase()}`);
  const baseStats = {};
  for (const s of d.stats) baseStats[s.stat.name] = s.base_stat;
  return {
    id: d.id,
    name: d.name,
    types: d.types.map((t) => t.type.name),
    baseStats,
    sprite: d.sprites.front_default,
    // Move pool restricted to the species' legal moves (per spec).
    movePool: d.moves.map((m) => m.move.name).sort(),
  };
}

export async function getMove(name) {
  const d = await getJson(`${BASE}/move/${String(name).toLowerCase()}`);
  const en = d.effect_entries?.find((e) => e.language?.name === 'en');
  const shortEffect = (en?.short_effect || '').replace('$effect_chance', String(d.effect_chance ?? ''));
  return {
    name: d.name,
    type: d.type.name,
    power: d.power,
    accuracy: d.accuracy,
    pp: d.pp,
    priority: d.priority,
    damageClass: d.damage_class.name,
    shortEffect,
    target: d.target?.name || 'selected-pokemon',
    ailment: d.meta?.ailment?.name || 'none',
    healing: d.meta?.healing || 0,
    statChanges: (d.stat_changes || []).map((s) => ({ change: s.change, stat: s.stat.name })),
  };
}
