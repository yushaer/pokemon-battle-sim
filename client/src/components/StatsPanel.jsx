import { effectiveStat, stageLabel } from '../utils/battleStats';

const ROWS = [
  ['attack', 'Atk'],
  ['defense', 'Def'],
  ['special-attack', 'SpA'],
  ['special-defense', 'SpD'],
  ['speed', 'Spe'],
];

// Live stat readout for the player's active Pokemon. Reflects stat stages and
// burn in real time as `boosts` / `status` update during the turn.
export default function StatsPanel({ name, stats, boosts = {}, status, currentHp, maxHp }) {
  if (!stats) return null;
  return (
    <div className="bg-slate-800 border-2 border-slate-700 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-pixel text-[9px] text-yellow-300 capitalize">{name} — Live Stats</h4>
        <span className="text-[10px] font-mono text-slate-300">
          HP {Math.ceil(currentHp)}/{maxHp}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {ROWS.map(([key, label]) => {
          const stage = boosts[key] || 0;
          const eff = effectiveStat(stats[key], stage, key, status);
          const burned = key === 'attack' && status === 'burn';
          const tone =
            stage > 0 ? 'text-green-400' : stage < 0 || burned ? 'text-red-400' : 'text-slate-200';
          return (
            <div key={key} className="bg-slate-900 rounded p-1.5 text-center border border-slate-700">
              <div className="text-[8px] text-slate-400">{label}</div>
              <div className={`text-[13px] font-bold leading-tight ${tone}`}>{eff}</div>
              <div className="h-3">
                {stage !== 0 && (
                  <span
                    className={`text-[8px] font-bold ${stage > 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {stageLabel(stage)}
                  </span>
                )}
                {burned && <span className="text-[8px] text-orange-400"> 🔥</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
