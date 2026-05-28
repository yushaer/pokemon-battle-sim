import { useEffect, useState } from 'react';
import { socket } from '../socket';

// Shown while waiting in the matchmaking queue. battleStart is handled in App.
export default function Matchmaking({ onCancel }) {
  const [status, setStatus] = useState('Searching for an opponent…');
  const [error, setError] = useState(null);

  useEffect(() => {
    const onStatus = ({ status: s, position }) => {
      if (s === 'queued') setStatus(`In queue (position ${position})… waiting for an opponent.`);
      else if (s === 'building') setStatus('Opponent found! Building teams from PokeAPI…');
    };
    const onError = ({ message }) => setError(message);
    socket.on('matchStatus', onStatus);
    socket.on('matchError', onError);
    return () => {
      socket.off('matchStatus', onStatus);
      socket.off('matchError', onError);
    };
  }, []);

  return (
    <div className="max-w-md mx-auto mt-20 text-center">
      <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-xl">
        {!error ? (
          <>
            <div className="mx-auto mb-6 h-16 w-16 rounded-full border-4 border-t-yellow-300 border-slate-600 animate-spin" />
            <p className="font-pixel text-xs leading-relaxed text-slate-200">{status}</p>
          </>
        ) : (
          <p className="text-red-400 mb-4 text-sm">⚠ {error}</p>
        )}
        <button
          onClick={onCancel}
          className="mt-8 px-5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
