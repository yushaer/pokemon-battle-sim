import { useState, useEffect } from 'react';
import { typeBadge, TYPE_HEX } from '../utils/typeColors';

// Action menu: 2x2 move grid + a "Switch Pokémon" sub-menu.
// `forceSwitch` forces the switch view (after a faint) and hides move options.
export default function ActionMenu({ active, team, activeIndex, disabled, forceSwitch, onMove, onSwitch }) {
  const [view, setView] = useState('main'); // main | switch
  const [hovered, setHovered] = useState(null); // index of move being hovered

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

  const anyPp = active.moves.some((m) => (m.currentPp ?? m.pp) > 0);

  return (
    <div className="relative bg-slate-800 border-2 border-slate-700 rounded-lg p-3">
      {view === 'main' ? (
        <>
          {/* Hover tooltip floats above the move grid. */}
          {hovered != null && active.moves[hovered] && (
            <div className="absolute bottom-full left-0 right-0 mb-2 z-30">
              <MoveTooltip move={active.moves[hovered]} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {active.moves.map((m, i) => {
              const cur = m.currentPp ?? m.pp;
              const noPp = cur <= 0;
              const blocked = noPp && anyPp; // out of PP but other moves remain
              const ppColor = noPp ? 'text-red-400' : cur <= m.pp * 0.25 ? 'text-yellow-400' : 'text-slate-400';
              const hex = TYPE_HEX[m.type] || '#64748b';
              return (
                <button
                  key={i}
                  disabled={blocked}
                  onClick={() => onMove(i)}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered((h) => (h === i ? null : h))}
                  className={`text-left rounded-lg px-3 py-2 border transition hover:-translate-y-0.5 hover:shadow-lg ${
                    blocked ? 'bg-slate-900 opacity-40 cursor-not-allowed border-slate-700' : 'border-slate-600'
                  }`}
                  style={
                    blocked
                      ? undefined
                      : {
                          borderLeft: `4px solid ${hex}`,
                          background: `linear-gradient(135deg, ${hex}26 0%, rgba(51,65,85,0.9) 45%)`,
                        }
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="font-pixel text-[9px]">{m.name}</span>
                    <span className={`text-[7px] uppercase px-1 py-0.5 rounded text-white ${typeBadge(m.type)}`}>
                      {m.type}
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1 flex justify-between">
                    <span>
                      {m.damageClass} · {m.power ? `Pwr ${m.power}` : '—'} · {m.accuracy ?? '∞'}%
                    </span>
                    <span className={ppColor}>PP {cur}/{m.pp}</span>
                  </div>
                </button>
              );
            })}
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

const CATEGORY_STYLE = { physical: 'bg-red-600', special: 'bg-blue-600', status: 'bg-gray-500' };
const STAT_LABEL = {
  attack: 'Atk',
  defense: 'Def',
  'special-attack': 'SpA',
  'special-defense': 'SpD',
  speed: 'Spe',
  accuracy: 'Accuracy',
  evasion: 'Evasion',
};
const pretty = (s) => (s || '').replace(/-/g, ' ');

// Builds a list of human-readable secondary-effect strings from move metadata.
function describeEffects(move) {
  const out = [];
  const meta = move.meta || {};
  const isStatus = move.damageClass === 'status';
  const toSelf = (move.target || '').includes('user');

  for (const sc of move.statChanges || []) {
    const label = STAT_LABEL[sc.stat] || sc.stat;
    const sign = sc.change > 0 ? `+${sc.change}` : `${sc.change}`;
    const who = toSelf ? 'self' : 'target';
    const chance = !isStatus && meta.statChance && meta.statChance < 100 ? `${meta.statChance}% ` : '';
    out.push(`${chance}${sign} ${label} (${who})`);
  }
  if (meta.ailment && meta.ailment !== 'none') {
    const name = pretty(meta.ailment);
    out.push(isStatus ? `Inflicts ${name}` : `${meta.ailmentChance || 100}% to inflict ${name}`);
  }
  if (meta.healing > 0) out.push(`Heals ${meta.healing}% of max HP`);
  if (meta.drain > 0) out.push(`Drains ${meta.drain}% of damage dealt`);
  if (meta.drain < 0) out.push(`${Math.abs(meta.drain)}% recoil damage`);
  if (meta.flinchChance > 0) out.push(`${meta.flinchChance}% chance to flinch`);
  if (meta.critRate > 0) out.push('High critical-hit ratio');
  return out;
}

// Rich tooltip shown when hovering a move in battle.
function MoveTooltip({ move }) {
  const effects = describeEffects(move);
  return (
    <div className="bg-slate-900 border border-slate-500 rounded-lg p-3 shadow-2xl text-left">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-pixel text-[9px] flex-1">{move.name}</span>
        <span className={`text-[7px] uppercase px-1 py-0.5 rounded text-white ${typeBadge(move.type)}`}>
          {move.type}
        </span>
        <span className={`text-[7px] uppercase px-1 py-0.5 rounded text-white ${CATEGORY_STYLE[move.damageClass]}`}>
          {move.damageClass}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1 text-[9px] text-center mb-2">
        <Stat label="Power" value={move.power ?? '—'} />
        <Stat label="Acc" value={move.accuracy != null ? `${move.accuracy}%` : '∞'} />
        <Stat label="PP" value={`${move.currentPp ?? move.pp}/${move.pp}`} />
        <Stat label="Prio" value={move.priority ?? 0} />
      </div>
      {move.shortEffect && (
        <p className="text-[10px] text-slate-300 leading-snug mb-1">{move.shortEffect}</p>
      )}
      {effects.length > 0 && (
        <ul className="text-[9px] text-cyan-300 space-y-0.5">
          {effects.map((e, i) => (
            <li key={i}>• {e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-slate-800 rounded py-1">
      <div className="text-[7px] text-slate-400">{label}</div>
      <div className="font-bold text-slate-100">{value}</div>
    </div>
  );
}
