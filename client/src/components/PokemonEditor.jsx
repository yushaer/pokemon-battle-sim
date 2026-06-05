import { STAT_KEYS, STAT_LABELS, NATURE_NAMES, NATURES } from '../utils/natures';
import { computeStats, totalEvs } from '../utils/stats';
import MoveSelector from './MoveSelector.jsx';

const MAX_TOTAL_EV = 510;
const MAX_STAT_EV = 252;

// Common competitive EV spreads.
const EV_PRESETS = {
  'Physical Sweeper (Atk/Spe)': { attack: 252, speed: 252, hp: 4 },
  'Special Sweeper (SpA/Spe)': { 'special-attack': 252, speed: 252, hp: 4 },
  'Physical Wall (HP/Def)': { hp: 252, defense: 252, 'special-defense': 4 },
  'Special Wall (HP/SpD)': { hp: 252, 'special-defense': 252, defense: 4 },
  'Bulky Attacker (HP/Atk)': { hp: 252, attack: 252, speed: 4 },
};

// Edits one team slot: EVs, IVs, Nature, and up to 4 moves, with a live,
// formula-accurate final-stat readout.
export default function PokemonEditor({ slot, onChange, onRemove }) {
  const { data, evs, ivs, nature, moves } = slot;
  const finalStats = computeStats(data.baseStats, ivs, evs, nature, 100);
  const evTotal = totalEvs(evs);
  const remaining = MAX_TOTAL_EV - evTotal;

  function setEv(key, value) {
    const v = clamp(parseInt(value, 10) || 0, 0, MAX_STAT_EV);
    // Don't allow exceeding the 510 total.
    const others = evTotal - (evs[key] || 0);
    const capped = Math.min(v, MAX_TOTAL_EV - others);
    onChange({ ...slot, evs: { ...evs, [key]: capped } });
  }
  function setIv(key, value) {
    const v = clamp(parseInt(value, 10) || 0, 0, 31);
    onChange({ ...slot, ivs: { ...ivs, [key]: v } });
  }
  function setNature(value) {
    onChange({ ...slot, nature: value });
  }
  function setMove(index, value) {
    const next = [...moves];
    next[index] = value || undefined;
    onChange({ ...slot, moves: next });
  }
  function maxEv(key) {
    const others = evTotal - (evs[key] || 0);
    onChange({ ...slot, evs: { ...evs, [key]: Math.min(MAX_STAT_EV, MAX_TOTAL_EV - others) } });
  }
  function clearEvs() {
    onChange({ ...slot, evs: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) });
  }
  function setAllIvs(v) {
    onChange({ ...slot, ivs: Object.fromEntries(STAT_KEYS.map((k) => [k, v])) });
  }
  function applyPreset(spread) {
    if (!spread) return;
    const next = Object.fromEntries(STAT_KEYS.map((k) => [k, spread[k] || 0]));
    onChange({ ...slot, evs: next });
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center gap-3 mb-4">
        <img src={data.sprite} alt={data.name} className="w-16 h-16 pixelated" />
        <div>
          <h3 className="font-pixel text-xs capitalize text-yellow-300">{data.name}</h3>
          <p className="text-[10px] text-slate-400 uppercase">{data.types.join(' / ')}</p>
        </div>
        <button
          onClick={onRemove}
          className="ml-auto text-xs px-3 py-1 rounded bg-red-700 hover:bg-red-600"
        >
          Remove
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Nature + stats table */}
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">Nature</label>
          <select
            value={nature}
            onChange={(e) => setNature(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs capitalize mb-3"
          >
            {NATURE_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
                {NATURES[n].up ? ` (+${STAT_LABELS[NATURES[n].up]} / -${STAT_LABELS[NATURES[n].down]})` : ' (neutral)'}
              </option>
            ))}
          </select>

          <div className="text-[10px] mb-1 flex justify-between items-center">
            <span className="text-slate-400">Final stats @ Lv100</span>
            <span className={remaining < 0 ? 'text-red-400 font-bold' : 'text-slate-400'}>
              EVs: {evTotal}/510 ({remaining} left)
            </span>
          </div>
          {/* EV budget bar */}
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full ${remaining < 0 ? 'bg-red-500' : 'bg-emerald-500'} transition-all`}
              style={{ width: `${Math.min(100, (evTotal / MAX_TOTAL_EV) * 100)}%` }}
            />
          </div>
          {/* QoL toolbar */}
          <div className="flex flex-wrap items-center gap-1 mb-2 text-[9px]">
            <button onClick={clearEvs} className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600">
              Clear EVs
            </button>
            <button onClick={() => setAllIvs(31)} className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600">
              Max IVs
            </button>
            <button onClick={() => setAllIvs(0)} className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600">
              Min IVs
            </button>
            <select
              defaultValue=""
              onChange={(e) => {
                applyPreset(EV_PRESETS[e.target.value]);
                e.target.value = '';
              }}
              className="px-1 py-0.5 rounded bg-slate-700 hover:bg-slate-600 border border-slate-600"
            >
              <option value="" disabled>
                EV preset…
              </option>
              {Object.keys(EV_PRESETS).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left font-normal">Stat</th>
                <th className="font-normal">Base</th>
                <th className="font-normal">IV</th>
                <th className="font-normal">EV</th>
                <th className="text-right font-normal">Final</th>
              </tr>
            </thead>
            <tbody>
              {STAT_KEYS.map((key) => {
                const up = NATURES[nature].up === key;
                const down = NATURES[nature].down === key;
                return (
                  <tr key={key} className="border-t border-slate-700/50">
                    <td className={`py-1 ${up ? 'text-green-400' : down ? 'text-red-400' : ''}`}>
                      {STAT_LABELS[key]}
                    </td>
                    <td className="text-center text-slate-400">{data.baseStats[key]}</td>
                    <td className="text-center">
                      <input
                        type="number"
                        min="0"
                        max="31"
                        value={ivs[key]}
                        onChange={(e) => setIv(key, e.target.value)}
                        className="w-10 bg-slate-900 border border-slate-600 rounded text-center"
                      />
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="252"
                          step="4"
                          value={evs[key]}
                          onChange={(e) => setEv(key, e.target.value)}
                          className="w-12 bg-slate-900 border border-slate-600 rounded text-center"
                        />
                        <button
                          type="button"
                          title="Max this stat"
                          onClick={() => maxEv(key)}
                          className="text-[8px] px-1 rounded bg-slate-700 hover:bg-emerald-600"
                        >
                          max
                        </button>
                      </div>
                    </td>
                    <td className="text-right font-bold">{finalStats[key]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Move selection — searchable, filtered to this species' legal pool */}
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">
            Moves ({data.movePool.length} legal · search to filter)
          </label>
          {[0, 1, 2, 3].map((i) => (
            <MoveSelector
              key={i}
              index={i}
              movePool={data.movePool}
              value={moves[i]}
              onChange={(name) => setMove(i, name)}
            />
          ))}
          <p className="text-[9px] text-slate-500">
            Type / power / accuracy / effect are fetched from PokeAPI; the server
            re-resolves them as the source of truth.
          </p>
        </div>
      </div>
    </div>
  );
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
