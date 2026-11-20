# NEXORUM BILLIARDS 3D

A production-quality 3D billiards simulator built with **React**, **TypeScript**, **Three.js**, **Rapier3D Physics**, **Express**, **Socket.IO**, and optional **Railway PostgreSQL**.

## Features

- **3D Rendering & Environments**: PBR billiard balls with clearcoat & spin-tracking dots, procedural worsted wool cloth weave, turned hardwood table legs, beveled cushions, inlaid diamond sights, and 4 selectable venues (*Classic Billiard Club*, *Luxury Billiard Lounge*, *Championship Arena*, *Futuristic Neon Room*).
- **Rapier3D Fixed-Timestep Physics**: 120 Hz fixed physics substeps (`FIXED_DT = 1/120`), continuous collision detection (CCD), sliding/rolling cloth friction, topspin/backspin (draw), sidespin (English cushion throw), and pocket capture detection.
- **Game Modes & Official Rules**:
  - **8-Ball Pool** (open table break, group assignment, fouls, ball-in-hand, 8-ball win/loss rules)
  - **9-Ball Pool** (lowest-ball-first rule, 3-foul rule, legal 9-ball carom/combo wins)
  - **Practice Mode** (4 rack drills, free ball-in-hand placement, streak tracking)
  - **VS AI** (5 difficulty tiers: *Beginner*, *Easy*, *Medium*, *Hard*, *Professional* with ghost-ball pot evaluation, obstacle clearance, combos, and safeties)
  - **Local Two Players** (pass-and-play)
  - **Online Multiplayer** (public matchmaking, private invite codes, live player list, reconnection, and authoritative server-side Rapier simulation)
- **LocalStorage Persistence**: Versioned auto-saving (`nexorum_billiards_save_v1`), career XP/levels, achievements, practice stats, match history, JSON Export/Import, and Reset.
- **Procedural Web Audio API**: Velocity-scaled ball clacks, cue strikes, cushion thuds, pocket drops, UI feedback, and toggleable lounge ambience with independent volume sliders.

---

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Local play (VS AI, Local 2P, Practice) and local Online Multiplayer rooms work immediately without needing any external database.

---

## Deployment Instructions

### 1. Railway (Backend + PostgreSQL)

1. Create a new project on **Railway** and connect this repository.
2. Add a **PostgreSQL** service in the same Railway project. Railway automatically injects `DATABASE_URL`.
3. Set environment variables on the Node service:
   - `NODE_ENV=production`
   - `CORS_ORIGIN=https://your-frontend-domain.pages.dev` (or `*` during testing)
4. Railway reads `railway.json`, runs `npm install && npm run build`, and starts `npm run start` (`tsx server.ts`).
5. On boot, `server/database/pgClient.ts` automatically executes `database/migrations/001_init.sql` to create `users`, `profiles`, `rankings`, `matches`, `friends`, and `achievements` tables.

### 2. Cloudflare Pages (Frontend)

> **Note**: Cloudflare Pages hosts only the static Vite frontend (`dist/`). Do not configure Cloudflare D1 or D2.

1. Connect your repository to **Cloudflare Pages**.
2. Configure build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Add Environment Variable in Cloudflare Pages:
   - `VITE_MULTIPLAYER_URL=https://your-railway-service.up.railway.app`
4. Deploy! If `VITE_MULTIPLAYER_URL` is omitted or offline, all local game modes (VS AI, Local 2P, Practice) continue working seamlessly via LocalStorage.
