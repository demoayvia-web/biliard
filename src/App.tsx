import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BilliardsAI } from './ai/BilliardsAI.ts';
import { soundEngine } from './audio/SoundEngine.ts';
import { DailyChallengeModal } from './components/DailyChallengeModal.tsx';
import { GameHUD } from './components/GameHUD.tsx';
import { GameSetupModal } from './components/GameSetupModal.tsx';
import { OnlineLobbyModal } from './components/OnlineLobbyModal.tsx';
import {
  PauseVictoryModal,
  type DailyRewardSummary,
} from './components/PauseVictoryModal.tsx';
import {
  PracticeSummaryModal,
  type PracticeSessionSummaryData,
} from './components/PracticeSummaryModal.tsx';
import { ProfileModal } from './components/ProfileModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { TitleScreen } from './components/TitleScreen.tsx';
import { TrickShotModal } from './components/TrickShotModal.tsx';
import {
  AI_DIFFICULTIES,
  BALL_REST_Y,
  CUE_STYLES,
  FIXED_DT,
} from './game/constants.ts';
import { getDailyChallengeForDate } from './game/dailyChallenges.ts';
import {
  ballsFromTrickShotLayout,
  BUILTIN_TRICK_SHOTS,
  computePracticeIdealShot,
  createEightBallRack,
  createInitialMatchState,
  createPracticeRack,
  evaluateShotOutcome,
  findSafeTrickShotSpot,
  getLegalTargetBallIds,
  isValidBallInHandPosition,
  isValidTrickShotBallPosition,
  type PracticeDrillId,
} from './game/rules.ts';
import type {
  AIDifficulty,
  BallState,
  CameraPreset,
  CueStyleId,
  DailyChallengeDef,
  EnvironmentId,
  GameMode,
  GameSettings,
  MatchState,
  OnlinePlayerSummary,
  PhysicsEvent,
  PlayMode,
  PracticePotRecord,
  ReplayBallPose,
  ReplayFrame,
  RoomInfo,
  SaveData,
  ShotParams,
  ShotReplayData,
  TableClothId,
  TableSurfaceStyleId,
  TrickShotLayout,
} from './game/types.ts';
import {
  multiplayerClient,
  type OnlineInvitePayload,
  type OnlineMatchStartedPayload,
  type OnlineShotExecutedPayload,
} from './multiplayer/socketClient.ts';
import {
  ensureRapierInitialized,
  RapierPoolEngine,
} from './physics/RapierPoolEngine.ts';
import { BilliardsViewport } from './scenes/BilliardsViewport.tsx';
import { I18nProvider, interpolateMessage } from './i18n/I18nContext.tsx';
import { TRANSLATIONS } from './i18n/translations.ts';
import {
  deleteTrickShotLayout,
  loadSaveData,
  recordCompletedMatch,
  recordDailyChallengeAttempt,
  recordDailyChallengeSuccess,
  recordPracticeSessionCompleted,
  resetSaveData,
  saveSaveData,
  saveTrickShotLayout,
  unlockAchievement,
} from './storage/saveManager.ts';

type ActiveModal =
  | 'none'
  | 'daily_challenge'
  | 'practice_summary'
  | 'setup_ai'
  | 'setup_local'
  | 'setup_practice'
  | 'setup_trick_shot'
  | 'trick_shot_layouts'
  | 'online'
  | 'profile'
  | 'settings'
  | 'pause';

function captureBallPoses(balls: BallState[]): ReplayBallPose[] {
  return balls.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    z: b.z,
    vx: b.vx,
    vz: b.vz,
    wy: b.wy,
    qx: b.qx,
    qy: b.qy,
    qz: b.qz,
    qw: b.qw,
    pocketed: b.pocketed,
  }));
}

function sampleReplayBalls(replay: ShotReplayData, targetTime: number): BallState[] {
  const frames = replay.frames;
  if (frames.length === 0) return [];

  const toBallState = (p: ReplayBallPose): BallState => ({
    id: p.id,
    x: p.x,
    y: p.y,
    z: p.z,
    vx: p.vx ?? 0,
    vy: 0,
    vz: p.vz ?? 0,
    wx: 0,
    wy: p.wy ?? 0,
    wz: 0,
    qx: p.qx,
    qy: p.qy,
    qz: p.qz,
    qw: p.qw,
    pocketed: p.pocketed,
  });

  if (frames.length === 1 || targetTime <= frames[0].time) {
    return frames[0].balls.map(toBallState);
  }
  const lastFrame = frames[frames.length - 1];
  if (targetTime >= lastFrame.time) {
    return lastFrame.balls.map(toBallState);
  }

  // Binary search for frame interval [lo, lo + 1] containing targetTime
  let lo = 0;
  let hi = frames.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].time <= targetTime) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const fA = frames[lo];
  const fB = frames[lo + 1];
  const span = fB.time - fA.time;
  const alpha = span > 1e-6 ? Math.max(0, Math.min(1, (targetTime - fA.time) / span)) : 0;

  return fA.balls.map((pa, idx) => {
    const pb =
      fB.balls[idx]?.id === pa.id
        ? fB.balls[idx]
        : fB.balls.find((b) => b.id === pa.id) ?? pa;

    if (pa.pocketed || (pb.pocketed && alpha >= 0.5)) {
      return toBallState(pb.pocketed ? pb : pa);
    }

    // Shortest-arc normalized quaternion blend (nlerp is accurate over 1/60s frames)
    let bx = pb.qx;
    let by = pb.qy;
    let bz = pb.qz;
    let bw = pb.qw;
    const dot = pa.qx * bx + pa.qy * by + pa.qz * bz + pa.qw * bw;
    if (dot < 0) {
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    let qx = pa.qx + (bx - pa.qx) * alpha;
    let qy = pa.qy + (by - pa.qy) * alpha;
    let qz = pa.qz + (bz - pa.qz) * alpha;
    let qw = pa.qw + (bw - pa.qw) * alpha;
    const qLen = Math.hypot(qx, qy, qz, qw) || 1;
    qx /= qLen;
    qy /= qLen;
    qz /= qLen;
    qw /= qLen;

    const fallbackVx = span > 1e-6 ? (pb.x - pa.x) / span : 0;
    const fallbackVz = span > 1e-6 ? (pb.z - pa.z) / span : 0;
    const vx =
      pa.vx !== undefined && pb.vx !== undefined
        ? pa.vx + (pb.vx - pa.vx) * alpha
        : pa.vx ?? fallbackVx;
    const vz =
      pa.vz !== undefined && pb.vz !== undefined
        ? pa.vz + (pb.vz - pa.vz) * alpha
        : pa.vz ?? fallbackVz;
    const wy =
      pa.wy !== undefined && pb.wy !== undefined
        ? pa.wy + (pb.wy - pa.wy) * alpha
        : pa.wy ?? 0;

    return {
      id: pa.id,
      x: pa.x + (pb.x - pa.x) * alpha,
      y: pa.y + (pb.y - pa.y) * alpha,
      z: pa.z + (pb.z - pa.z) * alpha,
      vx,
      vy: 0,
      vz,
      wx: 0,
      wy,
      wz: 0,
      qx,
      qy,
      qz,
      qw,
      pocketed: false,
    };
  });
}

export default function App() {
  const [saveData, setSaveData] = useState<SaveData>(() => loadSaveData());
  const [rapierReady, setRapierReady] = useState(false);
  const appT = TRANSLATIONS[saveData.settings.language] ?? TRANSLATIONS.en;
  const appTRef = useRef(appT);
  appTRef.current = appT;

  const [screen, setScreen] = useState<'title' | 'playing'>('title');
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');

  // Match state (default background rack for live Title Screen orbit)
  const [matchState, setMatchState] = useState<MatchState>(() =>
    createInitialMatchState({
      gameMode: '8-ball',
      playMode: 'ai',
      player1Name: loadSaveData().nickname,
      player2Name: 'Medium AI',
      aiDifficulty: 'medium',
    }),
  );

  const matchStateRef = useRef<MatchState>(matchState);
  matchStateRef.current = matchState;

  const ballsRef = useRef<BallState[]>(matchState.balls);
  const aimAngleRef = useRef<number>(0);
  const [shotPower, setShotPower] = useState<number>(0.55);
  const shotPowerRef = useRef<number>(0.55);
  shotPowerRef.current = shotPower;

  const [spin, setSpin] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const spinRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  spinRef.current = spin;

  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('aim');
  const [strikePulseCounter, setStrikePulseCounter] = useState(0);
  const [newlyUnlocked, setNewlyUnlocked] = useState<string[]>([]);

  // Last-Shot Replay state
  const [lastReplay, setLastReplay] = useState<ShotReplayData | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const isReplayingRef = useRef(false);
  isReplayingRef.current = isReplaying;
  const [replayTime, setReplayTime] = useState(0);
  const replayTimeRef = useRef(0);
  const [replayPaused, setReplayPaused] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [showReplayTrails, setShowReplayTrails] = useState(true);
  const [showCuePathTracer, setShowCuePathTracer] = useState(false);
  const replayRafRef = useRef<number>(0);
  const savedCameraBeforeReplayRef = useRef<CameraPreset>('aim');
  const lastAudioEventIdxRef = useRef<number>(-1);

  // Online multiplayer state
  const [onlineConnected, setOnlineConnected] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayerSummary[]>([]);
  const [publicRooms, setPublicRooms] = useState<RoomInfo[]>([]);
  const [activeRoom, setActiveRoom] = useState<RoomInfo | null>(null);
  const [localSeatIndex, setLocalSeatIndex] = useState<0 | 1 | undefined>(undefined);
  const [isQueuing, setIsQueuing] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<OnlineInvitePayload | null>(null);

  // Practice Ideal Ghost-Ball Guide & Session Heatmap state
  const [showPracticeGuide, setShowPracticeGuide] = useState(true);
  const [practiceAimAngle, setPracticeAimAngle] = useState(0);
  const [practiceSession, setPracticeSession] = useState<PracticeSessionSummaryData>({
    shotsTaken: 0,
    ballsPocketed: 0,
    scratches: 0,
    bestStreak: 0,
    pots: [],
  });
  const practiceSessionStreakRef = useRef(0);

  // Daily Challenge state
  const [dailyRewardSummary, setDailyRewardSummary] = useState<DailyRewardSummary | null>(null);
  const lastDailyChallengeRef = useRef<{ dateKey: string; def: DailyChallengeDef } | null>(null);

  // Trick Shot Sandbox state
  const [isTrickShotEditMode, setIsTrickShotEditMode] = useState(false);
  const [selectedEditBallId, setSelectedEditBallId] = useState<number | null>(0);
  const trickShotAnchorBallsRef = useRef<BallState[] | null>(null);
  const trickShotAnchorShotRef = useRef<ShotParams | null>(null);
  const lastTrickShotLayoutRef = useRef<TrickShotLayout>(BUILTIN_TRICK_SHOTS[0]);

  // Physics simulation loop refs
  const physicsEngineRef = useRef<RapierPoolEngine | null>(null);
  const simRafRef = useRef<number>(0);
  const aiTimerRef = useRef<number>(0);
  const runAnimatedShotRef = useRef<
    ((shot: ShotParams, opts?: { authoritativeResult?: MatchState }) => void) | null
  >(null);
  const lastPracticeDrillRef = useRef<PracticeDrillId>('full_rack');
  const lastMatchConfigRef = useRef<{
    gameMode: GameMode;
    playMode: PlayMode;
    player1Name: string;
    player2Name: string;
    aiDifficulty?: AIDifficulty;
  }>({
    gameMode: '8-ball',
    playMode: 'ai',
    player1Name: saveData.nickname,
    player2Name: 'Medium AI',
    aiDifficulty: 'medium',
  });

  // Initialize Rapier & SoundEngine
  useEffect(() => {
    soundEngine.updateSettings(saveData.settings);
    ensureRapierInitialized().then(() => {
      physicsEngineRef.current = new RapierPoolEngine(saveData.settings.surfaceStyle);
      setRapierReady(true);
    });
    return () => {
      cancelAnimationFrame(simRafRef.current);
      cancelAnimationFrame(replayRafRef.current);
      clearTimeout(aiTimerRef.current);
      physicsEngineRef.current?.dispose();
    };
  }, []);

  // Sync playing surface physics multipliers (cloth friction & cushion elasticity)
  useEffect(() => {
    const engine = physicsEngineRef.current;
    if (!engine || !rapierReady) return;
    if (matchState.playMode === 'online') {
      engine.setSurfaceMultipliers({
        clothFrictionMultiplier: 1.0,
        cushionElasticityMultiplier: 1.0,
      });
    } else {
      engine.setSurfaceStyle(saveData.settings.surfaceStyle);
    }
  }, [saveData.settings.surfaceStyle, matchState.playMode, rapierReady]);

  // Sync dynamic crowd atmosphere with match stakes & AI difficulty
  useEffect(() => {
    soundEngine.updateCrowdContext(matchState, screen === 'playing');
  }, [
    screen,
    matchState,
  ]);

  // Sync <html lang> with selected interface language
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = saveData.settings.language;
    }
  }, [saveData.settings.language]);

  // Persist saveData changes & sync audio settings
  const updateSaveData = useCallback((updater: (prev: SaveData) => SaveData) => {
    setSaveData((prev) => {
      const next = updater(prev);
      saveSaveData(next);
      soundEngine.updateSettings(next.settings);
      return next;
    });
  }, []);

  const handlePhysicsEvents = useCallback((events: PhysicsEvent[]) => {
    for (const ev of events) {
      if (ev.type === 'ball-ball') {
        soundEngine.playBallCollision(ev.speed, ev.x);
      } else if (ev.type === 'cushion') {
        soundEngine.playCushionHit(ev.speed, ev.x);
      } else if (ev.type === 'pocket') {
        soundEngine.playPocketDrop(ev.x);
      }
    }
  }, []);

  const resetAimTowardNearestTarget = useCallback((state: MatchState) => {
    const cue = state.balls.find((b) => b.id === 0);
    if (!cue || cue.pocketed) return;
    const legalIds = getLegalTargetBallIds(state);
    let nearestDist = Infinity;
    let targetAngle = 0;
    for (const id of legalIds) {
      const b = state.balls.find((x) => x.id === id);
      if (!b || b.pocketed) continue;
      const d = Math.hypot(b.x - cue.x, b.z - cue.z);
      if (d < nearestDist) {
        nearestDist = d;
        targetAngle = Math.atan2(b.z - cue.z, b.x - cue.x);
      }
    }
    if (nearestDist < Infinity) {
      aimAngleRef.current = targetAngle;
      setPracticeAimAngle(targetAngle);
    }
  }, []);

  const scheduleAITurnIfNeeded = useCallback((state: MatchState) => {
    if (
      state.phase === 'game_over' ||
      state.playMode !== 'ai' ||
      !state.players[state.turnIndex].isAI
    ) {
      return;
    }
    const diff = state.players[state.turnIndex].aiDifficulty ?? 'medium';
    const delay = AI_DIFFICULTIES[diff].thinkMs;
    clearTimeout(aiTimerRef.current);
    aiTimerRef.current = window.setTimeout(() => {
      if (isReplayingRef.current) return;
      const latest = matchStateRef.current;
      if (latest.phase === 'game_over' || !latest.players[latest.turnIndex].isAI) {
        return;
      }
      let working = latest;
      if (latest.phase === 'ball_in_hand') {
        const spot = BilliardsAI.chooseBallInHandSpot(latest, diff);
        const updatedBalls = latest.balls.map((b) =>
          b.id === 0 ? { ...b, x: spot.x, z: spot.z, pocketed: false } : b,
        );
        working = { ...latest, balls: updatedBalls, phase: 'aiming' };
        ballsRef.current = updatedBalls;
        setMatchState(working);
      }
      const aiShot = BilliardsAI.computeShot(working, diff);
      aimAngleRef.current = aiShot.angle;
      setShotPower(aiShot.power);
      runAnimatedShotRef.current?.(aiShot);
    }, delay);
  }, []);

  // Run physics simulation in real time until balls come to rest
  const runAnimatedShot = useCallback(
    (
      shot: ShotParams,
      opts?: {
        authoritativeResult?: MatchState;
      },
    ) => {
      const engine = physicsEngineRef.current;
      if (!engine || !rapierReady) return;

      // Cancel any active replay if a new shot begins (e.g. online opponent shot)
      cancelAnimationFrame(replayRafRef.current);
      if (isReplayingRef.current) {
        isReplayingRef.current = false;
        setIsReplaying(false);
        setReplayPaused(false);
      }

      cancelAnimationFrame(simRafRef.current);
      soundEngine.startAmbientIfEnabled();
      soundEngine.playCueStrike(shot.power);
      setStrikePulseCounter((c) => c + 1);

      const prevMatch = matchStateRef.current;
      setMatchState((m) => ({ ...m, phase: 'shooting' }));

      const cueBonus =
        opts?.authoritativeResult
          ? 1.0
          : CUE_STYLES[saveData.selectedCue]?.powerBonus ?? 1.0;

      const preShotBalls = ballsRef.current.map((b) => ({ ...b }));
      engine.loadBalls(ballsRef.current);
      const frames: ReplayFrame[] = [
        { time: 0, balls: captureBallPoses(engine.exportBallStates()) },
      ];
      engine.applyShot(shot, cueBonus);

      let lastTime = performance.now();
      let accumulator = 0;
      let totalElapsed = 0;
      let simTime = 0;
      let substepCount = 0;

      const stepFrame = (now: number) => {
        const rawDt = (now - lastTime) / 1000;
        lastTime = now;
        const clampedDt = Math.min(Math.max(rawDt, 0), 0.05);
        accumulator += clampedDt;
        totalElapsed += clampedDt;

        let substeps = 0;
        while (accumulator >= FIXED_DT && substeps < 8) {
          const evs = engine.stepFixed();
          simTime += FIXED_DT;
          substepCount++;
          if (evs.length > 0) handlePhysicsEvents(evs);
          if (substepCount % 2 === 0) {
            frames.push({
              time: simTime,
              balls: captureBallPoses(engine.exportBallStates()),
            });
          }
          accumulator -= FIXED_DT;
          substeps++;
        }

        ballsRef.current = engine.exportBallStates();

        if ((totalElapsed > 0.22 && engine.isAllStopped()) || totalElapsed > 16) {
          const finalBalls = engine.exportBallStates();
          if (frames[frames.length - 1].time < simTime - 1e-4) {
            frames.push({
              time: simTime,
              balls: captureBallPoses(finalBalls),
            });
          }
          const summary = engine.getShotOutcomeSummary();

          const nextState = opts?.authoritativeResult
            ? opts.authoritativeResult
            : evaluateShotOutcome(prevMatch, finalBalls, summary);

          const shooter = prevMatch.players[prevMatch.turnIndex];
          setLastReplay({
            shotNumber: nextState.shotNumber,
            shooterName: shooter?.name ?? 'Player',
            shot: { ...shot },
            duration: Math.max(0.25, simTime),
            frames,
            events: summary.events,
            summaryMessage: nextState.statusMessage,
          });

          ballsRef.current = nextState.balls;
          setMatchState(nextState);
          setSpin({ x: 0, y: 0 });
          resetAimTowardNearestTarget(nextState);

          if (nextState.lastFoul) {
            soundEngine.playFoul();
          }
          soundEngine.reactToShotOutcome(prevMatch, nextState, summary);

          // Local progression & achievements
          if (!opts?.authoritativeResult) {
            const p1PocketedCount = summary.pocketedBallIds.length;
            if (prevMatch.gameMode === 'practice') {
              const cueBefore = preShotBalls.find((b) => b.id === 0);
              const nowIso = new Date().toISOString();
              const newPots: PracticePotRecord[] = [];
              for (const ev of summary.events) {
                if (ev.type === 'pocket' && ev.ballA > 0 && ev.pocketIndex !== undefined) {
                  const originBall = preShotBalls.find((b) => b.id === ev.ballA);
                  if (originBall) {
                    newPots.push({
                      ballId: ev.ballA,
                      pocketIndex: ev.pocketIndex,
                      originX: Number(originBall.x.toFixed(4)),
                      originZ: Number(originBall.z.toFixed(4)),
                      pocketX: Number(ev.x.toFixed(4)),
                      pocketZ: Number(ev.z.toFixed(4)),
                      cueX: Number((cueBefore?.x ?? 0).toFixed(4)),
                      cueZ: Number((cueBefore?.z ?? 0).toFixed(4)),
                      distanceM: Number(Math.hypot(ev.x - originBall.x, ev.z - originBall.z).toFixed(3)),
                      timestamp: nowIso,
                    });
                  }
                }
              }

              const nextSessStreak =
                p1PocketedCount > 0 ? practiceSessionStreakRef.current + p1PocketedCount : 0;
              practiceSessionStreakRef.current = nextSessStreak;
              setPracticeSession((prev) => ({
                shotsTaken: prev.shotsTaken + 1,
                ballsPocketed: prev.ballsPocketed + p1PocketedCount,
                scratches: prev.scratches + (summary.cueBallPocketed ? 1 : 0),
                bestStreak: Math.max(prev.bestStreak, nextSessStreak),
                pots: [...newPots, ...prev.pots],
              }));

              updateSaveData((s) => {
                const nextStreak = p1PocketedCount > 0 ? s.practiceStats.currentStreak + p1PocketedCount : 0;
                const bestStreak = Math.max(s.practiceStats.bestStreak, nextStreak);
                let updated: SaveData = {
                  ...s,
                  xp: s.xp + p1PocketedCount * 10,
                  practiceStats: {
                    ...s.practiceStats,
                    shotsTaken: s.practiceStats.shotsTaken + 1,
                    ballsPocketed: s.practiceStats.ballsPocketed + p1PocketedCount,
                    currentStreak: nextStreak,
                    bestStreak,
                    potHistory: [...newPots, ...s.practiceStats.potHistory].slice(0, 250),
                  },
                };
                if (p1PocketedCount > 0) {
                  updated = unlockAchievement(updated, 'first_pot').data;
                }
                if (bestStreak >= 5) {
                  updated = unlockAchievement(updated, 'practice_streak_5').data;
                }
                return updated;
              });
            } else if (prevMatch.gameMode === 'trick_shot') {
              if (p1PocketedCount > 0) {
                updateSaveData((s) => unlockAchievement(s, 'first_pot').data);
              }
            } else if (prevMatch.turnIndex === 0 && p1PocketedCount > 0) {
              updateSaveData((s) => {
                let next = unlockAchievement(s, 'first_pot').data;
                if (prevMatch.isBreakShot && !nextState.lastFoul) {
                  next = unlockAchievement(next, 'break_pot').data;
                }
                return next;
              });
            }
          }

          // Match completion handling
          if (nextState.phase === 'game_over') {
            if (nextState.gameMode === 'daily_challenge' && nextState.dailyChallenge) {
              const dcRun = nextState.dailyChallenge;
              if (dcRun.completed) {
                soundEngine.playVictory();
                const challengeDef =
                  lastDailyChallengeRef.current?.def ??
                  getDailyChallengeForDate(dcRun.dateKey).challenge;
                updateSaveData((s) => {
                  const res = recordDailyChallengeSuccess(s, {
                    dateKey: dcRun.dateKey,
                    challenge: challengeDef,
                    shotsUsed: dcRun.shotsTaken,
                  });
                  setDailyRewardSummary({
                    xpEarned: res.xpEarned,
                    streakBonus: res.streakBonus,
                    alreadyCompletedToday: res.alreadyCompletedToday,
                    currentStreak: res.data.dailyChallenge.currentStreak,
                  });
                  if (res.newlyUnlocked.length > 0) {
                    setNewlyUnlocked(res.newlyUnlocked);
                  }
                  return res.data;
                });
              } else {
                soundEngine.playFoul();
                setDailyRewardSummary(null);
              }
            } else {
              soundEngine.playVictory();
              const isOnline = nextState.playMode === 'online';
              const myIdx = isOnline ? (localSeatIndex ?? 0) : 0;
              const won = nextState.winnerIndex === myIdx;

              if (
                nextState.playMode !== 'practice' &&
                nextState.playMode !== 'trick_shot' &&
                (nextState.playMode !== 'local' || won)
              ) {
                const oppName = nextState.players[myIdx === 0 ? 1 : 0].name;
                updateSaveData((s) => {
                  const res = recordCompletedMatch(s, {
                    gameMode: nextState.gameMode,
                    playMode: nextState.playMode,
                    opponentName: oppName,
                    won,
                    reason: nextState.winReason ?? 'Match complete',
                    shotsTaken: nextState.shotNumber,
                    ballsPocketed: nextState.players[myIdx].ballsPocketed,
                    aiDifficulty: nextState.players[1].aiDifficulty,
                  });
                  if (res.newlyUnlocked.length > 0) {
                    setNewlyUnlocked(res.newlyUnlocked);
                  }
                  return res.data;
                });
              }
            }
          } else {
            scheduleAITurnIfNeeded(nextState);
          }

          return;
        }

        simRafRef.current = requestAnimationFrame(stepFrame);
      };

      simRafRef.current = requestAnimationFrame(stepFrame);
    },
    [
      handlePhysicsEvents,
      localSeatIndex,
      rapierReady,
      resetAimTowardNearestTarget,
      saveData.selectedCue,
      scheduleAITurnIfNeeded,
      updateSaveData,
    ],
  );
  runAnimatedShotRef.current = runAnimatedShot;

  // Replay Controls & Playback Loop
  const startReplay = useCallback(() => {
    if (!lastReplay || matchStateRef.current.phase === 'shooting') return;
    clearTimeout(aiTimerRef.current);
    cancelAnimationFrame(replayRafRef.current);

    if (!isReplayingRef.current) {
      savedCameraBeforeReplayRef.current = cameraPreset;
    }

    aimAngleRef.current = lastReplay.shot.angle;
    replayTimeRef.current = 0;
    setReplayTime(0);
    lastAudioEventIdxRef.current = -1;
    ballsRef.current = sampleReplayBalls(lastReplay, 0);

    setActiveModal('none');
    setIsReplaying(true);
    setReplayPaused(false);
    setCameraPreset('follow');

    soundEngine.playCueStrike(lastReplay.shot.power);
    setStrikePulseCounter((c) => c + 1);
  }, [cameraPreset, lastReplay]);

  const exitReplay = useCallback(() => {
    cancelAnimationFrame(replayRafRef.current);
    isReplayingRef.current = false;
    setIsReplaying(false);
    setReplayPaused(false);

    const currentMatch = matchStateRef.current;
    ballsRef.current = currentMatch.balls;
    setCameraPreset(savedCameraBeforeReplayRef.current);
    resetAimTowardNearestTarget(currentMatch);
    scheduleAITurnIfNeeded(currentMatch);
  }, [resetAimTowardNearestTarget, scheduleAITurnIfNeeded]);

  const handleReplaySeek = useCallback(
    (targetTime: number) => {
      if (!lastReplay) return;
      const clamped = Math.max(0, Math.min(lastReplay.duration, targetTime));
      replayTimeRef.current = clamped;
      setReplayTime(clamped);
      ballsRef.current = sampleReplayBalls(lastReplay, clamped);

      let eventIdx = -1;
      for (let i = 0; i < lastReplay.events.length; i++) {
        if (lastReplay.events[i].time <= clamped) {
          eventIdx = i;
        } else {
          break;
        }
      }
      lastAudioEventIdxRef.current = eventIdx;

      if (clamped <= 0.001) {
        soundEngine.playCueStrike(lastReplay.shot.power);
        setStrikePulseCounter((c) => c + 1);
      }
    },
    [lastReplay],
  );

  const handleReplayTogglePause = useCallback(() => {
    if (!lastReplay) return;
    setReplayPaused((prevPaused) => {
      if (prevPaused && replayTimeRef.current >= lastReplay.duration - 0.02) {
        replayTimeRef.current = 0;
        setReplayTime(0);
        lastAudioEventIdxRef.current = -1;
        ballsRef.current = sampleReplayBalls(lastReplay, 0);
        soundEngine.playCueStrike(lastReplay.shot.power);
        setStrikePulseCounter((c) => c + 1);
      }
      return !prevPaused;
    });
  }, [lastReplay]);

  useEffect(() => {
    if (!isReplaying || replayPaused || !lastReplay) return;

    let lastNow = performance.now();
    const tickReplay = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;

      const prevT = replayTimeRef.current;
      const nextT = Math.min(lastReplay.duration, prevT + dt * replaySpeed);
      replayTimeRef.current = nextT;
      ballsRef.current = sampleReplayBalls(lastReplay, nextT);

      // Fire physics audio events crossed in (prevT, nextT]
      const triggered: PhysicsEvent[] = [];
      let idx = lastAudioEventIdxRef.current + 1;
      while (idx < lastReplay.events.length && lastReplay.events[idx].time <= nextT) {
        if (lastReplay.events[idx].time > prevT) {
          triggered.push(lastReplay.events[idx]);
        }
        lastAudioEventIdxRef.current = idx;
        idx++;
      }
      if (triggered.length > 0) {
        handlePhysicsEvents(triggered);
      }

      setReplayTime(nextT);
      if (nextT >= lastReplay.duration) {
        setReplayPaused(true);
        return;
      }

      replayRafRef.current = requestAnimationFrame(tickReplay);
    };

    replayRafRef.current = requestAnimationFrame(tickReplay);
    return () => cancelAnimationFrame(replayRafRef.current);
  }, [handlePhysicsEvents, isReplaying, lastReplay, replayPaused, replaySpeed]);

  // Start a new local/AI/practice/trick-shot/daily-challenge match
  const startMatch = useCallback(
    (cfg: {
      gameMode: GameMode;
      playMode: PlayMode;
      player1Name: string;
      player2Name: string;
      aiDifficulty?: AIDifficulty;
      practiceDrill?: PracticeDrillId;
      trickShotLayout?: TrickShotLayout;
      dailyChallenge?: { dateKey: string; def: DailyChallengeDef };
    }) => {
      cancelAnimationFrame(simRafRef.current);
      cancelAnimationFrame(replayRafRef.current);
      clearTimeout(aiTimerRef.current);
      isReplayingRef.current = false;
      setIsReplaying(false);
      setReplayPaused(false);
      setLastReplay(null);
      setDailyRewardSummary(null);
      soundEngine.playMenuClick();
      soundEngine.startAmbientIfEnabled();

      if (cfg.practiceDrill) {
        lastPracticeDrillRef.current = cfg.practiceDrill;
      }
      if (cfg.trickShotLayout) {
        lastTrickShotLayoutRef.current = cfg.trickShotLayout;
      }
      if (cfg.dailyChallenge) {
        lastDailyChallengeRef.current = cfg.dailyChallenge;
      }
      lastMatchConfigRef.current = {
        gameMode: cfg.gameMode,
        playMode: cfg.playMode,
        player1Name: cfg.player1Name,
        player2Name: cfg.player2Name,
        aiDifficulty: cfg.aiDifficulty,
      };

      const chosenTrickShot =
        cfg.gameMode === 'trick_shot'
          ? cfg.trickShotLayout ?? lastTrickShotLayoutRef.current
          : undefined;
      const initialBalls = chosenTrickShot
        ? ballsFromTrickShotLayout(chosenTrickShot)
        : undefined;

      const resolvedDaily =
        cfg.gameMode === 'daily_challenge'
          ? cfg.dailyChallenge ?? lastDailyChallengeRef.current ?? undefined
          : undefined;

      if (cfg.gameMode === 'daily_challenge' && resolvedDaily) {
        updateSaveData((s) => recordDailyChallengeAttempt(s, resolvedDaily.dateKey));
      }

      const fresh = createInitialMatchState({
        ...cfg,
        initialBalls,
        dailyChallenge: resolvedDaily,
      });

      if (cfg.gameMode === 'practice') {
        practiceSessionStreakRef.current = 0;
        setPracticeSession({
          shotsTaken: 0,
          ballsPocketed: 0,
          scratches: 0,
          bestStreak: 0,
          pots: [],
        });
      }

      if (cfg.gameMode === 'trick_shot') {
        trickShotAnchorBallsRef.current = fresh.balls.map((b) => ({ ...b }));
        trickShotAnchorShotRef.current = chosenTrickShot?.suggestedShot
          ? { ...chosenTrickShot.suggestedShot }
          : null;
        setIsTrickShotEditMode(chosenTrickShot?.id === 'builtin_clean_sandbox');
        setSelectedEditBallId(0);
      } else {
        trickShotAnchorBallsRef.current = null;
        trickShotAnchorShotRef.current = null;
        setIsTrickShotEditMode(false);
      }

      ballsRef.current = fresh.balls;
      aimAngleRef.current = chosenTrickShot?.suggestedShot?.angle ?? 0;
      setShotPower(
        resolvedDaily?.def.initialPower ??
          chosenTrickShot?.suggestedShot?.power ??
          (cfg.gameMode === 'practice' || cfg.gameMode === 'trick_shot' ? 0.6 : 0.85),
      );
      setSpin(
        resolvedDaily?.def.initialSpin
          ? { ...resolvedDaily.def.initialSpin }
          : chosenTrickShot?.suggestedShot
            ? { x: chosenTrickShot.suggestedShot.spinX, y: chosenTrickShot.suggestedShot.spinY }
            : { x: 0, y: 0 },
      );
      setNewlyUnlocked([]);
      setLocalSeatIndex(undefined);
      setActiveRoom(null);
      setMatchState(fresh);
      setActiveModal('none');
      setScreen('playing');
      setCameraPreset('aim');
      if (!chosenTrickShot?.suggestedShot) {
        resetAimTowardNearestTarget(fresh);
      }
    },
    [resetAimTowardNearestTarget, updateSaveData],
  );

  // Connect & wire Online Multiplayer Socket.IO events
  const connectMultiplayer = useCallback(() => {
    const socket = multiplayerClient.connect(saveData.playerId, saveData.nickname);
    socket.off('connect');
    socket.off('disconnect');
    socket.off('connect_error');
    socket.off('lobby:players');
    socket.off('lobby:rooms');
    socket.off('queue:status');
    socket.off('room:created');
    socket.off('room:error');
    socket.off('invite:received');
    socket.off('match:started');
    socket.off('room:reconnected');
    socket.off('ball_in_hand:updated');
    socket.off('aim:remote');
    socket.off('match:state');
    socket.off('shot:executed');
    socket.off('opponent:left');

    socket.on('connect', () => {
      setOnlineConnected(true);
      setOnlineError(null);
    });
    socket.on('disconnect', () => setOnlineConnected(false));
    socket.on('connect_error', () => {
      setOnlineConnected(false);
    });
    socket.on('lobby:players', (list: OnlinePlayerSummary[]) => setOnlinePlayers(list));
    socket.on('lobby:rooms', (rooms: RoomInfo[]) => setPublicRooms(rooms));
    socket.on('queue:status', (d: { queuing: boolean }) => setIsQueuing(d.queuing));
    socket.on('room:created', (d: { room: RoomInfo; seatIndex: 0 | 1 }) => {
      setActiveRoom(d.room);
      setLocalSeatIndex(d.seatIndex);
      setOnlineError(null);
    });
    socket.on('room:error', (d: { message: string }) => setOnlineError(d.message));
    socket.on('invite:received', (inv: OnlineInvitePayload) => setPendingInvite(inv));

    const enterOnlineMatch = (payload: OnlineMatchStartedPayload) => {
      cancelAnimationFrame(simRafRef.current);
      cancelAnimationFrame(replayRafRef.current);
      clearTimeout(aiTimerRef.current);
      isReplayingRef.current = false;
      setIsReplaying(false);
      setReplayPaused(false);
      setLastReplay(null);
      soundEngine.startAmbientIfEnabled();
      setIsQueuing(false);
      setActiveRoom(payload.room);
      if (payload.seatIndex !== undefined) {
        setLocalSeatIndex(payload.seatIndex);
      }
      ballsRef.current = payload.matchState.balls;
      setMatchState(payload.matchState);
      setSpin({ x: 0, y: 0 });
      setShotPower(0.85);
      setNewlyUnlocked([]);
      setActiveModal('none');
      setScreen('playing');
      setCameraPreset('aim');
      resetAimTowardNearestTarget(payload.matchState);
    };

    socket.on('match:started', enterOnlineMatch);
    socket.on('room:reconnected', enterOnlineMatch);

    socket.on('ball_in_hand:updated', (pos: { x: number; y: number; z: number }) => {
      ballsRef.current = ballsRef.current.map((b) =>
        b.id === 0 ? { ...b, x: pos.x, y: pos.y, z: pos.z, pocketed: false } : b,
      );
      setMatchState((m) => ({
        ...m,
        balls: ballsRef.current,
      }));
    });

    socket.on('aim:remote', (d: { angle: number }) => {
      aimAngleRef.current = d.angle;
    });

    socket.on('match:state', (nextState: MatchState) => {
      ballsRef.current = nextState.balls;
      setMatchState(nextState);
    });

    socket.on('shot:executed', (payload: OnlineShotExecutedPayload) => {
      aimAngleRef.current = payload.shot.angle;
      runAnimatedShot(payload.shot, { authoritativeResult: payload.finalMatchState });
    });

    socket.on('opponent:left', (d: { nickname: string }) => {
      setMatchState((m) => ({
        ...m,
        phase: 'game_over',
        winnerIndex: localSeatIndex ?? 0,
        winReason: `${d.nickname} disconnected from the match`,
        statusMessage: appTRef.current.statusOpponentLeft,
      }));
    });
  }, [localSeatIndex, resetAimTowardNearestTarget, runAnimatedShot, saveData.nickname, saveData.playerId]);

  const canHumanInteract = useMemo(() => {
    if (screen !== 'playing' || activeModal !== 'none' || isReplaying || isTrickShotEditMode) {
      return false;
    }
    if (matchState.phase !== 'aiming' && matchState.phase !== 'ball_in_hand') return false;
    if (matchState.playMode === 'ai' && matchState.players[matchState.turnIndex].isAI) return false;
    if (matchState.playMode === 'online' && matchState.turnIndex !== localSeatIndex) return false;
    return true;
  }, [activeModal, isReplaying, isTrickShotEditMode, localSeatIndex, matchState, screen]);

  const legalTargetIds = useMemo(() => getLegalTargetBallIds(matchState), [matchState]);

  const practiceIdealShot = useMemo(() => {
    if (
      screen !== 'playing' ||
      matchState.gameMode !== 'practice' ||
      matchState.phase !== 'aiming' ||
      !showPracticeGuide ||
      isReplaying
    ) {
      return null;
    }
    return computePracticeIdealShot(matchState.balls, practiceAimAngle);
  }, [
    isReplaying,
    matchState.balls,
    matchState.gameMode,
    matchState.phase,
    practiceAimAngle,
    screen,
    showPracticeGuide,
  ]);

  const handleShoot = useCallback(
    (power: number) => {
      if (!canHumanInteract || matchState.phase === 'ball_in_hand') return;
      const shot: ShotParams = {
        angle: aimAngleRef.current,
        power: Math.max(0.06, Math.min(1, power)),
        spinX: spinRef.current.x,
        spinY: spinRef.current.y,
      };
      if (matchState.playMode === 'online') {
        multiplayerClient.submitShot(shot);
        setMatchState((m) => ({
          ...m,
          phase: 'shooting',
          statusMessage: appTRef.current.statusValidatingShot,
        }));
      } else {
        runAnimatedShot(shot);
      }
    },
    [canHumanInteract, matchState.phase, matchState.playMode, runAnimatedShot],
  );

  const handleBallInHandMove = useCallback(
    (x: number, z: number) => {
      if (!canHumanInteract || matchState.phase !== 'ball_in_hand') return;
      const valid = isValidBallInHandPosition(x, z, ballsRef.current, matchState.isBreakShot);
      if (!valid) return;

      const updated = ballsRef.current.map((b) =>
        b.id === 0 ? { ...b, x, z, pocketed: false } : b,
      );
      ballsRef.current = updated;
      setMatchState((m) => ({ ...m, balls: updated }));
      if (matchState.playMode === 'online') {
        multiplayerClient.moveBallInHand(x, z);
      }
    },
    [canHumanInteract, matchState.isBreakShot, matchState.phase, matchState.playMode],
  );

  const handleConfirmBallInHand = useCallback(() => {
    if (!canHumanInteract || matchState.phase !== 'ball_in_hand') return;
    soundEngine.playMenuClick();
    if (matchState.playMode === 'online') {
      multiplayerClient.confirmBallInHand();
    } else {
      setMatchState((m) => ({
        ...m,
        phase: 'aiming',
        statusMessage: interpolateMessage(appTRef.current.statusPlayerAiming, {
          name: m.players[m.turnIndex].name,
        }),
      }));
    }
  }, [canHumanInteract, matchState.phase, matchState.playMode]);

  const handleAimAngleChange = useCallback(
    (nextAngle: number) => {
      aimAngleRef.current = nextAngle;
      if (matchStateRef.current.gameMode === 'practice') {
        setPracticeAimAngle(nextAngle);
      }
      if (matchState.playMode === 'online' && canHumanInteract) {
        multiplayerClient.sendAimPreview(nextAngle);
      }
    },
    [canHumanInteract, matchState.playMode],
  );

  // Trick Shot Sandbox handlers
  const handleEditMoveBall = useCallback((ballId: number, x: number, z: number) => {
    if (matchStateRef.current.gameMode !== 'trick_shot') return;
    if (!isValidTrickShotBallPosition(ballId, x, z, ballsRef.current)) return;

    const updated = ballsRef.current.map((b) =>
      b.id === ballId
        ? {
            ...b,
            x,
            y: BALL_REST_Y,
            z,
            vx: 0,
            vy: 0,
            vz: 0,
            wx: 0,
            wy: 0,
            wz: 0,
            pocketed: false,
          }
        : b,
    );
    ballsRef.current = updated;
    trickShotAnchorBallsRef.current = updated.map((b) => ({ ...b }));
    setMatchState((m) => ({
      ...m,
      balls: updated,
      phase: 'aiming',
      lastFoul: null,
    }));
  }, []);

  const handleToggleBallOnTable = useCallback((ballId: number) => {
    if (matchStateRef.current.gameMode !== 'trick_shot') return;
    const current = ballsRef.current;
    const target = current.find((b) => b.id === ballId);
    if (!target) return;

    if (!target.pocketed) {
      if (ballId === 0) {
        setSelectedEditBallId(0);
        return;
      }
      const updated = current.map((b) =>
        b.id === ballId ? { ...b, pocketed: true, vx: 0, vy: 0, vz: 0 } : b,
      );
      ballsRef.current = updated;
      trickShotAnchorBallsRef.current = updated.map((b) => ({ ...b }));
      setSelectedEditBallId((prev) => (prev === ballId ? 0 : prev));
      setMatchState((m) => ({ ...m, balls: updated }));
    } else {
      const spot = findSafeTrickShotSpot(current, ballId);
      const updated = current.map((b) =>
        b.id === ballId
          ? {
              ...b,
              x: spot.x,
              y: BALL_REST_Y,
              z: spot.z,
              vx: 0,
              vy: 0,
              vz: 0,
              wx: 0,
              wy: 0,
              wz: 0,
              pocketed: false,
            }
          : b,
      );
      ballsRef.current = updated;
      trickShotAnchorBallsRef.current = updated.map((b) => ({ ...b }));
      setSelectedEditBallId(ballId);
      setMatchState((m) => ({ ...m, balls: updated }));
    }
  }, []);

  const handleClearTrickShotTable = useCallback(() => {
    if (matchStateRef.current.gameMode !== 'trick_shot') return;
    const updated = ballsRef.current.map((b) => {
      if (b.id === 0) {
        return {
          ...b,
          y: BALL_REST_Y,
          vx: 0,
          vy: 0,
          vz: 0,
          wx: 0,
          wy: 0,
          wz: 0,
          pocketed: false,
        };
      }
      return { ...b, pocketed: true, vx: 0, vy: 0, vz: 0 };
    });
    ballsRef.current = updated;
    trickShotAnchorBallsRef.current = updated.map((b) => ({ ...b }));
    setSelectedEditBallId(0);
    setMatchState((m) => ({
      ...m,
      balls: updated,
      statusMessage: appTRef.current.statusTableCleared,
    }));
  }, []);

  const handleResetTrickShot = useCallback(() => {
    if (matchStateRef.current.gameMode !== 'trick_shot') return;
    cancelAnimationFrame(replayRafRef.current);
    isReplayingRef.current = false;
    setIsReplaying(false);
    setReplayPaused(false);
    soundEngine.playMenuClick();

    const anchor =
      trickShotAnchorBallsRef.current ??
      ballsFromTrickShotLayout(lastTrickShotLayoutRef.current);
    const restored = anchor.map((b) => ({
      ...b,
      y: BALL_REST_Y,
      vx: 0,
      vy: 0,
      vz: 0,
      wx: 0,
      wy: 0,
      wz: 0,
    }));
    ballsRef.current = restored;
    const nextState: MatchState = {
      ...matchStateRef.current,
      balls: restored,
      phase: 'aiming',
      lastFoul: null,
      statusMessage: appTRef.current.statusTrickShotReset,
    };
    setMatchState(nextState);

    if (trickShotAnchorShotRef.current) {
      aimAngleRef.current = trickShotAnchorShotRef.current.angle;
      setShotPower(trickShotAnchorShotRef.current.power);
      setSpin({
        x: trickShotAnchorShotRef.current.spinX,
        y: trickShotAnchorShotRef.current.spinY,
      });
    } else {
      resetAimTowardNearestTarget(nextState);
    }
  }, [resetAimTowardNearestTarget]);

  const handleLoadTrickShotLayout = useCallback(
    (layout: TrickShotLayout) => {
      cancelAnimationFrame(simRafRef.current);
      cancelAnimationFrame(replayRafRef.current);
      isReplayingRef.current = false;
      setIsReplaying(false);
      setReplayPaused(false);
      setLastReplay(null);
      setIsTrickShotEditMode(false);
      soundEngine.playMenuClick();

      lastTrickShotLayoutRef.current = layout;
      const loadedBalls = ballsFromTrickShotLayout(layout);
      trickShotAnchorBallsRef.current = loadedBalls.map((b) => ({ ...b }));
      trickShotAnchorShotRef.current = layout.suggestedShot
        ? { ...layout.suggestedShot }
        : null;
      ballsRef.current = loadedBalls;

      const nextState: MatchState = {
        ...matchStateRef.current,
        balls: loadedBalls,
        phase: 'aiming',
        lastFoul: null,
        statusMessage: interpolateMessage(appTRef.current.statusLayoutLoaded, {
          name: layout.name,
        }),
      };
      setMatchState(nextState);

      if (layout.suggestedShot) {
        aimAngleRef.current = layout.suggestedShot.angle;
        setShotPower(layout.suggestedShot.power);
        setSpin({
          x: layout.suggestedShot.spinX,
          y: layout.suggestedShot.spinY,
        });
      } else {
        setSpin({ x: 0, y: 0 });
        resetAimTowardNearestTarget(nextState);
      }
    },
    [resetAimTowardNearestTarget],
  );

  const handleSaveTrickShotLayout = useCallback(
    (name: string, description?: string) => {
      const currentShot: ShotParams = {
        angle: aimAngleRef.current,
        power: shotPowerRef.current,
        spinX: spinRef.current.x,
        spinY: spinRef.current.y,
      };
      let created: TrickShotLayout | null = null;
      updateSaveData((s) => {
        const res = saveTrickShotLayout(s, {
          name,
          description,
          balls: ballsRef.current,
          suggestedShot: currentShot,
        });
        created = res.layout;
        return res.data;
      });
      if (created) {
        lastTrickShotLayoutRef.current = created;
      }
    },
    [updateSaveData],
  );

  const handleImportTrickShotLayout = useCallback(
    (imported: TrickShotLayout) => {
      updateSaveData((s) => {
        const res = saveTrickShotLayout(s, {
          name: imported.name,
          description: imported.description,
          balls: ballsFromTrickShotLayout(imported),
          suggestedShot: imported.suggestedShot,
        });
        return res.data;
      });
      handleLoadTrickShotLayout(imported);
    },
    [handleLoadTrickShotLayout, updateSaveData],
  );

  // Keyboard shortcuts during gameplay & replay
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (screen !== 'playing') return;
      if (e.key === 'Escape') {
        if (isReplaying) {
          exitReplay();
        } else {
          setActiveModal((m) => (m === 'pause' ? 'none' : m === 'none' ? 'pause' : m));
        }
        return;
      }
      if (activeModal !== 'none') return;

      if (e.key === '1') setCameraPreset('aim');
      if (e.key === '2') setCameraPreset('follow');
      if (e.key === '3') setCameraPreset('overhead');
      if (e.key === '4') setCameraPreset('orbit');
      if (e.key === '5') setCameraPreset('low');
      if (e.key.toLowerCase() === 'c') {
        const order: CameraPreset[] = ['aim', 'follow', 'overhead', 'orbit', 'low'];
        setCameraPreset((prev) => order[(order.indexOf(prev) + 1) % order.length]);
      }

      if (isReplaying) {
        if (e.code === 'Space') {
          e.preventDefault();
          handleReplayTogglePause();
        }
        return;
      }

      if (!canHumanInteract) return;
      const stepAngle = e.shiftKey ? 0.008 : 0.032;
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        handleAimAngleChange(aimAngleRef.current - stepAngle);
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        handleAimAngleChange(aimAngleRef.current + stepAngle);
      } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        setShotPower((p) => Math.min(1, Number((p + 0.05).toFixed(2))));
      } else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
        setShotPower((p) => Math.max(0.08, Number((p - 0.05).toFixed(2))));
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (matchState.phase === 'ball_in_hand') {
          handleConfirmBallInHand();
        } else {
          handleShoot(shotPowerRef.current);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeModal,
    canHumanInteract,
    exitReplay,
    handleAimAngleChange,
    handleConfirmBallInHand,
    handleReplayTogglePause,
    handleShoot,
    isReplaying,
    matchState.phase,
    screen,
  ]);

  const handleRestartMatch = () => {
    if (matchState.playMode === 'online') {
      multiplayerClient.requestRematch();
      setMatchState((m) => ({ ...m, statusMessage: appTRef.current.statusRematchRequested }));
      return;
    }
    startMatch({
      ...lastMatchConfigRef.current,
      practiceDrill:
        lastMatchConfigRef.current.gameMode === 'practice'
          ? lastPracticeDrillRef.current
          : undefined,
      dailyChallenge:
        lastMatchConfigRef.current.gameMode === 'daily_challenge'
          ? lastDailyChallengeRef.current ?? undefined
          : undefined,
    });
  };

  const handleEndPracticeSession = useCallback(() => {
    soundEngine.playMenuClick();
    updateSaveData((s) => recordPracticeSessionCompleted(s));
    setActiveModal('practice_summary');
  }, [updateSaveData]);

  const handleExitToMenu = () => {
    cancelAnimationFrame(simRafRef.current);
    cancelAnimationFrame(replayRafRef.current);
    clearTimeout(aiTimerRef.current);
    isReplayingRef.current = false;
    setIsReplaying(false);
    setReplayPaused(false);
    setLastReplay(null);
    setIsTrickShotEditMode(false);
    if (matchState.playMode === 'online') {
      multiplayerClient.leaveRoom();
    }
    setActiveModal('none');
    setScreen('title');
    // Reset background table to crisp 8-ball rack for Title Screen showcase
    const showcaseBalls = createEightBallRack();
    ballsRef.current = showcaseBalls;
    setMatchState((m) => ({ ...m, balls: showcaseBalls, phase: 'aiming' }));
  };

  return (
    <I18nProvider
      language={saveData.settings.language}
      onChangeLanguage={(lang) =>
        updateSaveData((s) => ({
          ...s,
          settings: { ...s.settings, language: lang },
        }))
      }
    >
      <div className="relative w-full h-[100dvh] overflow-hidden bg-[#080B0A]">
      {/* Persistent 3D WebGL Viewport */}
      <BilliardsViewport
        isTitleScreen={screen === 'title'}
        ballsRef={ballsRef}
        aimAngleRef={aimAngleRef}
        shotPowerRef={shotPowerRef}
        spinRef={spinRef}
        canInteract={canHumanInteract}
        isShooting={matchState.phase === 'shooting'}
        isBallInHand={matchState.phase === 'ball_in_hand'}
        behindHeadStringOnly={matchState.isBreakShot}
        legalTargetIds={legalTargetIds}
        cameraPreset={cameraPreset}
        cueStyle={saveData.selectedCue}
        tableCloth={saveData.selectedTable}
        environmentId={saveData.selectedEnvironment}
        graphicsQuality={saveData.settings.graphicsQuality}
        aimAssist={saveData.settings.aimAssist}
        ghostBallGuide={saveData.settings.ghostBallGuide}
        showIdealGuide={matchState.gameMode === 'practice' && showPracticeGuide}
        cameraSensitivity={saveData.settings.cameraSensitivity}
        strikePulseCounter={strikePulseCounter}
        isReplaying={isReplaying}
        replayData={lastReplay}
        replayTimeRef={replayTimeRef}
        replaySpeed={replaySpeed}
        replayPaused={replayPaused}
        showReplayTrails={showReplayTrails}
        showCuePathTracer={showCuePathTracer}
        isEditMode={isTrickShotEditMode && matchState.gameMode === 'trick_shot'}
        selectedEditBallId={selectedEditBallId}
        onEditSelectBall={setSelectedEditBallId}
        onEditMoveBall={handleEditMoveBall}
        onAimAngleChange={handleAimAngleChange}
        onBallInHandMove={handleBallInHandMove}
        onBallInHandCommit={handleConfirmBallInHand}
      />

      {/* Title Screen */}
      {screen === 'title' && (
        <TitleScreen
          saveData={saveData}
          onQuickPlay={() =>
            startMatch({
              gameMode: '8-ball',
              playMode: 'ai',
              player1Name: saveData.nickname,
              player2Name: 'Medium AI',
              aiDifficulty: 'medium',
            })
          }
          onOpenDailyChallenge={() => {
            soundEngine.playMenuClick();
            setActiveModal('daily_challenge');
          }}
          onOpenOnline={() => {
            soundEngine.playMenuClick();
            setActiveModal('online');
          }}
          onOpenVsAI={() => {
            soundEngine.playMenuClick();
            setActiveModal('setup_ai');
          }}
          onOpenLocal2P={() => {
            soundEngine.playMenuClick();
            setActiveModal('setup_local');
          }}
          onOpenPractice={() => {
            soundEngine.playMenuClick();
            setActiveModal('setup_practice');
          }}
          onOpenTrickShot={() => {
            soundEngine.playMenuClick();
            setActiveModal('setup_trick_shot');
          }}
          onOpenProfile={() => {
            soundEngine.playMenuClick();
            setActiveModal('profile');
          }}
          onOpenSettings={() => {
            soundEngine.playMenuClick();
            setActiveModal('settings');
          }}
        />
      )}

      {/* Active Gameplay HUD */}
      {screen === 'playing' && (
        <GameHUD
          matchState={matchState}
          shotPower={shotPower}
          spin={spin}
          canShoot={canHumanInteract}
          cameraPreset={cameraPreset}
          cueStyle={saveData.selectedCue}
          tableCloth={saveData.selectedTable}
          environmentId={saveData.selectedEnvironment}
          surfaceStyle={saveData.settings.surfaceStyle}
          muted={saveData.settings.muted}
          localSeatIndex={localSeatIndex}
          hasReplay={Boolean(lastReplay && matchState.phase !== 'shooting')}
          isReplaying={isReplaying}
          replayData={lastReplay}
          replayTime={replayTime}
          replayPaused={replayPaused}
          replaySpeed={replaySpeed}
          showReplayTrails={showReplayTrails}
          showCuePathTracer={showCuePathTracer}
          onStartReplay={startReplay}
          onExitReplay={exitReplay}
          onReplayTogglePause={handleReplayTogglePause}
          onReplaySeek={handleReplaySeek}
          onReplaySpeedChange={setReplaySpeed}
          onToggleReplayTrails={() => setShowReplayTrails((v) => !v)}
          onToggleCuePathTracer={() => setShowCuePathTracer((v) => !v)}
          onPowerChange={setShotPower}
          onShoot={handleShoot}
          onSpinChange={(x, y) => setSpin({ x, y })}
          onConfirmBallInHand={handleConfirmBallInHand}
          onEnablePracticeBallInHand={
            matchState.gameMode === 'practice'
              ? () =>
                  setMatchState((m) => ({
                    ...m,
                    phase: 'ball_in_hand',
                    statusMessage: appTRef.current.statusDragCueBall,
                  }))
              : undefined
          }
          onSwitchPracticeDrill={
            matchState.gameMode === 'practice'
              ? (drill) => {
                  lastPracticeDrillRef.current = drill;
                  const balls = createPracticeRack(drill);
                  ballsRef.current = balls;
                  const nextState: MatchState = {
                    ...matchStateRef.current,
                    balls,
                    phase: 'aiming',
                    statusMessage: appTRef.current.statusPracticeDrillLoaded,
                  };
                  setMatchState(nextState);
                  resetAimTowardNearestTarget(nextState);
                }
              : undefined
          }
          showIdealGuide={showPracticeGuide}
          idealShot={practiceIdealShot}
          onToggleIdealGuide={() => setShowPracticeGuide((v) => !v)}
          onAlignToIdealShot={(angle) => handleAimAngleChange(angle)}
          onEndPracticeSession={
            matchState.gameMode === 'practice' ? handleEndPracticeSession : undefined
          }
          onCameraPresetChange={setCameraPreset}
          onCueStyleChange={(cue: CueStyleId) =>
            updateSaveData((s) => ({ ...s, selectedCue: cue }))
          }
          onTableClothChange={(cloth: TableClothId) =>
            updateSaveData((s) => ({ ...s, selectedTable: cloth }))
          }
          onEnvironmentChange={(env: EnvironmentId) =>
            updateSaveData((s) => ({ ...s, selectedEnvironment: env }))
          }
          onSurfaceStyleChange={(surfaceStyle: TableSurfaceStyleId) =>
            updateSaveData((s) => ({
              ...s,
              settings: { ...s.settings, surfaceStyle },
            }))
          }
          onToggleMute={() =>
            updateSaveData((s) => ({
              ...s,
              settings: { ...s.settings, muted: !s.settings.muted },
            }))
          }
          onRestart={handleRestartMatch}
          onPause={() => setActiveModal('pause')}
          isEditMode={isTrickShotEditMode && matchState.gameMode === 'trick_shot'}
          selectedEditBallId={selectedEditBallId}
          onToggleEditMode={() => {
            setIsTrickShotEditMode((prev) => {
              const next = !prev;
              if (!next) {
                trickShotAnchorBallsRef.current = ballsRef.current.map((b) => ({ ...b }));
                resetAimTowardNearestTarget(matchStateRef.current);
              }
              return next;
            });
          }}
          onSelectEditBall={setSelectedEditBallId}
          onToggleBallOnTable={handleToggleBallOnTable}
          onClearTrickShotTable={handleClearTrickShotTable}
          onResetTrickShot={handleResetTrickShot}
          onOpenTrickShotModal={() => {
            soundEngine.playMenuClick();
            setActiveModal('trick_shot_layouts');
          }}
        />
      )}

      {/* Modals */}
      {(activeModal === 'setup_ai' ||
        activeModal === 'setup_local' ||
        activeModal === 'setup_practice' ||
        activeModal === 'setup_trick_shot') && (
        <GameSetupModal
          mode={
            activeModal === 'setup_ai'
              ? 'ai'
              : activeModal === 'setup_local'
                ? 'local'
                : activeModal === 'setup_trick_shot'
                  ? 'trick_shot'
                  : 'practice'
          }
          defaultNickname={saveData.nickname}
          selectedEnvironment={saveData.selectedEnvironment}
          selectedTable={saveData.selectedTable}
          selectedSurfaceStyle={saveData.settings.surfaceStyle}
          savedTrickShotLayouts={saveData.trickShotLayouts}
          onChangeEnvironment={(env) =>
            updateSaveData((s) => ({ ...s, selectedEnvironment: env }))
          }
          onChangeTable={(cloth) =>
            updateSaveData((s) => ({ ...s, selectedTable: cloth }))
          }
          onChangeSurfaceStyle={(surfaceStyle) =>
            updateSaveData((s) => ({
              ...s,
              settings: { ...s.settings, surfaceStyle },
            }))
          }
          onStart={startMatch}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'trick_shot_layouts' && (
        <TrickShotModal
          currentBalls={matchState.balls}
          currentShot={{
            angle: aimAngleRef.current,
            power: shotPower,
            spinX: spin.x,
            spinY: spin.y,
          }}
          savedLayouts={saveData.trickShotLayouts}
          onSaveLayout={handleSaveTrickShotLayout}
          onLoadLayout={handleLoadTrickShotLayout}
          onDeleteLayout={(id) => updateSaveData((s) => deleteTrickShotLayout(s, id))}
          onImportLayout={handleImportTrickShotLayout}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'online' && (
        <OnlineLobbyModal
          saveData={saveData}
          connected={onlineConnected}
          players={onlinePlayers}
          publicRooms={publicRooms}
          activeRoom={activeRoom}
          isQueuing={isQueuing}
          pendingInvite={pendingInvite}
          errorMsg={onlineError}
          onConnect={connectMultiplayer}
          onAcceptInvite={(code) => {
            multiplayerClient.joinRoom(code);
            setPendingInvite(null);
          }}
          onDismissInvite={() => setPendingInvite(null)}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'profile' && (
        <ProfileModal
          saveData={saveData}
          onUpdateProfile={(nickname, avatarColor) =>
            updateSaveData((s) => ({ ...s, nickname, avatarColor }))
          }
          onImportSave={(imported) => {
            setSaveData(imported);
            soundEngine.updateSettings(imported.settings);
          }}
          onResetSave={() => {
            const fresh = resetSaveData();
            setSaveData(fresh);
            soundEngine.updateSettings(fresh.settings);
          }}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'settings' && (
        <SettingsModal
          settings={saveData.settings}
          selectedCue={saveData.selectedCue}
          selectedTable={saveData.selectedTable}
          selectedEnvironment={saveData.selectedEnvironment}
          onUpdateSettings={(nextSettings: GameSettings) =>
            updateSaveData((s) => ({ ...s, settings: nextSettings }))
          }
          onChangeCue={(cue) => updateSaveData((s) => ({ ...s, selectedCue: cue }))}
          onChangeTable={(cloth) => updateSaveData((s) => ({ ...s, selectedTable: cloth }))}
          onChangeEnvironment={(env) =>
            updateSaveData((s) => ({ ...s, selectedEnvironment: env }))
          }
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'daily_challenge' && (
        <DailyChallengeModal
          saveData={saveData}
          onStartChallenge={(dateKey, challenge) =>
            startMatch({
              gameMode: 'daily_challenge',
              playMode: 'daily_challenge',
              player1Name: saveData.nickname,
              player2Name: 'Daily Challenge',
              dailyChallenge: { dateKey, def: challenge },
            })
          }
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'practice_summary' && (
        <PracticeSummaryModal
          session={practiceSession}
          careerPots={saveData.practiceStats.potHistory}
          careerShots={saveData.practiceStats.shotsTaken}
          careerPocketed={saveData.practiceStats.ballsPocketed}
          careerBestStreak={saveData.practiceStats.bestStreak}
          tableCloth={saveData.selectedTable}
          onContinuePractice={() => setActiveModal('none')}
          onRestartPractice={() => {
            setActiveModal('none');
            handleRestartMatch();
          }}
          onExitToMenu={handleExitToMenu}
        />
      )}

      {!isReplaying &&
        (activeModal === 'pause' || (screen === 'playing' && matchState.phase === 'game_over')) && (
          <PauseVictoryModal
            mode={matchState.phase === 'game_over' ? 'game_over' : 'pause'}
            matchState={matchState}
            newlyUnlockedAchievements={newlyUnlocked}
            dailyRewardSummary={dailyRewardSummary}
            hasReplay={Boolean(lastReplay && matchState.phase !== 'shooting')}
            onStartReplay={startReplay}
            onEndPracticeSession={
              matchState.gameMode === 'practice' ? handleEndPracticeSession : undefined
            }
            onResume={() => setActiveModal('none')}
            onRestart={() => {
              setActiveModal('none');
              handleRestartMatch();
            }}
            onOpenSettings={() => setActiveModal('settings')}
            onExitToMenu={handleExitToMenu}
          />
        )}
      </div>
    </I18nProvider>
  );
}
