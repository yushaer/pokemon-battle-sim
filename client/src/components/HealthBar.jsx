import { typeBadge } from '../utils/typeColors';

// Presentational HP/status panel. The smooth "drain" is pure CSS: the width
// transitions whenever `currentHp` changes, so the parent only has to update
// the number during event playback.
export default function HealthBar({ name, level = 100, currentHp, maxHp, types = [], showNumbers = false }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;
  const color = pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-400' : 'bg-red-500';

  return (
    <div className="bg-slate-100 text-slate-900 rounded-lg px-3 py-2 shadow-lg border-2 border-slate-800 w-60">
      <div className="flex items-center justify-between mb-1">
        <span className="font-pixel text-[10px] capitalize">{name}</span>
        <span className="text-[10px] font-bold">Lv{level}</span>
      </div>

      <div className="flex items-center gap-1 mb-1">
        <span className="text-[9px] font-bold text-yellow-600">HP</span>
        <div className="flex-1 h-2.5 bg-slate-300 rounded-full overflow-hidden border border-slate-500">
          <div
            className={`h-full ${color} transition-all duration-700 ease-out`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {types.map((t) => (
            <span
              key={t}
              className={`text-[8px] uppercase px-1.5 py-0.5 rounded text-white ${typeBadge(t)}`}
            >
              {t}
            </span>
          ))}
        </div>
        {showNumbers && (
          <span className="text-[9px] font-mono">
            {Math.ceil(currentHp)}/{maxHp}
          </span>
        )}
      </div>
    </div>
  );
}
