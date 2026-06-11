import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import HealthBar from './HealthBar.jsx';
import BattleLog from './BattleLog.jsx';
import ActionMenu from './ActionMenu.jsx';
import StatsPanel from './StatsPanel.jsx';
import {
  playMoveFx,
  playStatusFx,
  playImpactShake,
  playFaintFx,
  playSwitchInFx,
} from '../fx/battleFx.js';

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
    status: p.status || null,
    stats: p.stats,
    boosts: p.boosts || {},
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
    status: p.status || null,
    boosts: p.boosts || {},
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
  const [opponentChosen, setOpponentChosen] = useState(false);
  const [critFlash, setCritFlash] = useState(null); // 'you' | 'opp' on crits

  // Element refs for the GSAP effect layer.
  const fieldRef = useRef(null);
  const youSpriteRef = useRef(null);
  const oppSpriteRef = useRef(null);

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
  const pushLog = (text, kind = 'info') => text && setLog((prev) => [...prev, { text, kind }]);

  // --- socket wiring ---
  useEffect(() => {
    const onTurn = ({ events, stateAfter }) => playTurn(events, stateAfter);
    const onLeftEvt = ({ message }) => {
      pushLog(message);
      setResult({ won: true, text: message });
    };
    const onForfeited = ({ message }) => {
      pushLog(message);
      setResult({ won: false, text: message });
    };
    const onWaiting = ({ from }) => {
      if (from !== myId) setOpponentChosen(true);
    };
    const onRejected = ({ reason }) => {
      if (reason === 'no-pp') pushLog('That move has no PP left!');
      setSubmitted(false);
    };
    socket.on('turnResult', onTurn);
    socket.on('opponentLeft', onLeftEvt);
    socket.on('forfeited', onForfeited);
    socket.on('waiting', onWaiting);
    socket.on('actionRejected', onRejected);
    return () => {
      socket.off('turnResult', onTurn);
      socket.off('opponentLeft', onLeftEvt);
      socket.off('forfeited', onForfeited);
      socket.off('waiting', onWaiting);
      socket.off('actionRejected', onRejected);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- the staggered playback engine ---
  async function playTurn(events, stateAfter) {
    setBusy(true);
    setSubmitted(false);
    setOpponentChosen(false);

    for (const ev of events) {
      const mine = ev.side === myId;
      switch (ev.type) {
        case 'move': {
          pushLog(ev.text, 'move');
          // attacker lunges toward the opponent
          setLunge(mine ? 'you' : 'opp');
          const atkEl = mine ? youSpriteRef.current : oppSpriteRef.current;
          const tgtEl = mine ? oppSpriteRef.current : youSpriteRef.current;
          if (ev.category === 'status') {
            await playStatusFx(fieldRef.current, atkEl, ev.moveType);
          } else if (ev.category) {
            // GSAP-choreographed, type-keyed move animation
            await playMoveFx({
              container: fieldRef.current,
              attackerEl: atkEl,
              targetEl: tgtEl,
              moveType: ev.moveType,
              category: ev.category,
            });
          } else {
            await sleep(500);
          }
          setLunge(null);
          await sleep(250);
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
          if (ev.crit) setCritFlash(losing);
          playImpactShake(fieldRef.current, ev.crit);
          if (ev.text) pushLog(ev.text, ev.crit ? 'crit' : 'damage');
          await sleep(900); // let the HP bar drain smoothly (700ms transition)
          setShake(null);
          setCritFlash(null);
          await sleep(700); // the spec's 1–2s pause between phases
          break;
        }
        case 'heal': {
          const healed = mine ? 'you' : 'opp';
          setDisp((prev) => ({
            ...prev,
            [healed]: { ...prev[healed], currentHp: ev.newHp },
          }));
          if (ev.text) pushLog(ev.text, 'heal');
          await sleep(900);
          break;
        }
        case 'status': {
          const afflicted = mine ? 'you' : 'opp';
          setDisp((prev) => ({
            ...prev,
            [afflicted]: { ...prev[afflicted], status: ev.status },
          }));
          if (ev.text) pushLog(ev.text, 'status');
          setShake(afflicted);
          await sleep(700);
          setShake(null);
          break;
        }
        case 'boost': {
          // Update the live stat panel as the boost lands.
          const who = mine ? 'you' : 'opp';
          setDisp((prev) => ({
            ...prev,
            [who]: { ...prev[who], boosts: { ...prev[who].boosts, [ev.stat]: ev.stage } },
          }));
          if (ev.text) pushLog(ev.text, 'boost');
          await sleep(700);
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
          playFaintFx(fieldRef.current, fainted === 'you' ? youSpriteRef.current : oppSpriteRef.current);
          setDisp((prev) => ({
            ...prev,
            [fainted]: { ...prev[fainted], fainted: true },
          }));
          pushLog(ev.text, 'faint');
          await sleep(1000);
          break;
        }
        case 'switch': {
          if (mine) {
            const incoming = stateAfter.you.team[ev.toIndex];
            setDisp((prev) => ({ ...prev, you: selfView(incoming) }));
            playSwitchInFx(youSpriteRef.current);
          } else {
            setDisp((prev) => ({ ...prev, opp: oppView(ev.pokemon) }));
            playSwitchInFx(oppSpriteRef.current);
          }
          pushLog(ev.text, 'move');
          await sleep(900);
          break;
        }
        case 'end': {
          pushLog(ev.text, 'end');
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

  function handleForfeit() {
    if (result) return;
    if (window.confirm('Forfeit this battle? Your opponent will win.')) {
      socket.emit('forfeit');
    }
  }

  const youActive = state.you.team[state.you.activeIndex];
  const menuDisabled = busy || submitted || (!state.needsAction && !state.needsSwitch) || !!result;
  const turnStatus = busy
    ? 'Resolving turn…'
    : submitted
      ? 'Waiting for opponent…'
      : opponentChosen
        ? 'Opponent is ready — your move!'
        : state.needsSwitch
          ? 'Choose a Pokémon!'
          : 'Choose your action';

  return (
    <div className="max-w-4xl mx-auto">
      {/* ---- Top bar: turn + status + forfeit ---- */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="font-pixel text-[10px] text-yellow-300">Turn {state.turn}</span>
        <span className="text-[11px] text-slate-300">{turnStatus}</span>
        {!result && (
          <button
            onClick={handleForfeit}
            className="text-[10px] px-3 py-1 rounded bg-red-800 hover:bg-red-700"
          >
            Forfeit
          </button>
        )}
      </div>

      {/* ---- Battle field ---- */}
      <div className="relative rounded-2xl overflow-hidden border-4 border-slate-700 shadow-2xl"
           style={{ background: 'linear-gradient(180deg,#4aa8e8 0%,#8fd0f5 45%,#bae6fd 55%,#7ecf6f 56%,#4ade80 78%,#2eb568 100%)' }}>
        <div ref={fieldRef} className="relative h-80 sm:h-96 overflow-hidden">
          {/* Scenery: sun + drifting clouds */}
          <div
            className="absolute -top-8 -left-8 w-32 h-32 rounded-full opacity-70"
            style={{ background: 'radial-gradient(circle, #fef9c3 0%, #fde047 35%, transparent 70%)' }}
          />
          <div className="absolute top-6 left-1/3 w-28 h-8 bg-white/60 rounded-full blur-sm animate-bobbing" />
          <div className="absolute top-16 right-1/4 w-20 h-6 bg-white/50 rounded-full blur-sm animate-bobbing" style={{ animationDelay: '1.2s' }} />

          {/* Battle platforms */}
          <div
            className="absolute right-2 top-[150px] sm:top-[170px] w-48 sm:w-56 h-14 rounded-[50%]"
            style={{ background: 'radial-gradient(ellipse, rgba(34,120,60,0.45) 0%, rgba(34,120,60,0.25) 55%, transparent 75%)' }}
          />
          <div
            className="absolute left-0 bottom-2 w-60 sm:w-72 h-16 rounded-[50%]"
            style={{ background: 'radial-gradient(ellipse, rgba(34,120,60,0.45) 0%, rgba(34,120,60,0.25) 55%, transparent 75%)' }}
          />

          {/* Opponent — top right */}
          <div className="absolute top-4 left-4">
            <HealthBar
              name={display.opp.name}
              level={display.opp.level}
              currentHp={display.opp.currentHp}
              maxHp={display.opp.maxHp}
              types={display.opp.types}
              status={display.opp.status}
            />
            <div className="flex items-center gap-2 mt-1 ml-1">
              <p className="text-[9px] text-slate-700 font-semibold">{state.opponent.name}</p>
              <BallPips alive={state.opponent.remaining} total={state.opponent.teamSize || state.opponent.remaining} />
            </div>
            <BoostChips boosts={display.opp.boosts} />
          </div>
          <div className="absolute top-6 right-8">
            <img
              ref={oppSpriteRef}
              src={display.opp.sprite}
              alt={display.opp.name}
              className={`w-28 h-28 sm:w-36 sm:h-36 pixelated drop-shadow-xl transition-all duration-500 ${
                display.opp.fainted ? 'opacity-0 translate-y-6 grayscale' : ''
              } ${shake === 'opp' ? 'animate-shake' : ''} ${
                critFlash === 'opp' ? 'animate-flash' : ''
              } ${lunge === 'opp' ? '-translate-x-4 translate-y-2' : ''}`}
            />
          </div>

          {/* Player — bottom left */}
          <div className="absolute bottom-6 left-8">
            <img
              ref={youSpriteRef}
              src={display.you.sprite}
              alt={display.you.name}
              className={`w-32 h-32 sm:w-44 sm:h-44 pixelated drop-shadow-xl transition-all duration-500 ${
                display.you.fainted ? 'opacity-0 translate-y-6 grayscale' : 'animate-bobbing'
              } ${shake === 'you' ? 'animate-shake' : ''} ${
                critFlash === 'you' ? 'animate-flash' : ''
              } ${lunge === 'you' ? 'translate-x-4 -translate-y-2' : ''}`}
            />
          </div>
          <div className="absolute bottom-4 right-4">
            <HealthBar
              name={display.you.name}
              level={display.you.level}
              currentHp={display.you.currentHp}
              maxHp={display.you.maxHp}
              types={display.you.types}
              status={display.you.status}
              showNumbers
            />
            <div className="flex items-center justify-end gap-2 mt-1 mr-1">
              <BallPips
                alive={state.you.team.filter((p) => !p.fainted).length}
                total={state.you.team.length}
              />
              <p className="text-[9px] text-slate-700 font-semibold">{state.you.name} (you)</p>
            </div>
          </div>

        </div>
      </div>

      {/* ---- Live stats ---- */}
      <div className="mt-3">
        <StatsPanel
          name={display.you.name}
          stats={display.you.stats}
          boosts={display.you.boosts}
          status={display.you.status}
          currentHp={display.you.currentHp}
          maxHp={display.you.maxHp}
        />
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
          <div className="overlay-pop bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl p-8 text-center border border-slate-600 max-w-sm shadow-2xl">
            <h2 className={`font-pixel text-lg mb-3 ${result.won ? 'text-green-400' : 'text-red-400'}`}>
              {result.won ? 'Victory!' : 'Defeat'}
            </h2>
            <p className="text-sm text-slate-300 mb-6">{result.text}</p>
            <button
              onClick={onLeave}
              className="px-6 py-2 rounded-lg bg-yellow-400 text-black font-pixel text-[10px] hover:bg-yellow-300"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const BOOST_LABELS = {
  attack: 'Atk',
  defense: 'Def',
  'special-attack': 'SpA',
  'special-defense': 'SpD',
  speed: 'Spe',
  accuracy: 'Acc',
  evasion: 'Eva',
};

// Pokéball pips showing each side's remaining team members.
function BallPips({ alive, total }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`inline-block w-3 h-3 rounded-full border border-slate-800 ${
            i < alive ? '' : 'grayscale opacity-40'
          }`}
          style={{
            background: 'linear-gradient(180deg, #ef4444 0%, #ef4444 42%, #1e293b 42%, #1e293b 58%, #f8fafc 58%, #f8fafc 100%)',
          }}
        />
      ))}
    </div>
  );
}

// Small stat-stage badges for the opponent (whose raw stats stay hidden).
function BoostChips({ boosts = {} }) {
  const active = Object.entries(boosts).filter(([, v]) => v);
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1 ml-1">
      {active.map(([key, stage]) => (
        <span
          key={key}
          className={`text-[8px] font-bold px-1 py-0.5 rounded text-white ${
            stage > 0 ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {BOOST_LABELS[key] || key} {stage > 0 ? `+${stage}` : stage}
        </span>
      ))}
    </div>
  );
}
