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

export async function getPokemonList(limit = 386) {
  const data = await getJson(`${BASE}/pokemon?limit=${limit}&offset=0`);
  return data.results.map((r) => r.name);
}

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
  return {
    name: d.name,
    type: d.type.name,
    power: d.power,
    accuracy: d.accuracy,
    pp: d.pp,
    priority: d.priority,
    damageClass: d.damage_class.name,
  };
}
