# Multiplayer Pokémon Battle Simulator

A real-time, server-authoritative Pokémon battle simulator inspired by Pokémon
Showdown. React + Vite + Tailwind on the front end, Node/Express + Socket.io on
the back end, with all Pokémon/move data fetched dynamically from
[PokeAPI](https://pokeapi.co/) — **nothing is hardcoded**.

## File structure

```
pokemon-battle-sim/
├── server/                     # Node + Express + Socket.io (source of truth)
│   ├── server.js               # HTTP + Socket.io entry point
│   ├── package.json
│   └── src/
│       ├── pokeapi.js          # cached PokeAPI fetch (species + moves)
│       ├── natures.js          # 25 natures + multiplier helper
│       ├── typechart.js        # full 18-type effectiveness chart
│       ├── statCalc.js         # official Lv100 stat formulas + EV validation
│       ├── damage.js           # damage formula, crit, STAB, turn order, charge moves
│       ├── battleEngine.js     # turn resolution → ordered EVENT STREAM
│       └── battleHandler.js    # matchmaking queue + socket orchestration
└── client/                     # React (Vite) + Tailwind + socket.io-client
    ├── index.html
    ├── vite.config.js / tailwind.config.js / postcss.config.js
    ├── package.json
    └── src/
        ├── main.jsx / App.jsx  # screen state machine: builder → queue → battle
        ├── socket.js           # shared socket.io-client instance
        ├── api/pokeapi.js      # front-end PokeAPI helper (team builder)
        ├── utils/              # stats.js, natures.js, typeColors.js (UI mirror)
        └── components/
            ├── TeamBuilder.jsx     # 6-slot team builder
            ├── PokemonEditor.jsx   # EV/IV/Nature/move editor + live stats
            ├── Matchmaking.jsx     # queue screen
            ├── BattleScreen.jsx    # battlefield + staggered animation engine
            ├── HealthBar.jsx       # smooth-draining HP/status bar
            ├── BattleLog.jsx       # scrolling battle log
            └── ActionMenu.jsx      # 2×2 move grid + switch sub-menu
```

## Running it

Two terminals.

```bash
# 1) Backend
cd server
npm install
npm run dev        # http://localhost:4000   (needs Node 18+ for global fetch)

# 2) Frontend
cd client
npm install
npm run dev        # http://localhost:5173
```

Open **two browser tabs** at http://localhost:5173, build a team in each, and
click **Find Match** in both to get paired.

### Environment overrides
- Server: `PORT` (default 4000), `CLIENT_ORIGIN` (default `http://localhost:5173`).
- Client: `VITE_SERVER_URL` (default `http://localhost:4000`).

## How a turn flows (the state flow)

The server is the **absolute source of truth**. Clients only send intent.

1. **Submit** — each client emits `submitAction` (`{type:'move', moveIndex}`)
   or `submitSwitch` (`{targetIndex}`). The server stores it in `battle.pending`.
2. **Resolve** — once both choices are in, `resolveTurn()` runs entirely on the
   server: switches first, then moves ordered by **priority → speed → random**,
   computing damage, type effectiveness, crits, faints, multi-turn charge moves,
   and win conditions. It returns an ordered **event stream**:

   ```js
   [
     { type:'move',   side:'<id>', moveName:'Thunderbolt', text:'Pikachu used Thunderbolt!' },
     { type:'damage', side:'<defenderId>', newHp:142, maxHp:211, effectiveness:2, crit:false,
       text:"It's super effective!" },
     { type:'faint',  side:'<defenderId>', text:'Charizard fainted!' },
     { type:'switch', side:'<id>', toIndex:1, pokemon:{...} },
     { type:'end',    winnerSide:'<id>', text:'Ash wins the battle!' },
   ]
   ```

3. **Broadcast** — `battleHandler` sends the **same** event array to both
   players plus a per-player authoritative snapshot (`stateAfter`). Each client
   interprets `event.side` relative to its own socket id.
4. **Animate (staggered)** — `BattleScreen.playTurn()` walks the events one at a
   time with `await sleep(...)`:
   - a `move` event logs the text and lunges the attacker sprite,
   - a `damage` event updates only the losing side's HP number (the `HealthBar`
     width CSS-transitions, so the bar **drains smoothly**), shakes that sprite,
     then waits the 1–2 s phase pause,
   - `faint` fades the sprite out, `switch` swaps it in.

   Because the slower Pokémon's `damage` event comes later in the array, Player
   B's HP bar drains, *then* the pause, *then* Player A's — exactly the
   sequencing the spec calls for. After playback the client snaps to
   `stateAfter` to stay in sync with the server.

## Multi-turn moves (Fly / Dig / Dive / Bounce)

Defined in `server/src/damage.js#CHARGE_MOVES`. On turn 1 the engine emits a
`charge` event, sets the Pokémon semi-invulnerable, and **locks** the choice
(`submitAction` forces the same move next turn). On turn 2 it releases and deals
damage automatically — no new selection required. Attacks against a
semi-invulnerable target automatically miss.

## Notes & scope

- Stat and damage math match the mainline Gen 6+ formulas (Lv100). The client
  mirrors the stat formula for an instant preview; the server recomputes
  authoritatively from PokeAPI base stats so client numbers are never trusted.
- Status-category moves are acknowledged in the log but their secondary effects
  (burns, stat stages, weather, etc.) are intentionally not simulated — the
  engine is structured (`effectiveSpeed`, status hooks) to make adding them
  straightforward.
- First battle build is a little slow because the server fetches each move from
  PokeAPI; responses are cached in-memory thereafter.
```
