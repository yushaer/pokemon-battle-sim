import { useEffect, useState } from 'react';
import { socket } from '../socket';
import { teamsApi } from '../api/auth';
import { getPokemonList } from '../api/pokeapi';

const SPRITE_CDN = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

const STATUS_LABEL = {
  idle: { text: 'Available', cls: 'text-green-400' },
  searching: { text: 'In queue', cls: 'text-yellow-400' },
  battle: { text: 'In battle', cls: 'text-red-400' },
};

// Main hub after login: manage saved teams, see who's online, challenge them,
// or queue for a random match.
export default function Lobby({ user, activeTeamId, setActiveTeamId, onUserUpdate, onEdit, onLogout }) {
  const [online, setOnline] = useState([]);
  const [incoming, setIncoming] = useState(null); // { challengeId, fromUsername }
  const [outgoing, setOutgoing] = useState(null); // { challengeId, toUsername }
  const [queue, setQueue] = useState(null); // status string
  const [notice, setNotice] = useState(null);
  const [dexMap, setDexMap] = useState({}); // species name -> national dex id

  useEffect(() => {
    getPokemonList()
      .then((list) => setDexMap(Object.fromEntries(list.map((p) => [p.name, p.id]))))
      .catch(() => {});
  }, []);

  const teams = user.teams || [];
  const activeTeam = teams.find((t) => t.id === activeTeamId) || null;
  const hasTeam = !!activeTeam && activeTeam.slots?.length > 0;

  useEffect(() => {
    socket.emit('lobby:get');
    const onList = (list) => setOnline(list.filter((u) => u.userId !== user.id));
    const onIncoming = (c) => setIncoming(c);
    const onSent = (c) => setOutgoing(c);
    const onDeclined = ({ byUsername }) => {
      setOutgoing(null);
      setNotice(`${byUsername} declined your challenge.`);
    };
    const onCancelled = ({ reason }) => {
      setOutgoing(null);
      if (reason === 'timeout') setNotice('Your challenge timed out.');
    };
    const onExpired = () => setIncoming(null);
    const onChalErr = ({ message }) => setNotice(message);
    const onMatchStatus = ({ status, position }) => {
      if (status === 'queued') setQueue(`In queue (position ${position})…`);
      else if (status === 'building') setQueue('Opponent found! Building battle…');
      else if (status === 'idle') setQueue(null);
    };
    const onMatchError = ({ message }) => {
      setQueue(null);
      setNotice(message);
    };

    socket.on('lobby:update', onList);
    socket.on('challenge:incoming', onIncoming);
    socket.on('challenge:sent', onSent);
    socket.on('challenge:declined', onDeclined);
    socket.on('challenge:cancelled', onCancelled);
    socket.on('challenge:expired', onExpired);
    socket.on('challenge:error', onChalErr);
    socket.on('matchStatus', onMatchStatus);
    socket.on('matchError', onMatchError);
    return () => {
      socket.off('lobby:update', onList);
      socket.off('challenge:incoming', onIncoming);
      socket.off('challenge:sent', onSent);
      socket.off('challenge:declined', onDeclined);
      socket.off('challenge:cancelled', onCancelled);
      socket.off('challenge:expired', onExpired);
      socket.off('challenge:error', onChalErr);
      socket.off('matchStatus', onMatchStatus);
      socket.off('matchError', onMatchError);
    };
  }, [user.id]);

  function requireTeam() {
    if (!hasTeam) {
      setNotice('Select (or build) a team first.');
      return false;
    }
    return true;
  }

  function challenge(target) {
    if (!requireTeam()) return;
    setNotice(null);
    socket.emit('challenge:send', { toUserId: target.userId, name: user.username, team: activeTeam.slots });
  }
  function cancelOutgoing() {
    if (outgoing) socket.emit('challenge:cancel', { challengeId: outgoing.challengeId });
    setOutgoing(null);
  }
  function respond(accept) {
    if (accept && !requireTeam()) return;
    socket.emit('challenge:respond', {
      challengeId: incoming.challengeId,
      accept,
      name: user.username,
      team: accept ? activeTeam.slots : undefined,
    });
    setIncoming(null);
  }
  function findMatch() {
    if (!requireTeam()) return;
    setNotice(null);
    socket.emit('queue:find', { name: user.username, team: activeTeam.slots });
  }
  function cancelQueue() {
    socket.emit('queue:cancel');
    setQueue(null);
  }

  async function deleteTeam(id) {
    try {
      const { teams: updated } = await teamsApi.remove(id);
      onUserUpdate({ teams: updated });
      if (activeTeamId === id) setActiveTeamId(null);
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function cloneTeam(t) {
    try {
      const name = `${t.name} (copy)`.slice(0, 40);
      const { teams: updated } = await teamsApi.create(name, t.slots);
      onUserUpdate({ teams: updated });
    } catch (err) {
      setNotice(err.message);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-300">
          Signed in as <span className="text-yellow-300 font-bold">{user.username}</span>
        </p>
        <button onClick={onLogout} className="text-xs px-3 py-1 rounded bg-slate-700 hover:bg-slate-600">
          Log out
        </button>
      </div>

      {notice && (
        <div className="mb-4 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm flex justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-slate-500 hover:text-slate-300">✕</button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* ----- Teams ----- */}
        <section className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-pixel text-[11px] text-yellow-300">Your Teams</h3>
            <button
              onClick={() => onEdit(null)}
              className="text-xs px-3 py-1 rounded bg-green-600 hover:bg-green-500"
            >
              + New Team
            </button>
          </div>

          {teams.length === 0 && (
            <p className="text-sm text-slate-500 py-6 text-center">
              No saved teams yet. Click “New Team” to build one.
            </p>
          )}

          <div className="space-y-2">
            {teams.map((t) => (
              <div
                key={t.id}
                className={`rounded-lg border p-2 flex items-center gap-3 ${
                  activeTeamId === t.id ? 'border-yellow-400 bg-slate-700' : 'border-slate-600 bg-slate-900'
                }`}
              >
                <button onClick={() => setActiveTeamId(t.id)} className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-[10px] capitalize">{t.name}</span>
                    {activeTeamId === t.id && (
                      <span className="text-[8px] bg-yellow-400 text-black px-1.5 py-0.5 rounded">ACTIVE</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {t.slots.map((s, i) =>
                      dexMap[s.species] ? (
                        <img
                          key={i}
                          src={`${SPRITE_CDN}/${dexMap[s.species]}.png`}
                          alt={s.species}
                          title={s.species}
                          loading="lazy"
                          className="w-9 h-9 pixelated"
                        />
                      ) : (
                        <span
                          key={i}
                          className="text-[9px] capitalize bg-slate-700 rounded px-1.5 py-0.5 text-slate-300"
                        >
                          {s.species}
                        </span>
                      ),
                    )}
                  </div>
                </button>
                <div className="flex flex-col gap-1">
                  <button onClick={() => onEdit(t)} className="text-[10px] px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600">
                    Edit
                  </button>
                  <button onClick={() => cloneTeam(t)} className="text-[10px] px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600">
                    Clone
                  </button>
                  <button onClick={() => deleteTeam(t.id)} className="text-[10px] px-2 py-0.5 rounded bg-red-700 hover:bg-red-600">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-700">
            {queue ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-yellow-300 animate-pulse">{queue}</span>
                <button onClick={cancelQueue} className="text-xs px-3 py-1 rounded bg-slate-700 hover:bg-slate-600">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={findMatch}
                disabled={!hasTeam}
                className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-pixel text-[10px]"
              >
                Find Random Match ⚔
              </button>
            )}
          </div>
        </section>

        {/* ----- Online players ----- */}
        <section className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h3 className="font-pixel text-[11px] text-yellow-300 mb-3">
            Online Players ({online.length})
          </h3>
          {online.length === 0 && (
            <p className="text-sm text-slate-500 py-6 text-center">
              No one else is online. Open the app in another browser/tab and log in as a second user
              to challenge them.
            </p>
          )}
          <div className="space-y-2">
            {online.map((u) => {
              const st = STATUS_LABEL[u.status] || STATUS_LABEL.idle;
              return (
                <div key={u.userId} className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 hover:border-slate-500 transition">
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-700 text-xs font-bold uppercase">
                      {u.username.slice(0, 1)}
                    </span>
                    <div>
                      <span className="text-sm capitalize">{u.username}</span>
                      <span className={`block text-[10px] ${st.cls}`}>● {st.text}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => challenge(u)}
                    disabled={u.status !== 'idle' || !!outgoing || !hasTeam}
                    className="text-xs px-3 py-1 rounded bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-40"
                  >
                    Challenge
                  </button>
                </div>
              );
            })}
          </div>
          {!hasTeam && (
            <p className="text-[10px] text-slate-500 mt-3">Select an active team to enable battling.</p>
          )}
        </section>
      </div>

      {/* ----- Outgoing challenge status ----- */}
      {outgoing && (
        <div className="fixed bottom-4 right-4 bg-slate-800 border border-slate-600 rounded-lg p-4 shadow-xl">
          <p className="text-sm mb-2">
            Waiting for <span className="text-yellow-300">{outgoing.toUsername}</span> to respond…
          </p>
          <button onClick={cancelOutgoing} className="text-xs px-3 py-1 rounded bg-slate-700 hover:bg-slate-600">
            Cancel
          </button>
        </div>
      )}

      {/* ----- Incoming challenge modal ----- */}
      {incoming && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 text-center border border-slate-600 max-w-sm">
            <h2 className="font-pixel text-sm text-yellow-300 mb-3">Challenge!</h2>
            <p className="text-sm text-slate-300 mb-2">
              <span className="text-yellow-300">{incoming.fromUsername}</span> wants to battle you.
            </p>
            {!hasTeam && <p className="text-[11px] text-red-400 mb-3">Select a team before accepting.</p>}
            <div className="flex gap-3 justify-center mt-4">
              <button
                onClick={() => respond(true)}
                disabled={!hasTeam}
                className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 font-pixel text-[10px]"
              >
                Accept
              </button>
              <button
                onClick={() => respond(false)}
                className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-600 font-pixel text-[10px]"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
