# Multiplayer Pokémon Battle Simulator

A real-time, server-authoritative Pokémon battle simulator inspired by Pokémon
Showdown. React + Vite + Tailwind on the front end, Node/Express + Socket.io on
the back end, **user accounts + saved teams on MongoDB Atlas**, and all
Pokémon/move data fetched dynamically from [PokeAPI](https://pokeapi.co/) —
**nothing is hardcoded**.

## Features

- **Accounts** — register/login (JWT + bcrypt); sessions persist via localStorage.
- **Saved teams** — build teams and store them on your account (MongoDB Atlas).
- **Lobby & presence** — see who's online and their status (available / in queue / in battle).
- **Direct challenges** — challenge a specific online user; they accept/decline.
- **Random matchmaking** — or just queue for the next available opponent.
- **Battle engine** — server-authoritative turns, type chart, crits/STAB, status
  conditions (par/brn/psn/tox/slp/frz), stat stages, multi-turn & volatile moves.

## File structure

```
pokemon-battle-sim/
├── server/                     # Node + Express + Socket.io (source of truth)
│   ├── server.js               # entry: connects Atlas, mounts REST + Socket.io
│   ├── .env                    # MONGO_URI / JWT_SECRET (git-ignored — create this)
│   └── src/
│       ├── db.js               # MongoDB Atlas (Mongoose) connection
│       ├── models/User.js      # user + embedded saved teams schema
│       ├── auth.js             # register/login routes, JWT issue/verify, middleware
│       ├── teams.js            # CRUD routes for saved teams (auth-protected)
│       ├── realtime.js         # Socket.io JWT auth + connection wiring
│       ├── presence.js         # online-user registry
│       ├── lobbyHandler.js     # presence, random queue, direct challenges
│       ├── battleManager.js    # live battle sessions + per-socket action handlers
│       ├── teamBuilder.js      # builds battle Pokemon from config (re-fetches PokeAPI)
│       ├── battleEngine.js     # turn resolution → ordered EVENT STREAM
│       ├── damage.js           # damage formula, stat stages, status helpers, turn order
│       ├── statCalc.js         # official Lv100 stat formulas + EV validation
│       ├── natures.js / typechart.js / pokeapi.js
└── client/                     # React (Vite) + Tailwind + socket.io-client
    └── src/
        ├── App.jsx             # auth gate + screen flow: login → lobby → builder/battle
        ├── socket.js           # token-authenticated socket (lazy connect)
        ├── api/auth.js         # REST client (auth + teams) + token storage
        ├── api/pokeapi.js      # front-end PokeAPI helper
        ├── utils/              # stats.js, natures.js, typeColors.js
        └── components/
            ├── Login.jsx           # register / login
            ├── Lobby.jsx           # teams, presence, challenges, matchmaking
            ├── TeamBuilder.jsx     # build + save/load teams to account
            ├── PokemonEditor.jsx   # EV/IV/Nature editor + live stats
            ├── MoveSelector.jsx    # searchable move picker w/ move info
            ├── BattleScreen.jsx    # battlefield + staggered animation engine
            ├── HealthBar.jsx / BattleLog.jsx / ActionMenu.jsx
```

## Running it

**Prerequisite:** a MongoDB Atlas cluster (free tier is fine). In Atlas, create a
DB user and allow your IP under Network Access, then grab the connection string.

```bash
# 1) Backend
cd server
npm install
# create server/.env with MONGO_URI + JWT_SECRET (see the env table below)
npm run dev                   # http://localhost:4000  (Node 18+)

# 2) Frontend
cd client
npm install
npm run dev                   # http://localhost:5173
```

On startup the server logs `🗄️  Connected to MongoDB (...)`. Then open
http://localhost:5173, **register an account**, build & save a team, and either
**queue for a random match** or **challenge an online user**. To try the
multiplayer flow locally, register a second account in another browser (or a
private window) and challenge across the two.

### Environment (`server/.env`)
| var | purpose | default |
|-----|---------|---------|
| `MONGO_URI` | MongoDB Atlas connection string (include a DB name, e.g. `/pokemon-battle-sim`) | — (required) |
| `JWT_SECRET` | secret for signing JWTs | dev fallback (set this!) |
| `PORT` | server port | `4000` |
| `CLIENT_ORIGIN` | allowed CORS origin | `http://localhost:5173` |

Client: `VITE_SERVER_URL` (default `http://localhost:4000`).

> ⚠️ `server/.env` holds real credentials and is git-ignored — **never commit it**.
> Keep real secrets out of `.env.example`.

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
