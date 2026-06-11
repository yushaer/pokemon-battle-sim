// Builds battle-ready Pokemon from a client/saved team config. The server
// re-fetches base stats & move data from PokeAPI so it never trusts client
// numbers. Shared by random matchmaking and direct challenges.

import { fetchPokemon, fetchMove } from './pokeapi.js';
import { computeStats, validateEvs } from './statCalc.js';

const STAT_KEYS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];

function clampInt(v, lo, hi, dflt) {
  const n = Number.isFinite(v) ? Math.floor(v) : dflt;
  return Math.max(lo, Math.min(hi, n));
}

export async function buildBattlePokemon(slot) {
  const api = await fetchPokemon(slot.species);

  if (!validateEvs(slot.evs)) {
    throw new Error(`Invalid EV spread for ${slot.species} (max 510 total / 252 per stat).`);
  }

  const ivs = {};
  const evs = {};
  for (const k of STAT_KEYS) {
    ivs[k] = clampInt(slot.ivs?.[k], 0, 31, 31);
    evs[k] = clampInt(slot.evs?.[k], 0, 252, 0);
  }

  const stats = computeStats(api.baseStats, ivs, evs, slot.nature || 'hardy', 100);

  const chosen = (slot.moves || []).slice(0, 4).filter(Boolean);
  if (chosen.length === 0) throw new Error(`${slot.species} has no moves selected.`);

  const moves = [];
  for (const moveName of chosen) {
    if (!api.movePool.includes(moveName)) {
      throw new Error(`${moveName} is not in ${slot.species}'s move pool.`);
    }
    // Clone the (cached, shared) move so per-Pokemon PP tracking is independent.
    const md = await fetchMove(moveName);
    moves.push({ ...md, maxPp: md.pp, currentPp: md.pp });
  }

  return {
    species: api.name,
    name: api.name,
    types: api.types,
    sprites: api.sprites,
    baseStats: api.baseStats,
    stats,
    maxHp: stats.hp,
    currentHp: stats.hp,
    moves,
    fainted: false,
    charging: null,
    semiInvulnerable: false,
    status: null,
    sleepTurns: 0,
    toxicCounter: 1,
    flinched: false,
    protected: false,
    protectCounter: 0,
    volatile: { aquaRing: false, ingrained: false, leechSeed: false, confused: 0 },
    boosts: {
      attack: 0,
      defense: 0,
      'special-attack': 0,
      'special-defense': 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
  };
}

export async function buildTeam(teamConfig) {
  if (!Array.isArray(teamConfig) || teamConfig.length < 1 || teamConfig.length > 6) {
    throw new Error('Team must have between 1 and 6 Pokemon.');
  }
  const team = [];
  for (const slot of teamConfig) {
    team.push(await buildBattlePokemon(slot));
  }
  return team;
}
