import { useEffect, useState } from 'react';
import { socket } from './socket';
import TeamBuilder from './components/TeamBuilder.jsx';
import Matchmaking from './components/Matchmaking.jsx';
import BattleScreen from './components/BattleScreen.jsx';

// Top-level state machine: builder -> queue -> battle.
export default function App() {
  const [screen, setScreen] = useState('builder'); // builder | queue | battle
  const [team, setTeam] = useState(null);
  const [trainerName, setTrainerName] = useState('');
  const [initialState, setInitialState] = useState(null);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onBattleStart = (state) => {
      setInitialState(state);
      setScreen('battle');
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('battleStart', onBattleStart);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('battleStart', onBattleStart);
    };
  }, []);

  function startQueue(builtTeam, name) {
    setTeam(builtTeam);
    setTrainerName(name);
    setScreen('queue');
    socket.emit('findMatch', { name, team: builtTeam });
  }

  function cancelQueue() {
    socket.emit('cancelMatch');
    setScreen('builder');
  }

  function leaveBattle() {
    setInitialState(null);
    setScreen('builder');
  }

  return (
    <div className="min-h-screen w-full">
      <header className="flex items-center justify-between px-6 py-3 bg-slate-900/80 border-b border-slate-700">
        <h1 className="font-pixel text-sm sm:text-base text-yellow-300">⚔ Pokémon Battle Sim</h1>
        <span
          className={`text-xs px-2 py-1 rounded ${connected ? 'bg-green-700' : 'bg-red-700'}`}
        >
          {connected ? 'online' : 'offline'}
        </span>
      </header>

      <main className="p-4">
        {screen === 'builder' && <TeamBuilder onReady={startQueue} />}
        {screen === 'queue' && <Matchmaking onCancel={cancelQueue} />}
        {screen === 'battle' && initialState && (
          <BattleScreen initialState={initialState} onLeave={leaveBattle} />
        )}
      </main>
    </div>
  );
}
