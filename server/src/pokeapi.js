// Thin PokeAPI client with an in-memory cache. The SERVER is the source of
// truth for the battle, so it fetches the canonical base stats / move data
// itself rather than trusting whatever the client sends.

const BASE = 'https://pokeapi.co/api/v2';
const cache = new Map();

async function getJson(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PokeAPI ${res.status} for ${url}`);
  const json = await res.json();
  cache.set(url, json);
  return json;
}

// Normalised Pokemon record used by the battle engine.
export async function fetchPokemon(nameOrId) {
  const data = await getJson(`${BASE}/pokemon/${String(nameOrId).toLowerCase()}`);
  const baseStats = {};
  for (const s of data.stats) {
    baseStats[s.stat.name] = s.base_stat;
  }
  return {
    id: data.id,
    name: data.name,
    types: data.types.map((t) => t.type.name),
    baseStats,
    sprites: {
      // Newer generations often lack back sprites — fall back to front.
      front: data.sprites.front_default,
      back: data.sprites.back_default || data.sprites.front_default,
      frontAnim:
        data.sprites.versions?.['generation-v']?.['black-white']?.animated?.front_default ||
        data.sprites.front_default,
      backAnim:
        data.sprites.versions?.['generation-v']?.['black-white']?.animated?.back_default ||
        data.sprites.back_default ||
        data.sprites.front_default,
    },
    // raw move list (names only); detailed move data fetched on demand
    movePool: data.moves.map((m) => m.move.name),
  };
}

// Normalised move record, including the metadata needed to simulate
// status/non-damaging effects (stat changes, ailments, healing, drain...).
export async function fetchMove(nameOrId) {
  const data = await getJson(`${BASE}/move/${String(nameOrId).toLowerCase()}`);
  const en = (arr, key) =>
    arr?.find((e) => e.language?.name === 'en')?.[key] ?? '';
  const shortEffect = (en(data.effect_entries, 'short_effect') || '').replace(
    '$effect_chance',
    String(data.effect_chance ?? ''),
  );
  return {
    id: data.id,
    name: data.name,
    type: data.type.name,
    power: data.power, // may be null for status moves
    accuracy: data.accuracy, // may be null = never misses
    pp: data.pp,
    priority: data.priority,
    damageClass: data.damage_class.name, // physical | special | status
    target: data.target?.name || 'selected-pokemon',
    effectChance: data.effect_chance,
    shortEffect,
    // [{ change, stat }] — e.g. Swords Dance => [{ change: 2, stat: 'attack' }]
    statChanges: (data.stat_changes || []).map((s) => ({
      change: s.change,
      stat: s.stat.name,
    })),
    meta: data.meta
      ? {
          ailment: data.meta.ailment?.name || 'none', // paralysis|burn|poison|freeze|sleep|none|...
          ailmentChance: data.meta.ailment_chance || 0,
          healing: data.meta.healing || 0, // % of max HP
          drain: data.meta.drain || 0, // +heal / -recoil, % of damage
          flinchChance: data.meta.flinch_chance || 0,
          statChance: data.meta.stat_chance || 0,
          critRate: data.meta.crit_rate || 0,
          minHits: data.meta.min_hits || null,
          maxHits: data.meta.max_hits || null,
        }
      : {
          ailment: 'none', ailmentChance: 0, healing: 0, drain: 0,
          flinchChance: 0, statChance: 0, critRate: 0, minHits: null, maxHits: null,
        },
  };
}

// First N species, used to seed the team builder list.
export async function fetchPokemonList(limit = 386, offset = 0) {
  const data = await getJson(`${BASE}/pokemon?limit=${limit}&offset=${offset}`);
  return data.results.map((r) => r.name);
}
