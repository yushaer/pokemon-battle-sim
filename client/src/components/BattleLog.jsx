import { useEffect, useRef } from 'react';

// Scrolling text box describing what just happened. Auto-scrolls to newest line.
export default function BattleLog({ lines }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="log-scroll h-28 overflow-y-auto bg-slate-900 border-2 border-slate-700 rounded-lg p-3 text-xs leading-relaxed">
      {lines.length === 0 && <p className="text-slate-500 italic">The battle is about to begin…</p>}
      {lines.map((line, i) => (
        <p key={i} className="text-slate-200 mb-1">
          {line}
        </p>
      ))}
      <div ref={endRef} />
    </div>
  );
}
