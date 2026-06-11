import { useEffect, useMemo, useState } from 'react';
import { getPokemonList, getPokemon, GENERATIONS } from '../api/pokeapi';
import { teamsApi } from '../api/auth';
import { STAT_KEYS } from '../utils/natures';
import PokemonEditor from './PokemonEditor.jsx';

const emptyEvs = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
const fullIvs = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 31]));

// Builds/edits a team of up to 6 Pokemon and saves it to the user's account.
// All data fetched dynamically from PokeAPI.
export default function TeamBuilder({ initialTeam, onSaved, onCancel }) {
  const [names, setNames] = useState([]); // [{ name, id }]
  const [gen, setGen] = useState(0); // index into GENERATIONS
  const [pick, setPick] = useState('');
  const [team, setTeam] = useState([]); // hydrated slots
  const [editing, setEditing] = useState(0);
  const [teamName, setTeamName] = useState(initialTeam?.name || '');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(!!initialTeam);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPokemonList().then(setNames).catch((e) => setError(String(e)));
  }, []);

  // Names filtered to the selected generation (drives the datalist).
  const filteredNames = useMemo(() => {
    const range = GENERATIONS[gen];
    return names.filter((n) => n.id >= range.min && n.id <= range.max);
  }, [names, gen]);

  // Re-hydrate a saved team (fetch each species' data for the editor).
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!initialTeam?.slots?.length) {
        setHydrating(false);
        return;
      }
      try {
        const slots = await Promise.all(
          initialTeam.slots.map(async (s) => {
            const data = await getPokemon(s.species);
            return {
              species: data.name,
              data,
              evs: { ...emptyEvs(), ...(s.evs || {}) },
              ivs: { ...fullIvs(), ...(s.ivs || {}) },
              nature: s.nature || 'hardy',
              moves: s.moves || [],
            };
          }),
        );
        if (!cancelled) setTeam(slots);
      } catch (e) {
        if (!cancelled) setError('Failed to load saved team.');
      } finally {
        if (!cancelled) setHydrating(false);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [initialTeam]);

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
        moves: data.movePool.slice(0, 4),
      };
      setTeam((prev) => {
        const next = [...prev, slot];
        setEditing(next.length - 1);
        return next;
      });
      setPick('');
    } catch {
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

  async function save() {
    if (!teamName.trim()) return setError('Give your team a name.');
    if (team.length === 0) return setError('Add at least one Pokémon.');
    for (const s of team) {
      if ((s.moves || []).filter(Boolean).length === 0) {
        return setError(`${s.species} needs at least one move.`);
      }
    }
    const slots = team.map((s) => ({
      species: s.species,
      evs: s.evs,
      ivs: s.ivs,
      nature: s.nature,
      moves: (s.moves || []).filter(Boolean),
    }));
    setSaving(true);
    setError(null);
    try {
      const res = initialTeam?.id
        ? await teamsApi.update(initialTeam.id, teamName.trim(), slots)
        : await teamsApi.create(teamName.trim(), slots);
      onSaved(res.teams);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (hydrating) {
    return <p className="text-center text-slate-400 mt-20">Loading team…</p>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">Team name</label>
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="My Rain Team"
            className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">Generation</label>
          <select
            value={gen}
            onChange={(e) => setGen(Number(e.target.value))}
            className="bg-slate-900 border border-slate-600 rounded px-2 py-2 text-sm"
          >
            {GENERATIONS.map((g, i) => (
              <option key={g.label} value={i}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">
            Add Pokémon {names.length === 0 ? '(loading list…)' : `(${filteredNames.length} available)`}
          </label>
          <div className="flex gap-2">
            <input
              list="pokemon-names"
              value={pick}
              onChange={(e) => setPick(e.target.value.toLowerCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addPokemon(pick);
              }}
              placeholder="pikachu"
              className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm"
            />
            <datalist id="pokemon-names">
              {filteredNames.map((n) => (
                <option key={n.name} value={n.name} />
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
        <div className="ml-auto flex gap-2">
          <button onClick={onCancel} className="px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || team.length === 0}
            className="px-6 py-3 rounded-lg bg-yellow-400 text-black font-pixel text-[10px] hover:bg-yellow-300 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save Team'}
          </button>
        </div>
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
