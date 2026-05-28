import { STAT_KEYS, STAT_LABELS, NATURE_NAMES, NATURES } from '../utils/natures';
import { computeStats, totalEvs } from '../utils/stats';

const MAX_TOTAL_EV = 510;
const MAX_STAT_EV = 252;

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

          <div className="text-[10px] mb-1 flex justify-between">
            <span className="text-slate-400">Final stats @ Lv100</span>
            <span className={remaining < 0 ? 'text-red-400' : 'text-slate-400'}>
              EVs: {evTotal}/510
            </span>
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
                      <input
                        type="number"
                        min="0"
                        max="252"
                        step="4"
                        value={evs[key]}
                        onChange={(e) => setEv(key, e.target.value)}
                        className="w-12 bg-slate-900 border border-slate-600 rounded text-center"
                      />
                    </td>
                    <td className="text-right font-bold">{finalStats[key]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Move selection (filtered to this species' legal move pool) */}
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">
            Moves (from {data.name}&apos;s move pool)
          </label>
          {[0, 1, 2, 3].map((i) => (
            <select
              key={i}
              value={moves[i] || ''}
              onChange={(e) => setMove(i, e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs mb-2 capitalize"
            >
              <option value="">— empty —</option>
              {data.movePool.map((m) => (
                <option key={m} value={m}>
                  {m.replace(/-/g, ' ')}
                </option>
              ))}
            </select>
          ))}
          <p className="text-[9px] text-slate-500">
            Move power/type/accuracy are fetched from PokeAPI and resolved on the server.
          </p>
        </div>
      </div>
    </div>
  );
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
