// Express + Socket.io entry point.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDb } from './src/db.js';
import { authRouter } from './src/auth.js';
import { teamsRouter } from './src/teams.js';
import { registerRealtime } from './src/realtime.js';

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

async function main() {
  await connectDb();

  const app = express();
  app.use(cors({ origin: CLIENT_ORIGIN }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));
  app.use('/api/auth', authRouter);
  app.use('/api/teams', teamsRouter);

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
  });
  registerRealtime(io);

  httpServer.listen(PORT, () => {
    console.log(`⚔️  Battle server listening on http://localhost:${PORT}`);
    console.log(`    accepting client origin ${CLIENT_ORIGIN}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
