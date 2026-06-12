// Express + Socket.io entry point.
import './src/env.js'; // must be first: loads server/.env from any cwd
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDb } from './src/db.js';
import { authRouter } from './src/auth.js';
import { teamsRouter } from './src/teams.js';
import { registerRealtime } from './src/realtime.js';

const PORT = process.env.PORT || 4000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

// Allowed cross-origin callers. Same-origin requests (the served client) and
// non-browser clients send no/own origin and are always allowed.
// RENDER_EXTERNAL_URL is injected automatically when hosted on Render.
const ALLOWED_ORIGINS = [
  process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  process.env.RENDER_EXTERNAL_URL,
].filter(Boolean);

function corsOrigin(origin, cb) {
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
  cb(null, false);
}

async function main() {
  await connectDb();

  const app = express();
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));
  app.use('/api/auth', authRouter);
  app.use('/api/teams', teamsRouter);

  // In production, serve the built React client from the same service —
  // one URL for everything, no CORS to configure.
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
    console.log(`📦  Serving client build from ${CLIENT_DIST}`);
  }

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  });
  registerRealtime(io);

  httpServer.listen(PORT, () => {
    console.log(`⚔️  Battle server listening on http://localhost:${PORT}`);
    console.log(`    allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
