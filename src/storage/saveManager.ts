import { ACHIEVEMENTS } from '../game/constants.ts';
import { getPreviousDateKey } from '../game/dailyChallenges.ts';
import { detectBrowserLanguage, isLanguageCode } from '../i18n/translations.ts';
import type {
  BallState,
  DailyChallengeCompletion,
  DailyChallengeDef,
  DailyChallengeProgress,
  GameMode,
  MatchRecord,
  PlayMode,
  PracticePotRecord,
  SaveData,
  ShotParams,
  TrickShotBallPose,
  TrickShotLayout,
} from '../game/types.ts';

const STORAGE_KEY = 'nexorum_billiards_save_v1';
export const CURRENT_SAVE_VERSION = 1;

function generatePlayerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `player_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultSaveData(): SaveData {
  return {
    version: CURRENT_SAVE_VERSION,
    playerId: generatePlayerId(),
    nickname: 'Cueist',
    avatarColor: '#10B981',
    xp: 0,
    wins: 0,
    losses: 0,
    selectedCue: 'maple_classic',
    selectedTable: 'emerald',
    selectedEnvironment: 'classic_club',
    settings: {
      masterVolume: 0.85,
      sfxVolume: 0.9,
      ambientVolume: 0.45,
      roomAmbiance: 0.5,
      muted: false,
      graphicsQuality: 'auto',
      aimAssist: 'full',
      ghostBallGuide: true,
      cameraSensitivity: 1.0,
      surfaceStyle: 'tournament',
      language: detectBrowserLanguage(),
    },
    practiceStats: {
      shotsTaken: 0,
      ballsPocketed: 0,
      currentStreak: 0,
      bestStreak: 0,
      sessionsCompleted: 0,
      potHistory: [],
    },
    matchHistory: [],
    achievements: {},
    trickShotLayouts: [],
    dailyChallenge: {
      completedDates: {},
      attemptsByDate: {},
      currentStreak: 0,
      bestStreak: 0,
      totalCompleted: 0,
      totalXpEarned: 0,
    },
  };
}

function sanitizeTrickShotLayout(raw: unknown): TrickShotLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<TrickShotLayout>;
  if (typeof obj.name !== 'string' || !obj.name.trim()) return null;
  if (!Array.isArray(obj.balls)) return null;

  const seenIds = new Set<number>();
  const balls: TrickShotBallPose[] = [];
  for (const item of obj.balls) {
    if (!item || typeof item !== 'object') continue;
    const id = Number((item as TrickShotBallPose).id);
    const x = Number((item as TrickShotBallPose).x);
    const z = Number((item as TrickShotBallPose).z);
    if (!Number.isInteger(id) || id < 0 || id > 15 || seenIds.has(id)) continue;
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    seenIds.add(id);
    balls.push({
      id,
      x: Number(x.toFixed(4)),
      z: Number(z.toFixed(4)),
    });
  }
  if (!seenIds.has(0)) {
    balls.unshift({ id: 0, x: -0.635, z: 0 });
  }

  let suggestedShot: ShotParams | undefined;
  if (obj.suggestedShot && typeof obj.suggestedShot === 'object') {
    const s = obj.suggestedShot;
    if (
      Number.isFinite(s.angle) &&
      Number.isFinite(s.power) &&
      Number.isFinite(s.spinX) &&
      Number.isFinite(s.spinY)
    ) {
      suggestedShot = {
        angle: Number(s.angle),
        power: Math.max(0.05, Math.min(1, Number(s.power))),
        spinX: Math.max(-1, Math.min(1, Number(s.spinX))),
        spinY: Math.max(-1, Math.min(1, Number(s.spinY))),
      };
    }
  }

  return {
    id:
      typeof obj.id === 'string' && obj.id.trim()
        ? obj.id.trim()
        : `ts_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: obj.name.trim().slice(0, 40),
    description:
      typeof obj.description === 'string' && obj.description.trim()
        ? obj.description.trim().slice(0, 120)
        : undefined,
    balls,
    suggestedShot,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
  };
}

function migrateSaveData(raw: unknown): SaveData {
  const defaults = createDefaultSaveData();
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Partial<SaveData>;

  const rawLayouts = Array.isArray(obj.trickShotLayouts) ? obj.trickShotLayouts : [];
  const trickShotLayouts = rawLayouts
    .map(sanitizeTrickShotLayout)
    .filter((l): l is TrickShotLayout => l !== null)
    .slice(0, 40);

  const rawDaily = (obj.dailyChallenge ?? {}) as Partial<DailyChallengeProgress>;
  const completedDates: Record<string, DailyChallengeCompletion> = {};
  if (rawDaily.completedDates && typeof rawDaily.completedDates === 'object') {
    for (const [k, v] of Object.entries(rawDaily.completedDates)) {
      if (v && typeof v === 'object' && typeof v.challengeId === 'string') {
        completedDates[k] = {
          dateKey: typeof v.dateKey === 'string' ? v.dateKey : k,
          challengeId: v.challengeId,
          title: typeof v.title === 'string' ? v.title : 'Daily Challenge',
          shotsUsed: Number.isFinite(v.shotsUsed) ? Math.max(1, Number(v.shotsUsed)) : 1,
          attempts: Number.isFinite(v.attempts) ? Math.max(1, Number(v.attempts)) : 1,
          xpEarned: Number.isFinite(v.xpEarned) ? Math.max(0, Number(v.xpEarned)) : 0,
          completedAt: typeof v.completedAt === 'string' ? v.completedAt : new Date().toISOString(),
        };
      }
    }
  }
  const attemptsByDate: Record<string, number> = {};
  if (rawDaily.attemptsByDate && typeof rawDaily.attemptsByDate === 'object') {
    for (const [k, v] of Object.entries(rawDaily.attemptsByDate)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        attemptsByDate[k] = Math.floor(v);
      }
    }
  }

  const rawPotHistory = Array.isArray(obj.practiceStats?.potHistory)
    ? obj.practiceStats.potHistory
    : [];
  const potHistory: PracticePotRecord[] = rawPotHistory
    .filter(
      (p): p is PracticePotRecord =>
        Boolean(p) &&
        typeof p === 'object' &&
        Number.isFinite(p.ballId) &&
        Number.isFinite(p.pocketIndex) &&
        Number.isFinite(p.originX) &&
        Number.isFinite(p.originZ) &&
        Number.isFinite(p.pocketX) &&
        Number.isFinite(p.pocketZ),
    )
    .slice(0, 250);

  return {
    version: CURRENT_SAVE_VERSION,
    playerId: typeof obj.playerId === 'string' && obj.playerId ? obj.playerId : defaults.playerId,
    nickname: typeof obj.nickname === 'string' && obj.nickname.trim() ? obj.nickname.trim().slice(0, 20) : defaults.nickname,
    avatarColor: typeof obj.avatarColor === 'string' ? obj.avatarColor : defaults.avatarColor,
    xp: typeof obj.xp === 'number' && Number.isFinite(obj.xp) ? Math.max(0, obj.xp) : 0,
    wins: typeof obj.wins === 'number' && Number.isFinite(obj.wins) ? Math.max(0, obj.wins) : 0,
    losses: typeof obj.losses === 'number' && Number.isFinite(obj.losses) ? Math.max(0, obj.losses) : 0,
    selectedCue: obj.selectedCue ?? defaults.selectedCue,
    selectedTable: obj.selectedTable ?? defaults.selectedTable,
    selectedEnvironment: obj.selectedEnvironment ?? defaults.selectedEnvironment,
    settings: {
      ...defaults.settings,
      ...(obj.settings ?? {}),
      roomAmbiance:
        typeof obj.settings?.roomAmbiance === 'number' &&
        Number.isFinite(obj.settings.roomAmbiance)
          ? Math.max(0, Math.min(1, obj.settings.roomAmbiance))
          : defaults.settings.roomAmbiance,
      ghostBallGuide:
        typeof obj.settings?.ghostBallGuide === 'boolean'
          ? obj.settings.ghostBallGuide
          : defaults.settings.ghostBallGuide,
      surfaceStyle:
        obj.settings?.surfaceStyle === 'tournament' ||
        obj.settings?.surfaceStyle === 'club' ||
        obj.settings?.surfaceStyle === 'vintage'
          ? obj.settings.surfaceStyle
          : defaults.settings.surfaceStyle,
      language: isLanguageCode(obj.settings?.language)
        ? obj.settings.language
        : defaults.settings.language,
    },
    practiceStats: {
      ...defaults.practiceStats,
      ...(obj.practiceStats ?? {}),
      potHistory,
    },
    matchHistory: Array.isArray(obj.matchHistory) ? obj.matchHistory.slice(0, 50) : [],
    achievements: obj.achievements && typeof obj.achievements === 'object' ? { ...obj.achievements } : {},
    trickShotLayouts,
    dailyChallenge: {
      completedDates,
      attemptsByDate,
      currentStreak:
        typeof rawDaily.currentStreak === 'number' && Number.isFinite(rawDaily.currentStreak)
          ? Math.max(0, Math.floor(rawDaily.currentStreak))
          : 0,
      bestStreak:
        typeof rawDaily.bestStreak === 'number' && Number.isFinite(rawDaily.bestStreak)
          ? Math.max(0, Math.floor(rawDaily.bestStreak))
          : 0,
      totalCompleted:
        typeof rawDaily.totalCompleted === 'number' && Number.isFinite(rawDaily.totalCompleted)
          ? Math.max(0, Math.floor(rawDaily.totalCompleted))
          : Object.keys(completedDates).length,
      totalXpEarned:
        typeof rawDaily.totalXpEarned === 'number' && Number.isFinite(rawDaily.totalXpEarned)
          ? Math.max(0, Math.floor(rawDaily.totalXpEarned))
          : 0,
    },
  };
}

export function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = createDefaultSaveData();
      saveSaveData(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw);
    const migrated = migrateSaveData(parsed);
    if ((parsed as Partial<SaveData>)?.version !== CURRENT_SAVE_VERSION) {
      saveSaveData(migrated);
    }
    return migrated;
  } catch {
    return createDefaultSaveData();
  }
}

export function saveSaveData(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function resetSaveData(): SaveData {
  const fresh = createDefaultSaveData();
  saveSaveData(fresh);
  return fresh;
}

export function exportSaveJson(data: SaveData): string {
  return JSON.stringify(data, null, 2);
}

export function importSaveJson(jsonText: string): { ok: true; data: SaveData } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.nickname !== 'string') {
      return { ok: false, error: 'Invalid NEXORUM BILLIARDS 3D save file format.' };
    }
    const migrated = migrateSaveData(parsed);
    saveSaveData(migrated);
    return { ok: true, data: migrated };
  } catch {
    return { ok: false, error: 'Could not parse JSON save file.' };
  }
}

export function getLevelFromXp(xp: number): { level: number; currentLevelXp: number; nextLevelXp: number } {
  let level = 1;
  let threshold = 250;
  let accumulated = 0;
  while (xp >= accumulated + threshold) {
    accumulated += threshold;
    level += 1;
    threshold = Math.round(threshold * 1.25);
  }
  return {
    level,
    currentLevelXp: xp - accumulated,
    nextLevelXp: threshold,
  };
}

export function unlockAchievement(data: SaveData, achievementId: string): { data: SaveData; unlockedTitle: string | null } {
  if (data.achievements[achievementId]) {
    return { data, unlockedTitle: null };
  }
  const def = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!def) return { data, unlockedTitle: null };

  const updated: SaveData = {
    ...data,
    xp: data.xp + def.xpReward,
    achievements: {
      ...data.achievements,
      [achievementId]: new Date().toISOString(),
    },
  };
  saveSaveData(updated);
  return { data: updated, unlockedTitle: def.title };
}

export function recordCompletedMatch(
  data: SaveData,
  opts: {
    gameMode: GameMode;
    playMode: PlayMode;
    opponentName: string;
    won: boolean;
    reason: string;
    shotsTaken: number;
    ballsPocketed: number;
    aiDifficulty?: string;
  },
): { data: SaveData; newlyUnlocked: string[] } {
  const record: MatchRecord = {
    id: `m_${Date.now().toString(36)}`,
    date: new Date().toISOString(),
    gameMode: opts.gameMode,
    playMode: opts.playMode,
    opponentName: opts.opponentName,
    won: opts.won,
    reason: opts.reason,
    shotsTaken: opts.shotsTaken,
    ballsPocketed: opts.ballsPocketed,
  };

  const xpEarned = opts.won ? 120 + opts.ballsPocketed * 8 : 40 + opts.ballsPocketed * 5;
  let next: SaveData = {
    ...data,
    xp: data.xp + xpEarned,
    wins: data.wins + (opts.won ? 1 : 0),
    losses: data.losses + (opts.won ? 0 : 1),
    matchHistory: [record, ...data.matchHistory].slice(0, 50),
  };

  const newlyUnlocked: string[] = [];
  const tryUnlock = (id: string) => {
    const res = unlockAchievement(next, id);
    next = res.data;
    if (res.unlockedTitle) newlyUnlocked.push(res.unlockedTitle);
  };

  if (opts.won) {
    tryUnlock('first_win');
    if (opts.gameMode === '9-ball') tryUnlock('nine_ball_gold');
    if (opts.playMode === 'online') tryUnlock('online_victor');
    if (opts.playMode === 'ai' && (opts.aiDifficulty === 'hard' || opts.aiDifficulty === 'professional')) {
      tryUnlock('pro_slayer');
    }
  }
  if (next.wins + next.losses >= 10) {
    tryUnlock('veteran_10');
  }

  saveSaveData(next);
  return { data: next, newlyUnlocked };
}

export function saveTrickShotLayout(
  data: SaveData,
  opts: {
    name: string;
    description?: string;
    balls: BallState[];
    suggestedShot?: ShotParams;
  },
): { data: SaveData; layout: TrickShotLayout } {
  const activeBalls: TrickShotBallPose[] = opts.balls
    .filter((b) => !b.pocketed)
    .map((b) => ({
      id: b.id,
      x: Number(b.x.toFixed(4)),
      z: Number(b.z.toFixed(4)),
    }));

  const layout: TrickShotLayout = {
    id: `ts_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: opts.name.trim().slice(0, 40) || 'Custom Trick Shot',
    description: opts.description?.trim() ? opts.description.trim().slice(0, 120) : undefined,
    balls: activeBalls,
    suggestedShot: opts.suggestedShot ? { ...opts.suggestedShot } : undefined,
    createdAt: new Date().toISOString(),
  };

  const next: SaveData = {
    ...data,
    trickShotLayouts: [layout, ...data.trickShotLayouts].slice(0, 40),
  };
  saveSaveData(next);
  return { data: next, layout };
}

export function deleteTrickShotLayout(data: SaveData, layoutId: string): SaveData {
  const next: SaveData = {
    ...data,
    trickShotLayouts: data.trickShotLayouts.filter((l) => l.id !== layoutId),
  };
  saveSaveData(next);
  return next;
}

export function exportTrickShotJson(layout: TrickShotLayout): string {
  const payload = {
    format: 'nexorum_trick_shot_v1',
    name: layout.name,
    description: layout.description,
    balls: layout.balls,
    suggestedShot: layout.suggestedShot,
  };
  return JSON.stringify(payload);
}

export function importTrickShotJson(
  jsonText: string,
): { ok: true; layout: TrickShotLayout } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(jsonText.trim());
    const sanitized = sanitizeTrickShotLayout({
      ...parsed,
      id: `ts_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    });
    if (!sanitized || sanitized.balls.length === 0) {
      return { ok: false, error: 'Invalid trick shot layout JSON or missing ball positions.' };
    }
    return { ok: true, layout: sanitized };
  } catch {
    return { ok: false, error: 'Could not parse trick shot layout JSON.' };
  }
}

export function getEffectiveDailyStreak(
  progress: DailyChallengeProgress,
  todayKey: string,
): number {
  const prevKey = getPreviousDateKey(todayKey);
  if (progress.completedDates[todayKey] || progress.completedDates[prevKey]) {
    return progress.currentStreak;
  }
  return 0;
}

export function recordDailyChallengeAttempt(data: SaveData, dateKey: string): SaveData {
  const prevAttempts = data.dailyChallenge.attemptsByDate[dateKey] ?? 0;
  const next: SaveData = {
    ...data,
    dailyChallenge: {
      ...data.dailyChallenge,
      attemptsByDate: {
        ...data.dailyChallenge.attemptsByDate,
        [dateKey]: prevAttempts + 1,
      },
    },
  };
  saveSaveData(next);
  return next;
}

export function recordDailyChallengeSuccess(
  data: SaveData,
  opts: {
    dateKey: string;
    challenge: DailyChallengeDef;
    shotsUsed: number;
  },
): {
  data: SaveData;
  xpEarned: number;
  streakBonus: number;
  alreadyCompletedToday: boolean;
  newlyUnlocked: string[];
} {
  const existing = data.dailyChallenge.completedDates[opts.dateKey];
  if (existing) {
    // Allow replaying for fun or improving shot count without double-granting daily XP
    if (opts.shotsUsed < existing.shotsUsed) {
      const updatedCompletion: DailyChallengeCompletion = {
        ...existing,
        shotsUsed: opts.shotsUsed,
      };
      const updated: SaveData = {
        ...data,
        dailyChallenge: {
          ...data.dailyChallenge,
          completedDates: {
            ...data.dailyChallenge.completedDates,
            [opts.dateKey]: updatedCompletion,
          },
        },
      };
      saveSaveData(updated);
      return {
        data: updated,
        xpEarned: 0,
        streakBonus: 0,
        alreadyCompletedToday: true,
        newlyUnlocked: [],
      };
    }
    return {
      data,
      xpEarned: 0,
      streakBonus: 0,
      alreadyCompletedToday: true,
      newlyUnlocked: [],
    };
  }

  const prevKey = getPreviousDateKey(opts.dateKey);
  const hadYesterday = Boolean(data.dailyChallenge.completedDates[prevKey]);
  const nextStreak = hadYesterday ? Math.max(1, data.dailyChallenge.currentStreak + 1) : 1;
  const bestStreak = Math.max(data.dailyChallenge.bestStreak, nextStreak);
  const streakBonus = Math.min(200, (nextStreak - 1) * 50);
  const xpEarned = opts.challenge.xpReward + streakBonus;
  const attempts = Math.max(1, data.dailyChallenge.attemptsByDate[opts.dateKey] ?? 1);

  const completion: DailyChallengeCompletion = {
    dateKey: opts.dateKey,
    challengeId: opts.challenge.id,
    title: opts.challenge.title,
    shotsUsed: opts.shotsUsed,
    attempts,
    xpEarned,
    completedAt: new Date().toISOString(),
  };

  let next: SaveData = {
    ...data,
    xp: data.xp + xpEarned,
    dailyChallenge: {
      ...data.dailyChallenge,
      completedDates: {
        ...data.dailyChallenge.completedDates,
        [opts.dateKey]: completion,
      },
      currentStreak: nextStreak,
      bestStreak,
      totalCompleted: data.dailyChallenge.totalCompleted + 1,
      totalXpEarned: data.dailyChallenge.totalXpEarned + xpEarned,
    },
  };

  const newlyUnlocked: string[] = [];
  const tryUnlock = (id: string) => {
    const res = unlockAchievement(next, id);
    next = res.data;
    if (res.unlockedTitle) newlyUnlocked.push(res.unlockedTitle);
  };

  tryUnlock('daily_victor');
  if (nextStreak >= 3) {
    tryUnlock('daily_streak_3');
  }

  saveSaveData(next);
  return {
    data: next,
    xpEarned,
    streakBonus,
    alreadyCompletedToday: false,
    newlyUnlocked,
  };
}

export function recordPracticeSessionCompleted(data: SaveData): SaveData {
  const next: SaveData = {
    ...data,
    practiceStats: {
      ...data.practiceStats,
      sessionsCompleted: data.practiceStats.sessionsCompleted + 1,
    },
  };
  saveSaveData(next);
  return next;
}

