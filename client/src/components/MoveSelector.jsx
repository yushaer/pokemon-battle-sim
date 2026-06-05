import { useEffect, useRef, useState } from 'react';
import { getMove } from '../api/pokeapi';
import { typeBadge } from '../utils/typeColors';

const CATEGORY_STYLE = {
  physical: 'bg-red-600',
  special: 'bg-blue-600',
  status: 'bg-gray-500',
};

// Searchable move picker for one move slot. Shows live move info (type,
// category, power/accuracy/PP, and the move's effect text) fetched from PokeAPI.
export default function MoveSelector({ index, movePool, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [info, setInfo] = useState({}); // moveName -> details
  const boxRef = useRef(null);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function ensureInfo(name) {
    if (!name) return;
    setInfo((prev) => {
      if (prev[name]) return prev;
      getMove(name)
        .then((d) => setInfo((p) => ({ ...p, [name]: d })))
        .catch(() => {});
      return prev;
    });
  }

  // Load info for the selected move + the currently visible search results.
  useEffect(() => {
    ensureInfo(value);
  }, [value]);

  const results = open
    ? movePool.filter((m) => m.replace(/-/g, ' ').includes(query.toLowerCase().trim())).slice(0, 12)
    : [];

  useEffect(() => {
    if (open) results.forEach(ensureInfo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  const sel = value ? info[value] : null;

  return (
    <div ref={boxRef} className="relative mb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left bg-slate-900 border border-slate-600 rounded px-2 py-1.5 hover:border-slate-400"
      >
        {value ? (
          <MoveRow name={value} data={sel} />
        ) : (
          <span className="text-xs text-slate-500">Move {index + 1} — click to search…</span>
        )}
      </button>

      {value && sel?.shortEffect && (
        <p className="text-[9px] text-slate-400 mt-1 px-1 leading-snug">{sel.shortEffect}</p>
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search moves…"
            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs mb-2"
          />
          <div className="max-h-56 overflow-y-auto log-scroll">
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="w-full text-left text-[10px] text-red-400 px-2 py-1 hover:bg-slate-700 rounded"
            >
              — clear slot —
            </button>
            {results.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                  setQuery('');
                }}
                className="w-full text-left px-2 py-1 hover:bg-slate-700 rounded"
              >
                <MoveRow name={m} data={info[m]} compact />
              </button>
            ))}
            {results.length === 0 && (
              <p className="text-[10px] text-slate-500 px-2 py-3">No moves match “{query}”.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MoveRow({ name, data, compact }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-pixel text-[8px] capitalize flex-1 truncate">
        {name.replace(/-/g, ' ')}
      </span>
      {data ? (
        <>
          <span className={`text-[7px] uppercase px-1 py-0.5 rounded text-white ${typeBadge(data.type)}`}>
            {data.type}
          </span>
          <span
            className={`text-[7px] uppercase px-1 py-0.5 rounded text-white ${
              CATEGORY_STYLE[data.damageClass] || 'bg-gray-500'
            }`}
          >
            {data.damageClass === 'special' ? 'spec' : data.damageClass.slice(0, 4)}
          </span>
          {!compact && (
            <span className="text-[8px] text-slate-400 whitespace-nowrap">
              {data.power ? `Pwr ${data.power}` : '—'} · {data.accuracy ?? '∞'}% · PP {data.pp}
            </span>
          )}
        </>
      ) : (
        <span className="text-[8px] text-slate-500">…</span>
      )}
    </div>
  );
}
