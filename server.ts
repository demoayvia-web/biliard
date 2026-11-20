import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { dbService } from './server/database/pgClient.ts';
import { ServerSimulation } from './server/physics/ServerSimulation.ts';
import { RoomManager } from './server/rooms/RoomManager.ts';

dotenv.config();

async function startServer() {
  await ServerSimulation.init();
  await dbService.init();

  const app = express();
  app.use(express.json());

  // CORS for Cloudflare Pages frontend -> Railway backend
  app.use((req, res, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN || '*';
    res.header('Access-Control-Allow-Origin', allowedOrigin);
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  const roomManager = new RoomManager(io);

  // API Routes
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'nexorum-billiards-3d',
      postgres: dbService.isPostgresConnected,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/rankings', async (_req, res) => {
    const rankings = await dbService.getTopRankings(25);
    res.json({ rankings });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: roomManager.getPublicRooms() });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[NEXORUM] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[NEXORUM] Fatal startup error:', err);
  process.exit(1);
});
