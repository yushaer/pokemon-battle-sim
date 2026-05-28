import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import HealthBar from './HealthBar.jsx';
import BattleLog from './BattleLog.jsx';
import ActionMenu from './ActionMenu.jsx';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Build the renderable view of one active Pokemon.
function selfView(p) {
  return {
    name: p.name,
    types: p.types,
    sprite: p.spriteAnim || p.sprite,
    currentHp: p.currentHp,
    maxHp: p.maxHp,
    fainted: p.fainted,
    level: p.level,
  };
}
function oppView(p) {
  return {
    name: p.name,
    types: p.types,
    sprite: p.spriteAnim || p.sprite,
    currentHp: p.currentHp,
    maxHp: p.maxHp,
    fainted: p.fainted,
    level: p.level,
  };
}

export default function BattleScreen({ initialState, onLeave }) {
  const myId = socket.id;

  // Authoritative snapshot (used for the action menu / team list).
  const [state, setState] = useState(initialState);
  // Animated display of the two active Pokemon.
  const [display, setDisplay] = useState({
    you: selfView(initialState.you.team[initialState.you.activeIndex]),
    opp: oppView(initialState.opponent.active),
  });
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false); // true while playing back a turn
  const [submitted, setSubmitted] = useState(false); // waiting for opponent
  const [shake, setShake] = useState(null); // 'you' | 'opp'
  const [lunge, setLunge] = useState(null); // 'you' | 'opp'
  const [result, setResult] = useState(null); // win/lose overlay text

  const displayRef = useRef(display);
  const stateRef = useRef(state);
  displayRef.current = display;
  stateRef.current = state;

  const setDisp = (updater) =>
    setDisplay((prev) => {
      const next = updater(prev);
      displayRef.current = next;
      return next;
    });
  const pushLog = (text) => text && setLog((prev) => [...prev, text]);

  // --- socket wiring ---
  useEffect(() => {
    const onTurn = ({ events, stateAfter }) => playTurn(events, stateAfter);
    const onLeftEvt = ({ message }) => {
      pushLog(message);
      setResult({ won: true, text: message });
    };
    socket.on('turnResult', onTurn);
    socket.on('opponentLeft', onLeftEvt);
    return () => {
      socket.off('turnResult', onTurn);
      socket.off('opponentLeft', onLeftEvt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- the staggered playback engine ---
  async function playTurn(events, stateAfter) {
    setBusy(true);
    setSubmitted(false);

    for (const ev of events) {
      const mine = ev.side === myId;
      switch (ev.type) {
        case 'move': {
          pushLog(ev.text);
          // attacker lunges toward the opponent
          setLunge(mine ? 'you' : 'opp');
          await sleep(350);
          setLunge(null);
          await sleep(450);
          break;
        }
        case 'charge': {
          pushLog(ev.text);
          await sleep(900);
          break;
        }
        case 'damage': {
          // `ev.side` is the side LOSING hp.
          const losing = mine ? 'you' : 'opp';
          setDisp((prev) => ({
            ...prev,
            [losing]: { ...prev[losing], currentHp: ev.newHp },
          }));
          setShake(losing);
          if (ev.text) pushLog(ev.text);
          await sleep(900); // let the HP bar drain smoothly (700ms transition)
          setShake(null);
          await sleep(700); // the spec's 1–2s pause between phases
          break;
        }
        case 'miss':
        case 'status-fail':
        case 'text': {
          pushLog(ev.text);
          await sleep(800);
          break;
        }
        case 'faint': {
          const fainted = mine ? 'you' : 'opp';
          setDisp((prev) => ({
            ...prev,
            [fainted]: { ...prev[fainted], fainted: true },
          }));
          pushLog(ev.text);
          await sleep(1000);
          break;
        }
        case 'switch': {
          if (mine) {
            const incoming = stateAfter.you.team[ev.toIndex];
            setDisp((prev) => ({ ...prev, you: selfView(incoming) }));
          } else {
            setDisp((prev) => ({ ...prev, opp: oppView(ev.pokemon) }));
          }
          pushLog(ev.text);
          await sleep(900);
          break;
        }
        case 'end': {
          pushLog(ev.text);
          await sleep(600);
          setResult({ won: ev.winnerSide === myId, text: ev.text });
          break;
        }
        default:
          break;
      }
    }

    // Sync to the authoritative post-turn snapshot.
    setState(stateAfter);
    setDisp(() => ({
      you: selfView(stateAfter.you.team[stateAfter.you.activeIndex]),
      opp: oppView(stateAfter.opponent.active),
    }));
    setBusy(false);
  }

  // --- action handlers ---
  function handleMove(i) {
    if (busy || submitted) return;
    socket.emit('submitAction', { type: 'move', moveIndex: i });
    setSubmitted(true);
  }
  function handleSwitch(i) {
    if (busy) return;
    if (state.needsSwitch) {
      socket.emit('submitSwitch', { targetIndex: i });
    } else {
      if (submitted) return;
      socket.emit('submitSwitch', { targetIndex: i });
      setSubmitted(true);
    }
  }

  const youActive = state.you.team[state.you.activeIndex];
  const menuDisabled = busy || submitted || (!state.needsAction && !state.needsSwitch) || !!result;

  return (
    <div className="max-w-4xl mx-auto">
      {/* ---- Battle field ---- */}
      <div className="relative rounded-2xl overflow-hidden border-4 border-slate-700 shadow-2xl"
           style={{ background: 'linear-gradient(180deg,#7dd3fc 0%,#bae6fd 55%,#86efac 55%,#4ade80 100%)' }}>
        <div className="relative h-80 sm:h-96">
          {/* Opponent — top right */}
          <div className="absolute top-4 left-4">
            <HealthBar
              name={display.opp.name}
              level={display.opp.level}
              currentHp={display.opp.currentHp}
              maxHp={display.opp.maxHp}
              types={display.opp.types}
            />
            <p className="text-[9px] text-slate-700 mt-1 ml-1">
              {state.opponent.name} · {state.opponent.remaining} left
            </p>
          </div>
          <div className="absolute top-6 right-8">
            <img
              src={display.opp.sprite}
              alt={display.opp.name}
              className={`w-28 h-28 sm:w-36 sm:h-36 pixelated drop-shadow-xl transition-all duration-500 ${
                display.opp.fainted ? 'opacity-0 translate-y-6' : ''
              } ${shake === 'opp' ? 'animate-shake' : ''} ${
                lunge === 'opp' ? '-translate-x-4 translate-y-2' : ''
              }`}
            />
          </div>

          {/* Player — bottom left */}
          <div className="absolute bottom-6 left-8">
            <img
              src={display.you.sprite}
              alt={display.you.name}
              className={`w-32 h-32 sm:w-44 sm:h-44 pixelated drop-shadow-xl transition-all duration-500 ${
                display.you.fainted ? 'opacity-0 translate-y-6' : 'animate-bobbing'
              } ${shake === 'you' ? 'animate-shake' : ''} ${
                lunge === 'you' ? 'translate-x-4 -translate-y-2' : ''
              }`}
            />
          </div>
          <div className="absolute bottom-4 right-4">
            <HealthBar
              name={display.you.name}
              level={display.you.level}
              currentHp={display.you.currentHp}
              maxHp={display.you.maxHp}
              types={display.you.types}
              showNumbers
            />
            <p className="text-[9px] text-slate-700 mt-1 text-right mr-1">{state.you.name} (you)</p>
          </div>
        </div>
      </div>

      {/* ---- Log + action menu ---- */}
      <div className="grid md:grid-cols-2 gap-3 mt-3">
        <BattleLog lines={log} />
        <ActionMenu
          active={{ ...youActive, charging: youActive.charging }}
          team={state.you.team}
          activeIndex={state.you.activeIndex}
          disabled={menuDisabled}
          forceSwitch={state.needsSwitch && !busy && !result}
          onMove={handleMove}
          onSwitch={handleSwitch}
        />
      </div>

      {/* ---- Result overlay ---- */}
      {result && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 text-center border border-slate-600 max-w-sm">
            <h2 className={`font-pixel text-lg mb-3 ${result.won ? 'text-green-400' : 'text-red-400'}`}>
              {result.won ? 'Victory!' : 'Defeat'}
            </h2>
            <p className="text-sm text-slate-300 mb-6">{result.text}</p>
            <button
              onClick={onLeave}
              className="px-6 py-2 rounded-lg bg-yellow-400 text-black font-pixel text-[10px] hover:bg-yellow-300"
            >
              Back to Team Builder
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
