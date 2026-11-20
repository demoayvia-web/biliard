import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import type { GameMode, RankingEntry } from '../../src/game/types.ts';

interface MemoryRanking {
  playerId: string;
  nickname: string;
  elo: number;
  wins: number;
  losses: number;
}

class DatabaseService {
  private pool: Pool | null = null;
  private memoryRankings: Map<string, MemoryRanking> = new Map();
  private memoryFriends: Map<string, Set<string>> = new Map();
  public isPostgresConnected = false;

  public async init(): Promise<void> {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      // Seed realistic initial club leaderboard entries only if needed? No — keep real clean empty or live players only!
      console.log('[DB] DATABASE_URL not set; running with in-memory online session store.');
      return;
    }

    try {
      this.pool = new Pool({
        connectionString: dbUrl,
        ssl: dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
      });
      await this.pool.query('SELECT 1');

      const migrationPath = path.resolve(process.cwd(), 'database/migrations/001_init.sql');
      if (fs.existsSync(migrationPath)) {
        const sql = fs.readFileSync(migrationPath, 'utf8');
        await this.pool.query(sql);
      }

      this.isPostgresConnected = true;
      console.log('[DB] Connected to Railway PostgreSQL & verified migrations.');
    } catch (err) {
      console.warn('[DB] PostgreSQL connection failed, falling back to in-memory store:', (err as Error).message);
      this.pool = null;
      this.isPostgresConnected = false;
    }
  }

  private isValidUuid(val: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
  }

  public async upsertPlayer(playerId: string, nickname: string): Promise<number> {
    const safeName = nickname.trim().slice(0, 20) || 'Cueist';

    if (this.pool && this.isPostgresConnected && this.isValidUuid(playerId)) {
      await this.pool.query(
        `INSERT INTO users (id, nickname, last_seen_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, last_seen_at = NOW()`,
        [playerId, safeName],
      );
      await this.pool.query(
        `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [playerId],
      );
      const res = await this.pool.query(
        `INSERT INTO rankings (user_id, elo, wins, losses, peak_elo)
         VALUES ($1, 1200, 0, 0, 1200)
         ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
         RETURNING elo`,
        [playerId],
      );
      return Number(res.rows[0]?.elo ?? 1200);
    }

    const existing = this.memoryRankings.get(playerId);
    if (existing) {
      existing.nickname = safeName;
      return existing.elo;
    }
    this.memoryRankings.set(playerId, {
      playerId,
      nickname: safeName,
      elo: 1200,
      wins: 0,
      losses: 0,
    });
    return 1200;
  }

  public async recordMatchResult(opts: {
    matchId: string;
    roomCode: string;
    gameMode: GameMode;
    player1Id: string;
    player2Id: string;
    winnerId: string;
    winReason: string;
    totalShots: number;
  }): Promise<void> {
    const loserId = opts.winnerId === opts.player1Id ? opts.player2Id : opts.player1Id;
    const kFactor = 28;

    // Update memory rankings
    const wMem = this.memoryRankings.get(opts.winnerId);
    const lMem = this.memoryRankings.get(loserId);
    const wElo = wMem?.elo ?? 1200;
    const lElo = lMem?.elo ?? 1200;
    const expectedW = 1 / (1 + Math.pow(10, (lElo - wElo) / 400));
    const delta = Math.max(8, Math.round(kFactor * (1 - expectedW)));

    if (wMem) {
      wMem.elo += delta;
      wMem.wins += 1;
    }
    if (lMem) {
      lMem.elo = Math.max(600, lMem.elo - delta);
      lMem.losses += 1;
    }

    if (
      this.pool &&
      this.isPostgresConnected &&
      this.isValidUuid(opts.player1Id) &&
      this.isValidUuid(opts.player2Id)
    ) {
      try {
        await this.pool.query(
          `INSERT INTO matches (id, room_code, game_mode, player1_id, player2_id, winner_id, win_reason, total_shots)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            opts.matchId,
            opts.roomCode,
            opts.gameMode,
            opts.player1Id,
            opts.player2Id,
            opts.winnerId,
            opts.winReason,
            opts.totalShots,
          ],
        );
        await this.pool.query(
          `UPDATE rankings SET elo = elo + $2, wins = wins + 1, peak_elo = GREATEST(peak_elo, elo + $2), updated_at = NOW()
           WHERE user_id = $1`,
          [opts.winnerId, delta],
        );
        await this.pool.query(
          `UPDATE rankings SET elo = GREATEST(600, elo - $2), losses = losses + 1, updated_at = NOW()
           WHERE user_id = $1`,
          [loserId, delta],
        );
      } catch (err) {
        console.warn('[DB] Failed to persist match result:', (err as Error).message);
      }
    }
  }

  public async getTopRankings(limit = 20): Promise<RankingEntry[]> {
    if (this.pool && this.isPostgresConnected) {
      const res = await this.pool.query(
        `SELECT u.nickname, r.elo, r.wins, r.losses
         FROM rankings r
         JOIN users u ON u.id = r.user_id
         ORDER BY r.elo DESC
         LIMIT $1`,
        [limit],
      );
      return res.rows.map((row) => {
        const wins = Number(row.wins);
        const losses = Number(row.losses);
        const total = wins + losses;
        return {
          nickname: String(row.nickname),
          elo: Number(row.elo),
          wins,
          losses,
          winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
        };
      });
    }

    return Array.from(this.memoryRankings.values())
      .sort((a, b) => b.elo - a.elo)
      .slice(0, limit)
      .map((r) => {
        const total = r.wins + r.losses;
        return {
          nickname: r.nickname,
          elo: r.elo,
          wins: r.wins,
          losses: r.losses,
          winRate: total > 0 ? Math.round((r.wins / total) * 100) : 0,
        };
      });
  }

  public addFriend(playerId: string, friendId: string): void {
    if (!this.memoryFriends.has(playerId)) this.memoryFriends.set(playerId, new Set());
    this.memoryFriends.get(playerId)!.add(friendId);
  }

  public getFriendIds(playerId: string): string[] {
    return Array.from(this.memoryFriends.get(playerId) ?? []);
  }
}

export const dbService = new DatabaseService();
