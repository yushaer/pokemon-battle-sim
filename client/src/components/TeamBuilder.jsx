import { useEffect, useState } from 'react';
import { getPokemonList, getPokemon } from '../api/pokeapi';
import { STAT_KEYS } from '../utils/natures';
import PokemonEditor from './PokemonEditor.jsx';

const emptyEvs = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
const fullIvs = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 31]));

// Builds a team of up to 6 Pokemon, all data fetched dynamically from PokeAPI.
export default function TeamBuilder({ onReady }) {
  const [names, setNames] = useState([]);
  const [pick, setPick] = useState('');
  const [team, setTeam] = useState([]); // slots
  const [editing, setEditing] = useState(0);
  const [trainerName, setTrainerName] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getPokemonList(386).then(setNames).catch((e) => setError(String(e)));
  }, []);

  async function addPokemon(name) {
    if (!name || team.length >= 6) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPokemon(name);
      const slot = {
        species: data.name,
        data,
        evs: emptyEvs(),
        ivs: fullIvs(),
        nature: 'hardy',
        // Seed with the first four legal moves so the team is battle-ready.
        moves: data.movePool.slice(0, 4),
      };
      setTeam((prev) => {
        const next = [...prev, slot];
        setEditing(next.length - 1);
        return next;
      });
      setPick('');
    } catch (e) {
      setError(`Could not load "${name}". Check the spelling.`);
    } finally {
      setLoading(false);
    }
  }

  function updateSlot(index, slot) {
    setTeam((prev) => prev.map((s, i) => (i === index ? slot : s)));
  }
  function removeSlot(index) {
    setTeam((prev) => prev.filter((_, i) => i !== index));
    setEditing((e) => Math.max(0, e - (index <= e ? 1 : 0)));
  }

  function findMatch() {
    if (team.length === 0) {
      setError('Add at least one Pokémon.');
      return;
    }
    for (const s of team) {
      const chosen = (s.moves || []).filter(Boolean);
      if (chosen.length === 0) {
        setError(`${s.species} needs at least one move.`);
        return;
      }
    }
    const config = team.map((s) => ({
      species: s.species,
      evs: s.evs,
      ivs: s.ivs,
      nature: s.nature,
      moves: (s.moves || []).filter(Boolean),
    }));
    onReady(config, trainerName.trim() || 'Trainer');
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">Trainer name</label>
          <input
            value={trainerName}
            onChange={(e) => setTrainerName(e.target.value)}
            placeholder="Ash"
            className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">Add Pokémon</label>
          <div className="flex gap-2">
            <input
              list="pokemon-names"
              value={pick}
              onChange={(e) => setPick(e.target.value.toLowerCase())}
              placeholder="pikachu"
              className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm"
            />
            <datalist id="pokemon-names">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <button
              onClick={() => addPokemon(pick)}
              disabled={loading || team.length >= 6}
              className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 disabled:opacity-40 text-sm"
            >
              {loading ? '…' : 'Add'}
            </button>
          </div>
        </div>
        <button
          onClick={findMatch}
          disabled={team.length === 0}
          className="ml-auto px-6 py-3 rounded-lg bg-yellow-400 text-black font-pixel text-[10px] hover:bg-yellow-300 disabled:opacity-40"
        >
          Find Match ⚔
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-3">⚠ {error}</p>}

      {/* Roster */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {Array.from({ length: 6 }).map((_, i) => {
          const slot = team[i];
          const isActive = i === editing && slot;
          return (
            <button
              key={i}
              onClick={() => slot && setEditing(i)}
              className={`h-24 rounded-lg border flex flex-col items-center justify-center ${
                slot
                  ? isActive
                    ? 'border-yellow-400 bg-slate-700'
                    : 'border-slate-600 bg-slate-800 hover:bg-slate-700'
                  : 'border-dashed border-slate-700 bg-slate-900/50'
              }`}
            >
              {slot ? (
                <>
                  <img src={slot.data.sprite} alt={slot.species} className="w-12 h-12 pixelated" />
                  <span className="text-[9px] capitalize">{slot.species}</span>
                </>
              ) : (
                <span className="text-slate-600 text-2xl">+</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Editor for the selected slot */}
      {team[editing] ? (
        <PokemonEditor
          slot={team[editing]}
          onChange={(s) => updateSlot(editing, s)}
          onRemove={() => removeSlot(editing)}
        />
      ) : (
        <p className="text-slate-500 text-sm text-center py-10">
          Add a Pokémon to start configuring EVs, IVs, nature, and moves.
        </p>
      )}
    </div>
  );
}
