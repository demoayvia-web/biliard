export type GameMode = '8-ball' | '9-ball' | 'practice' | 'trick_shot' | 'daily_challenge';
export type PlayMode = 'ai' | 'local' | 'online' | 'practice' | 'trick_shot' | 'daily_challenge';
export type AIDifficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'professional';
export type GraphicsQuality = 'auto' | 'low' | 'medium' | 'high' | 'ultra';
export type EnvironmentId = 'classic_club' | 'luxury_lounge' | 'championship_arena' | 'neon_room';
export type TableClothId = 'emerald' | 'tournament_blue' | 'burgundy' | 'obsidian';
export type TableSurfaceStyleId = 'tournament' | 'club' | 'vintage';
export type CueStyleId = 'maple_classic' | 'ebony_pro' | 'emerald_carbon' | 'gold_imperial';
export type CameraPreset = 'aim' | 'follow' | 'overhead' | 'orbit' | 'low';
export type PlayerGroup = 'solids' | 'stripes' | null;

export interface SurfacePhysicsMultipliers {
  clothFrictionMultiplier: number;
  cushionElasticityMultiplier: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BallState {
  id: number; // 0 = cue ball, 1..15 = object balls
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  pocketed: boolean;
}

export interface ShotParams {
  angle: number; // Radians in XZ plane (0 = +X, PI/2 = +Z)
  power: number; // Normalized 0.05..1.0
  spinX: number; // Sidespin (-1 left .. +1 right)
  spinY: number; // Top/Backspin (-1 draw/backspin .. +1 follow/topspin)
  cueElevation?: number; // Radians (default ~0.04)
}

export interface PhysicsEvent {
  type: 'ball-ball' | 'cushion' | 'pocket';
  time: number;
  ballA: number;
  ballB?: number;
  pocketIndex?: number;
  speed: number;
  x: number;
  z: number;
}

export interface ShotOutcomeSummary {
  firstContactBallId: number | null;
  pocketedBallIds: number[];
  cueBallPocketed: boolean;
  railContactsAfterFirstHit: number;
  totalRailContacts: number;
  events: PhysicsEvent[];
}

export interface PlayerInfo {
  id: string;
  name: string;
  isAI: boolean;
  aiDifficulty?: AIDifficulty;
  group: PlayerGroup;
  foulsInRow: number;
  ballsPocketed: number;
}

export type DailyChallengeCategory =
  | 'Trick Shot'
  | 'Precision Cut'
  | 'Bank & Spin'
  | 'Tactical Runout';

export type DailyChallengeDifficulty = 'Hard' | 'Expert' | 'Master';

export interface DailyChallengeDef {
  id: string;
  title: string;
  category: DailyChallengeCategory;
  difficulty: DailyChallengeDifficulty;
  description: string;
  objectiveLabel: string;
  hint: string;
  maxShots: number;
  xpReward: number;
  balls: TrickShotBallPose[];
  initialPower?: number;
  initialSpin?: { x: number; y: number };
  requireRailBeforePot?: boolean;
}

export interface DailyChallengeRunState {
  dateKey: string;
  challengeId: string;
  title: string;
  category: DailyChallengeCategory;
  difficulty: DailyChallengeDifficulty;
  objectiveLabel: string;
  hint: string;
  maxShots: number;
  shotsTaken: number;
  xpReward: number;
  requireRailBeforePot?: boolean;
  completed: boolean;
  failed: boolean;
}

export interface DailyChallengeCompletion {
  dateKey: string;
  challengeId: string;
  title: string;
  shotsUsed: number;
  attempts: number;
  xpEarned: number;
  completedAt: string;
}

export interface DailyChallengeProgress {
  completedDates: Record<string, DailyChallengeCompletion>;
  attemptsByDate: Record<string, number>;
  currentStreak: number;
  bestStreak: number;
  totalCompleted: number;
  totalXpEarned: number;
}

export interface MatchState {
  gameMode: GameMode;
  playMode: PlayMode;
  phase: 'aiming' | 'shooting' | 'ball_in_hand' | 'game_over';
  turnIndex: 0 | 1;
  players: [PlayerInfo, PlayerInfo];
  balls: BallState[];
  isBreakShot: boolean;
  openTable: boolean;
  shotNumber: number;
  lastFoul: string | null;
  statusMessage: string;
  winnerIndex: 0 | 1 | null;
  winReason: string | null;
  dailyChallenge?: DailyChallengeRunState;
}

export type LanguageCode = 'en' | 'ru' | 'es' | 'fr' | 'de' | 'pt' | 'tr';

export interface GameSettings {
  masterVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  roomAmbiance: number;
  muted: boolean;
  graphicsQuality: GraphicsQuality;
  aimAssist: 'full' | 'short' | 'off';
  ghostBallGuide: boolean;
  cameraSensitivity: number;
  surfaceStyle: TableSurfaceStyleId;
  language: LanguageCode;
}

export interface PracticePotRecord {
  ballId: number;
  pocketIndex: number;
  originX: number;
  originZ: number;
  pocketX: number;
  pocketZ: number;
  cueX: number;
  cueZ: number;
  distanceM: number;
  timestamp: string;
}

export interface PracticeStats {
  shotsTaken: number;
  ballsPocketed: number;
  currentStreak: number;
  bestStreak: number;
  sessionsCompleted: number;
  potHistory: PracticePotRecord[];
}

export interface MatchRecord {
  id: string;
  date: string;
  gameMode: GameMode;
  playMode: PlayMode;
  opponentName: string;
  won: boolean;
  reason: string;
  shotsTaken: number;
  ballsPocketed: number;
}

export interface AchievementProgress {
  id: string;
  unlockedAt: string | null;
}

export interface SaveData {
  version: number;
  playerId: string;
  nickname: string;
  avatarColor: string;
  xp: number;
  wins: number;
  losses: number;
  selectedCue: CueStyleId;
  selectedTable: TableClothId;
  selectedEnvironment: EnvironmentId;
  settings: GameSettings;
  practiceStats: PracticeStats;
  matchHistory: MatchRecord[];
  achievements: Record<string, string>; // id -> ISO timestamp
  trickShotLayouts: TrickShotLayout[];
  dailyChallenge: DailyChallengeProgress;
}

export interface TrickShotBallPose {
  id: number; // 0..15
  x: number;
  z: number;
}

export interface TrickShotLayout {
  id: string;
  name: string;
  description?: string;
  balls: TrickShotBallPose[];
  suggestedShot?: ShotParams;
  createdAt: string;
  isBuiltIn?: boolean;
}

export interface RoomInfo {
  roomId: string;
  code: string;
  gameMode: GameMode;
  hostName: string;
  guestName: string | null;
  status: 'waiting' | 'playing' | 'finished';
  isPrivate: boolean;
  createdAt: number;
}

export interface OnlinePlayerSummary {
  playerId: string;
  nickname: string;
  status: 'lobby' | 'in_match' | 'queuing';
  elo: number;
}

export interface RankingEntry {
  nickname: string;
  elo: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface ReplayBallPose {
  id: number;
  x: number;
  y: number;
  z: number;
  vx?: number;
  vz?: number;
  wy?: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  pocketed: boolean;
}

export interface ReplayFrame {
  time: number;
  balls: ReplayBallPose[];
}

export interface ShotReplayData {
  shotNumber: number;
  shooterName: string;
  shot: ShotParams;
  duration: number;
  frames: ReplayFrame[];
  events: PhysicsEvent[];
  summaryMessage: string;
}

