import { useState, useEffect } from 'react';
import { typeBadge } from '../utils/typeColors';

// Action menu: 2x2 move grid + a "Switch Pokémon" sub-menu.
// `forceSwitch` forces the switch view (after a faint) and hides move options.
export default function ActionMenu({ active, team, activeIndex, disabled, forceSwitch, onMove, onSwitch }) {
  const [view, setView] = useState('main'); // main | switch

  useEffect(() => {
    setView(forceSwitch ? 'switch' : 'main');
  }, [forceSwitch, disabled]);

  if (forceSwitch) {
    return (
      <div className="bg-slate-800 border-2 border-slate-700 rounded-lg p-3">
        <p className="font-pixel text-[10px] text-yellow-300 mb-2">Choose your next Pokémon!</p>
        <SwitchGrid team={team} activeIndex={activeIndex} onSwitch={onSwitch} mustSwitch />
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="bg-slate-800 border-2 border-slate-700 rounded-lg p-6 text-center">
        <p className="font-pixel text-[10px] text-slate-400 animate-pulse">
          Waiting for the turn to resolve…
        </p>
      </div>
    );
  }

  if (active?.charging) {
    return (
      <div className="bg-slate-800 border-2 border-slate-700 rounded-lg p-6 text-center">
        <p className="font-pixel text-[10px] text-cyan-300">
          {active.name} is charging {active.charging}! It will strike this turn.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border-2 border-slate-700 rounded-lg p-3">
      {view === 'main' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {active.moves.map((m, i) => (
              <button
                key={i}
                onClick={() => onMove(i)}
                className="text-left rounded-lg px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="font-pixel text-[9px]">{m.name}</span>
                  <span className={`text-[7px] uppercase px-1 py-0.5 rounded text-white ${typeBadge(m.type)}`}>
                    {m.type}
                  </span>
                </div>
                <div className="text-[9px] text-slate-400 mt-1">
                  {m.damageClass} · {m.power ? `Pwr ${m.power}` : '—'} · {m.accuracy ?? '∞'}%
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => setView('switch')}
            className="mt-2 w-full rounded-lg px-3 py-2 bg-indigo-700 hover:bg-indigo-600 font-pixel text-[9px]"
          >
            Switch Pokémon
          </button>
        </>
      ) : (
        <>
          <SwitchGrid team={team} activeIndex={activeIndex} onSwitch={onSwitch} />
          <button
            onClick={() => setView('main')}
            className="mt-2 w-full rounded-lg px-3 py-2 bg-slate-700 hover:bg-slate-600 font-pixel text-[9px]"
          >
            ← Back
          </button>
        </>
      )}
    </div>
  );
}

function SwitchGrid({ team, activeIndex, onSwitch, mustSwitch }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {team.map((p, i) => {
        const unavailable = p.fainted || i === activeIndex;
        return (
          <button
            key={i}
            disabled={unavailable}
            onClick={() => onSwitch(i)}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border transition ${
              unavailable
                ? 'bg-slate-900 border-slate-800 opacity-40 cursor-not-allowed'
                : 'bg-slate-700 hover:bg-slate-600 border-slate-600'
            }`}
          >
            {p.frontSprite && <img src={p.frontSprite} alt={p.name} className="w-8 h-8 pixelated" />}
            <div className="text-left">
              <div className="font-pixel text-[8px] capitalize">{p.name}</div>
              <div className="text-[8px] text-slate-400">
                {p.fainted ? 'Fainted' : `${Math.ceil(p.currentHp)}/${p.maxHp} HP`}
                {i === activeIndex && !mustSwitch ? ' (active)' : ''}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
