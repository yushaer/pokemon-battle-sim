import { useEffect, useRef } from 'react';

// Color per entry kind so the log is scannable at a glance.
const KIND_STYLE = {
  move: 'text-slate-100 font-semibold',
  damage: 'text-red-300',
  crit: 'text-orange-300 font-semibold',
  heal: 'text-green-300',
  status: 'text-yellow-300',
  boost: 'text-cyan-300',
  faint: 'text-red-400 font-bold',
  end: 'text-yellow-300 font-bold',
  info: 'text-slate-300',
};

// Scrolling text box describing what just happened. Auto-scrolls to newest line.
export default function BattleLog({ lines }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="log-scroll h-28 md:h-full md:max-h-56 overflow-y-auto bg-slate-900 border-2 border-slate-700 rounded-lg p-3 text-xs leading-relaxed">
      {lines.length === 0 && <p className="text-slate-500 italic">The battle is about to begin…</p>}
      {lines.map((line, i) => {
        const text = typeof line === 'string' ? line : line.text;
        const kind = typeof line === 'string' ? 'info' : line.kind || 'info';
        return (
          <p key={i} className={`log-line mb-1 ${KIND_STYLE[kind] || KIND_STYLE.info}`}>
            {text}
          </p>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
