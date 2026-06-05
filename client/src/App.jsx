import { useEffect, useState } from 'react';
import { socket, connectSocket, disconnectSocket } from './socket';
import { authApi, getToken, setToken } from './api/auth';
import Login from './components/Login.jsx';
import Lobby from './components/Lobby.jsx';
import TeamBuilder from './components/TeamBuilder.jsx';
import BattleScreen from './components/BattleScreen.jsx';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState('lobby'); // lobby | builder | battle
  const [editingTeam, setEditingTeam] = useState(null);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [initialState, setInitialState] = useState(null);
  const [connected, setConnected] = useState(false);

  // Validate an existing token on first load.
  useEffect(() => {
    async function boot() {
      if (!getToken()) {
        setBooting(false);
        return;
      }
      try {
        const { user: me } = await authApi.me();
        enterApp(me);
      } catch {
        setToken(null);
      } finally {
        setBooting(false);
      }
    }
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Socket lifecycle + global battle-start listener.
  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err) => {
      // Bad/expired token → force re-login.
      if (err?.message === 'unauthorized') handleLogout();
    };
    const onBattleStart = (state) => {
      setInitialState(state);
      setScreen('battle');
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('battleStart', onBattleStart);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('battleStart', onBattleStart);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enterApp(me) {
    setUser(me);
    setActiveTeamId((prev) => prev || me.teams?.[0]?.id || null);
    connectSocket();
    setScreen('lobby');
  }

  function handleLogout() {
    disconnectSocket();
    setToken(null);
    setUser(null);
    setActiveTeamId(null);
    setScreen('lobby');
  }

  function updateUser(patch) {
    setUser((u) => {
      const next = { ...u, ...patch };
      // Keep active team valid.
      if (patch.teams && !patch.teams.some((t) => t.id === activeTeamId)) {
        setActiveTeamId(patch.teams[0]?.id || null);
      }
      return next;
    });
  }

  function onSavedTeam(teams) {
    updateUser({ teams });
    setScreen('lobby');
  }

  if (booting) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen w-full">
      <header className="flex items-center justify-between px-6 py-3 bg-slate-900/80 border-b border-slate-700">
        <h1 className="font-pixel text-sm sm:text-base text-yellow-300">⚔ Pokémon Battle Sim</h1>
        {user && (
          <span className={`text-xs px-2 py-1 rounded ${connected ? 'bg-green-700' : 'bg-red-700'}`}>
            {connected ? 'online' : 'connecting…'}
          </span>
        )}
      </header>

      <main className="p-4">
        {!user && <Login onAuthed={enterApp} />}

        {user && screen === 'lobby' && (
          <Lobby
            user={user}
            activeTeamId={activeTeamId}
            setActiveTeamId={setActiveTeamId}
            onUserUpdate={updateUser}
            onEdit={(team) => {
              setEditingTeam(team);
              setScreen('builder');
            }}
            onLogout={handleLogout}
          />
        )}

        {user && screen === 'builder' && (
          <TeamBuilder
            initialTeam={editingTeam}
            onSaved={onSavedTeam}
            onCancel={() => setScreen('lobby')}
          />
        )}

        {user && screen === 'battle' && initialState && (
          <BattleScreen initialState={initialState} onLeave={() => setScreen('lobby')} />
        )}
      </main>
    </div>
  );
}
