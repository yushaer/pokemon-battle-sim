// Express + Socket.io entry point.
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { registerBattleHandlers } from './src/battleHandler.js';

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

registerBattleHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`⚔️  Battle server listening on http://localhost:${PORT}`);
  console.log(`    accepting client origin ${CLIENT_ORIGIN}`);
});
