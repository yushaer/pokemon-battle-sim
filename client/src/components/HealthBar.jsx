import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { typeBadge } from '../utils/typeColors';

const STATUS_STYLES = {
  paralysis: { label: 'PAR', cls: 'bg-yellow-500' },
  burn: { label: 'BRN', cls: 'bg-orange-600' },
  poison: { label: 'PSN', cls: 'bg-purple-600' },
  toxic: { label: 'TOX', cls: 'bg-fuchsia-800' },
  sleep: { label: 'SLP', cls: 'bg-slate-500' },
  freeze: { label: 'FRZ', cls: 'bg-cyan-500' },
};

// HP number that ticks down/up smoothly instead of jumping.
function HpNumber({ value }) {
  const ref = useRef(null);
  const shown = useRef(value);
  useEffect(() => {
    const obj = { v: shown.current };
    const tween = gsap.to(obj, {
      v: value,
      duration: 0.7,
      ease: 'power1.out',
      onUpdate: () => {
        shown.current = obj.v;
        if (ref.current) ref.current.textContent = Math.ceil(obj.v);
      },
    });
    return () => tween.kill();
  }, [value]);
  return <span ref={ref}>{Math.ceil(value)}</span>;
}

// Presentational HP/status panel. The smooth "drain" is pure CSS: the width
// transitions whenever `currentHp` changes, so the parent only has to update
// the number during event playback.
export default function HealthBar({ name, level = 100, currentHp, maxHp, types = [], status = null, showNumbers = false }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;
  const color =
    pct > 50
      ? 'linear-gradient(180deg, #86efac, #22c55e 60%, #16a34a)'
      : pct > 20
        ? 'linear-gradient(180deg, #fde68a, #facc15 60%, #ca8a04)'
        : 'linear-gradient(180deg, #fca5a5, #ef4444 60%, #b91c1c)';
  const st = status ? STATUS_STYLES[status] : null;

  return (
    <div className="bg-gradient-to-b from-slate-50 to-slate-200 text-slate-900 rounded-xl px-3 py-2 shadow-lg border-2 border-slate-700 w-60 ring-1 ring-white/60">
      <div className="flex items-center justify-between mb-1">
        <span className="font-pixel text-[10px] capitalize">{name}</span>
        <div className="flex items-center gap-1">
          {st && (
            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded text-white ${st.cls}`}>
              {st.label}
            </span>
          )}
          <span className="text-[10px] font-bold">Lv{level}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-1">
        <span className="text-[8px] font-bold text-amber-600 bg-slate-800 rounded px-1 py-0.5 leading-none">HP</span>
        <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden border border-slate-500 shadow-inner">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${pct}%`, background: color }}
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
          <span className="text-[10px] font-mono font-bold">
            <HpNumber value={currentHp} />/{maxHp}
          </span>
        )}
      </div>
    </div>
  );
}
