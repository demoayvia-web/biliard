import {
  BALL_DIAMETER,
  BALL_RADIUS,
  BALL_REST_Y,
  FOOT_SPOT_X,
  HALF_LENGTH,
  HALF_WIDTH,
  HEAD_STRING_X,
  POCKETS,
} from './constants.ts';
import type {
  AIDifficulty,
  BallState,
  DailyChallengeDef,
  GameMode,
  MatchState,
  PlayerGroup,
  PlayMode,
  ShotOutcomeSummary,
  TrickShotLayout,
} from './types.ts';

function makeBall(id: number, x: number, z: number, pocketed = false): BallState {
  return {
    id,
    x,
    y: BALL_REST_Y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    wx: 0,
    wy: 0,
    wz: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    pocketed,
  };
}

export function createEightBallRack(): BallState[] {
  const balls: BallState[] = [makeBall(0, HEAD_STRING_X, 0)];
  const r = BALL_RADIUS * 1.005;
  const rowDx = Math.sqrt(3) * r;
  const startX = FOOT_SPOT_X;

  // Classic 8-ball rack: 8 in center (row 2, col 1), opposite corners are solid (1..7) and stripe (9..15)
  const solids = [1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5);
  const stripes = [9, 10, 11, 12, 13, 14, 15].sort(() => Math.random() - 0.5);

  const cornerA = solids.pop()!;
  const cornerB = stripes.pop()!;
  const remaining = [...solids, ...stripes].sort(() => Math.random() - 0.5);

  let idx = 0;
  for (let row = 0; row < 5; row++) {
    const x = startX + row * rowDx;
    for (let col = 0; col <= row; col++) {
      const z = (col - row / 2) * (r * 2);
      let id: number;
      if (row === 2 && col === 1) {
        id = 8;
      } else if (row === 4 && col === 0) {
        id = cornerA;
      } else if (row === 4 && col === 4) {
        id = cornerB;
      } else {
        id = remaining[idx++];
      }
      balls.push(makeBall(id, x, z));
    }
  }
  return balls;
}

export function createNineBallRack(): BallState[] {
  const balls: BallState[] = [makeBall(0, HEAD_STRING_X, 0)];
  const r = BALL_RADIUS * 1.005;
  const rowDx = Math.sqrt(3) * r;
  const startX = FOOT_SPOT_X - rowDx * 0.5;

  // Diamond 1-9-ball pattern: 1 at apex, 9 in center
  const middle = [2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5);
  const diamondCoords: Array<[number, number, number]> = [
    [0, 0, 1], // apex
    [1, -r, middle[0]],
    [1, r, middle[1]],
    [2, -2 * r, middle[2]],
    [2, 0, 9], // 9-ball center
    [2, 2 * r, middle[3]],
    [3, -r, middle[4]],
    [3, r, middle[5]],
    [4, 0, middle[6]],
  ];

  for (const [row, z, id] of diamondCoords) {
    balls.push(makeBall(id, startX + row * rowDx, z));
  }
  return balls;
}

export type PracticeDrillId = 'full_rack' | 'nine_rack' | 'lineup' | 'cut_shots';

export function createPracticeRack(drill: PracticeDrillId = 'full_rack'): BallState[] {
  if (drill === 'nine_rack') {
    return createNineBallRack();
  }
  if (drill === 'lineup') {
    const balls: BallState[] = [makeBall(0, -0.75, 0)];
    for (let i = 1; i <= 7; i++) {
      balls.push(makeBall(i, -0.35 + (i - 1) * 0.18, (i % 2 === 0 ? 0.14 : -0.14)));
    }
    return balls;
  }
  if (drill === 'cut_shots') {
    return [
      makeBall(0, -0.5, 0.15),
      makeBall(1, 0.45, -0.22),
      makeBall(2, 0.72, 0.28),
      makeBall(3, 0.12, 0.36),
      makeBall(9, 0.85, -0.38),
      makeBall(8, 0.0, 0.0),
    ];
  }
  return createEightBallRack();
}

export const BUILTIN_TRICK_SHOTS: TrickShotLayout[] = [
  {
    id: 'builtin_rail_bank',
    name: 'Rail Kiss Bank',
    description: 'Cue ball draw into a side-rail bank for the 8-ball corner pocket.',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    balls: [
      { id: 0, x: -0.58, z: 0.22 },
      { id: 1, x: 0.14, z: -0.34 },
      { id: 8, x: 0.56, z: 0.14 },
      { id: 9, x: 0.88, z: -0.36 },
    ],
    suggestedShot: {
      angle: -0.66,
      power: 0.72,
      spinX: 0.35,
      spinY: -0.45,
    },
  },
  {
    id: 'builtin_combo_cluster',
    name: '3-Ball Rail Combo',
    description: 'Cluster carom near the foot spot with corner & side pocket lines.',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    balls: [
      { id: 0, x: -0.72, z: -0.1 },
      { id: 2, x: 0.32, z: -0.05 },
      { id: 5, x: 0.38, z: 0.02 },
      { id: 9, x: 0.92, z: 0.34 },
      { id: 11, x: 0.05, z: -0.44 },
    ],
  },
  {
    id: 'builtin_clean_sandbox',
    name: 'Clean Sandbox (Cue + 1 & 9)',
    description: 'Minimal 3-ball setup ready for dragging and adding more balls.',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    balls: [
      { id: 0, x: -0.55, z: 0 },
      { id: 1, x: 0.28, z: -0.12 },
      { id: 9, x: 0.65, z: 0.18 },
    ],
  },
];

export function ballsFromTrickShotLayout(layout: TrickShotLayout): BallState[] {
  const margin = BALL_RADIUS + 0.006;
  const poseMap = new Map<number, { x: number; z: number }>();
  for (const p of layout.balls) {
    if (p.id >= 0 && p.id <= 15 && Number.isFinite(p.x) && Number.isFinite(p.z)) {
      const cx = Math.max(-HALF_LENGTH + margin, Math.min(HALF_LENGTH - margin, p.x));
      const cz = Math.max(-HALF_WIDTH + margin, Math.min(HALF_WIDTH - margin, p.z));
      poseMap.set(p.id, { x: cx, z: cz });
    }
  }
  // Always ensure cue ball (#0) is on the table
  if (!poseMap.has(0)) {
    poseMap.set(0, { x: HEAD_STRING_X, z: 0 });
  }

  const result: BallState[] = [];
  for (let id = 0; id <= 15; id++) {
    const pos = poseMap.get(id);
    if (pos) {
      result.push(makeBall(id, pos.x, pos.z, false));
    } else {
      result.push(makeBall(id, 0, 0, true));
    }
  }
  return result;
}

export function createInitialMatchState(opts: {
  gameMode: GameMode;
  playMode: PlayMode;
  player1Name: string;
  player2Name: string;
  aiDifficulty?: AIDifficulty;
  practiceDrill?: PracticeDrillId;
  initialBalls?: BallState[];
  dailyChallenge?: { dateKey: string; def: DailyChallengeDef };
}): MatchState {
  let balls: BallState[];
  if (opts.initialBalls) {
    balls = opts.initialBalls.map((b) => ({ ...b }));
  } else if (opts.gameMode === 'daily_challenge' && opts.dailyChallenge) {
    balls = ballsFromTrickShotLayout({
      id: opts.dailyChallenge.def.id,
      name: opts.dailyChallenge.def.title,
      balls: opts.dailyChallenge.def.balls,
      createdAt: '',
    });
  } else if (opts.gameMode === '9-ball') {
    balls = createNineBallRack();
  } else if (opts.gameMode === 'practice') {
    balls = createPracticeRack(opts.practiceDrill ?? 'full_rack');
  } else if (opts.gameMode === 'trick_shot') {
    balls = ballsFromTrickShotLayout(BUILTIN_TRICK_SHOTS[0]);
  } else {
    balls = createEightBallRack();
  }

  const isSandbox =
    opts.gameMode === 'practice' ||
    opts.gameMode === 'trick_shot' ||
    opts.gameMode === 'daily_challenge';

  const dc = opts.dailyChallenge;

  return {
    gameMode: opts.gameMode,
    playMode: opts.playMode,
    phase: 'aiming',
    turnIndex: 0,
    players: [
      {
        id: 'p1',
        name: opts.player1Name || 'Player 1',
        isAI: false,
        group: null,
        foulsInRow: 0,
        ballsPocketed: 0,
      },
      {
        id: 'p2',
        name: opts.player2Name || (opts.playMode === 'ai' ? 'AI Opponent' : 'Player 2'),
        isAI: opts.playMode === 'ai',
        aiDifficulty: opts.aiDifficulty,
        group: null,
        foulsInRow: 0,
        ballsPocketed: 0,
      },
    ],
    balls,
    isBreakShot: !isSandbox,
    openTable: opts.gameMode === '8-ball',
    shotNumber: 1,
    lastFoul: null,
    statusMessage:
      opts.gameMode === 'daily_challenge' && dc
        ? `${dc.def.title} · ${dc.def.maxShots} ${dc.def.maxShots === 1 ? 'shot' : 'shots'} allowed`
        : opts.gameMode === 'trick_shot'
          ? 'Trick Shot Sandbox — Edit table or shoot'
          : opts.gameMode === 'practice'
            ? 'Practice Table Ready — Line up your shot'
            : `${opts.player1Name || 'Player 1'} to break`,
    winnerIndex: null,
    winReason: null,
    dailyChallenge:
      opts.gameMode === 'daily_challenge' && dc
        ? {
            dateKey: dc.dateKey,
            challengeId: dc.def.id,
            title: dc.def.title,
            category: dc.def.category,
            difficulty: dc.def.difficulty,
            objectiveLabel: dc.def.objectiveLabel,
            hint: dc.def.hint,
            maxShots: dc.def.maxShots,
            shotsTaken: 0,
            xpReward: dc.def.xpReward,
            requireRailBeforePot: dc.def.requireRailBeforePot,
            completed: false,
            failed: false,
          }
        : undefined,
  };
}

export function isSolid(id: number): boolean {
  return id >= 1 && id <= 7;
}

export function isStripe(id: number): boolean {
  return id >= 9 && id <= 15;
}

export function getLowestBallId(balls: BallState[]): number | null {
  let lowest: number | null = null;
  for (const b of balls) {
    if (b.id > 0 && !b.pocketed) {
      if (lowest === null || b.id < lowest) lowest = b.id;
    }
  }
  return lowest;
}

export function getLegalTargetBallIds(state: MatchState): number[] {
  const active = state.balls.filter((b) => b.id > 0 && !b.pocketed);
  if (
    state.gameMode === 'practice' ||
    state.gameMode === 'trick_shot' ||
    state.gameMode === 'daily_challenge'
  ) {
    return active.map((b) => b.id);
  }
  if (state.gameMode === '9-ball') {
    const lowest = getLowestBallId(state.balls);
    return lowest !== null ? [lowest] : [];
  }
  // 8-ball
  const player = state.players[state.turnIndex];
  if (state.openTable || !player.group) {
    return active.filter((b) => b.id !== 8).map((b) => b.id);
  }
  const groupBalls = active.filter((b) =>
    player.group === 'solids' ? isSolid(b.id) : isStripe(b.id),
  );
  if (groupBalls.length > 0) {
    return groupBalls.map((b) => b.id);
  }
  // All group balls cleared -> 8-ball is the legal target!
  return active.some((b) => b.id === 8) ? [8] : [];
}

export function isValidBallInHandPosition(
  x: number,
  z: number,
  balls: BallState[],
  behindHeadStringOnly = false,
): boolean {
  const margin = BALL_RADIUS + 0.004;
  if (x < -HALF_LENGTH + margin || x > HALF_LENGTH - margin) return false;
  if (z < -HALF_WIDTH + margin || z > HALF_WIDTH - margin) return false;
  if (behindHeadStringOnly && x > HEAD_STRING_X) return false;

  const minDist = BALL_DIAMETER + 0.002;
  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    if (Math.hypot(x - b.x, z - b.z) < minDist) return false;
  }
  return true;
}

export function isValidTrickShotBallPosition(
  ballId: number,
  x: number,
  z: number,
  balls: BallState[],
): boolean {
  const margin = BALL_RADIUS + 0.004;
  if (x < -HALF_LENGTH + margin || x > HALF_LENGTH - margin) return false;
  if (z < -HALF_WIDTH + margin || z > HALF_WIDTH - margin) return false;

  const minDist = BALL_DIAMETER + 0.002;
  for (const b of balls) {
    if (b.id === ballId || b.pocketed) continue;
    if (Math.hypot(x - b.x, z - b.z) < minDist) return false;
  }
  return true;
}

export function findSafeTrickShotSpot(
  balls: BallState[],
  excludeBallId = -1,
): { x: number; z: number } {
  const step = 0.07;
  for (let gx = 0; gx <= HALF_LENGTH - BALL_RADIUS - 0.04; gx += step) {
    for (let gz = 0; gz <= HALF_WIDTH - BALL_RADIUS - 0.04; gz += step) {
      if (isValidTrickShotBallPosition(excludeBallId, gx, gz, balls)) return { x: gx, z: gz };
      if (gz > 0 && isValidTrickShotBallPosition(excludeBallId, gx, -gz, balls)) return { x: gx, z: -gz };
      if (gx > 0 && isValidTrickShotBallPosition(excludeBallId, -gx, gz, balls)) return { x: -gx, z: gz };
      if (gx > 0 && gz > 0 && isValidTrickShotBallPosition(excludeBallId, -gx, -gz, balls)) return { x: -gx, z: -gz };
    }
  }
  return { x: 0, z: 0 };
}

export function findSafeCueBallSpot(balls: BallState[], behindHeadStringOnly = false): { x: number; z: number } {
  const startX = behindHeadStringOnly ? HEAD_STRING_X - 0.15 : HEAD_STRING_X;
  if (isValidBallInHandPosition(startX, 0, balls, behindHeadStringOnly)) {
    return { x: startX, z: 0 };
  }
  const minX = -HALF_LENGTH + BALL_RADIUS + 0.03;
  const maxX = behindHeadStringOnly ? HEAD_STRING_X - 0.01 : HALF_LENGTH - BALL_RADIUS - 0.03;
  for (let gx = startX; gx >= minX; gx -= 0.06) {
    for (let gz = 0; gz <= HALF_WIDTH - BALL_RADIUS - 0.03; gz += 0.06) {
      if (isValidBallInHandPosition(gx, gz, balls, behindHeadStringOnly)) return { x: gx, z: gz };
      if (isValidBallInHandPosition(gx, -gz, balls, behindHeadStringOnly)) return { x: gx, z: -gz };
    }
  }
  for (let gx = startX; gx <= maxX; gx += 0.06) {
    for (let gz = 0; gz <= HALF_WIDTH - BALL_RADIUS - 0.03; gz += 0.06) {
      if (isValidBallInHandPosition(gx, gz, balls, behindHeadStringOnly)) return { x: gx, z: gz };
      if (isValidBallInHandPosition(gx, -gz, balls, behindHeadStringOnly)) return { x: gx, z: -gz };
    }
  }
  return { x: HEAD_STRING_X, z: 0 };
}

export interface PracticeIdealShot {
  targetBallId: number;
  pocketIndex: number;
  pocketLabel: string;
  ghostX: number;
  ghostZ: number;
  targetX: number;
  targetZ: number;
  pocketX: number;
  pocketZ: number;
  idealAngle: number;
  cutAngleDeg: number;
  angleErrorDeg: number;
}

const POCKET_LABELS: Record<number, string> = {
  0: 'Top-Left Corner',
  1: 'Top Side',
  2: 'Top-Right Corner',
  3: 'Bottom-Left Corner',
  4: 'Bottom Side',
  5: 'Bottom-Right Corner',
};

function pointToSegDist(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { dist: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-9) return { dist: Math.hypot(px - ax, pz - az), t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return { dist: Math.hypot(px - (ax + t * dx), pz - (az + t * dz)), t };
}

function isSegmentClear(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  balls: BallState[],
  ignoreIds: Set<number>,
): boolean {
  const clearance = BALL_DIAMETER * 1.02;
  for (const b of balls) {
    if (b.pocketed || ignoreIds.has(b.id)) continue;
    const { dist, t } = pointToSegDist(b.x, b.z, ax, az, bx, bz);
    if (t > 0.01 && t < 0.99 && dist < clearance) {
      return false;
    }
  }
  return true;
}

/**
 * Computes the ideal ghost-ball aiming solution for Practice mode,
 * prioritizing the object ball closest to the player's current aim line
 * (or the cleanest overall pot on the table if aiming away from balls).
 */
export function computePracticeIdealShot(
  balls: BallState[],
  currentAimAngle: number,
): PracticeIdealShot | null {
  const cue = balls.find((b) => b.id === 0);
  if (!cue || cue.pocketed) return null;

  const margin = BALL_RADIUS + 0.008;
  let bestScore = -Infinity;
  let best: PracticeIdealShot | null = null;

  for (const target of balls) {
    if (target.id === 0 || target.pocketed) continue;

    for (const pocket of POCKETS) {
      const tpX = pocket.x - target.x;
      const tpZ = pocket.z - target.z;
      const tpDist = Math.hypot(tpX, tpZ);
      if (tpDist < 0.02) continue;

      const uTpX = tpX / tpDist;
      const uTpZ = tpZ / tpDist;

      const ghostX = target.x - uTpX * BALL_DIAMETER;
      const ghostZ = target.z - uTpZ * BALL_DIAMETER;

      if (
        ghostX < -HALF_LENGTH + margin ||
        ghostX > HALF_LENGTH - margin ||
        ghostZ < -HALF_WIDTH + margin ||
        ghostZ > HALF_WIDTH - margin
      ) {
        continue;
      }

      const cgX = ghostX - cue.x;
      const cgZ = ghostZ - cue.z;
      const cgDist = Math.hypot(cgX, cgZ);
      if (cgDist < 0.01) continue;

      const uCgX = cgX / cgDist;
      const uCgZ = cgZ / cgDist;

      const cosCut = uCgX * uTpX + uCgZ * uTpZ;
      if (cosCut < 0.2) continue;

      const ignoreIds = new Set([0, target.id]);
      if (!isSegmentClear(cue.x, cue.z, ghostX, ghostZ, balls, ignoreIds)) continue;
      if (!isSegmentClear(target.x, target.z, pocket.x, pocket.z, balls, ignoreIds)) continue;

      const idealAngle = Math.atan2(cgZ, cgX);
      const diffRad = Math.atan2(
        Math.sin(currentAimAngle - idealAngle),
        Math.cos(currentAimAngle - idealAngle),
      );
      const absDiff = Math.abs(diffRad);

      // Strongly prefer shots near the player's current aim direction so moving the cue explores shots
      const aimBias = absDiff < 0.55 ? (1 - absDiff / 0.55) * 4.2 : 0;
      const pocketBonus = pocket.isCorner ? 1.12 : 0.95;
      const distPenalty = (cgDist + tpDist * 1.1) * 0.4;
      const score = cosCut * 2.8 * pocketBonus - distPenalty + aimBias;

      if (score > bestScore) {
        bestScore = score;
        const cutAngleDeg = Math.round(
          (Math.acos(Math.max(-1, Math.min(1, cosCut))) * 180) / Math.PI,
        );
        const angleErrorDeg = Number(((diffRad * 180) / Math.PI).toFixed(1));
        best = {
          targetBallId: target.id,
          pocketIndex: pocket.index,
          pocketLabel: POCKET_LABELS[pocket.index] ?? `Pocket ${pocket.index + 1}`,
          ghostX,
          ghostZ,
          targetX: target.x,
          targetZ: target.z,
          pocketX: pocket.x,
          pocketZ: pocket.z,
          idealAngle,
          cutAngleDeg,
          angleErrorDeg,
        };
      }
    }
  }

  return best;
}

/**
 * Evaluates a completed shot against official 8-Ball, 9-Ball, or Practice rules.
 */
export function evaluateShotOutcome(
  prevState: MatchState,
  newBalls: BallState[],
  summary: ShotOutcomeSummary,
): MatchState {
  const next: MatchState = {
    ...prevState,
    players: [
      { ...prevState.players[0] },
      { ...prevState.players[1] },
    ],
    balls: newBalls.map((b) => ({ ...b })),
    shotNumber: prevState.shotNumber + 1,
    lastFoul: null,
  };

  const currIdx = prevState.turnIndex;
  const oppIdx: 0 | 1 = currIdx === 0 ? 1 : 0;
  const currPlayer = next.players[currIdx];
  const oppPlayer = next.players[oppIdx];

  // Daily Challenge rules: clear all object balls within maxShots, zero scratches
  if (prevState.gameMode === 'daily_challenge' && prevState.dailyChallenge) {
    const dc = {
      ...prevState.dailyChallenge,
      shotsTaken: prevState.dailyChallenge.shotsTaken + 1,
    };
    currPlayer.ballsPocketed += summary.pocketedBallIds.length;
    const remainingObjects = next.balls.filter((b) => b.id > 0 && !b.pocketed);
    const shotsLeft = Math.max(0, dc.maxShots - dc.shotsTaken);

    if (summary.cueBallPocketed) {
      dc.failed = true;
      next.dailyChallenge = dc;
      next.phase = 'game_over';
      next.winnerIndex = null;
      next.lastFoul = 'Cue ball scratched';
      next.winReason = 'Cue ball scratched during the Daily Challenge.';
      next.statusMessage = 'Challenge Failed — Cue ball scratched';
      return next;
    }

    if (remainingObjects.length === 0) {
      if (dc.requireRailBeforePot && summary.totalRailContacts < 1) {
        dc.failed = true;
        next.dailyChallenge = dc;
        next.phase = 'game_over';
        next.winnerIndex = null;
        next.lastFoul = 'No cushion contact';
        next.winReason = 'This challenge requires a cushion bank or kick shot.';
        next.statusMessage = 'Challenge Failed — Cushion contact required';
        return next;
      }

      dc.completed = true;
      next.dailyChallenge = dc;
      next.phase = 'game_over';
      next.winnerIndex = 0;
      next.winReason = `Cleared "${dc.title}" in ${dc.shotsTaken} of ${dc.maxShots} ${
        dc.maxShots === 1 ? 'shot' : 'shots'
      }!`;
      next.statusMessage = 'Daily Challenge Complete!';
      return next;
    }

    if (shotsLeft <= 0) {
      dc.failed = true;
      next.dailyChallenge = dc;
      next.phase = 'game_over';
      next.winnerIndex = null;
      next.winReason = `Used all ${dc.maxShots} ${
        dc.maxShots === 1 ? 'shot' : 'shots'
      } with ${remainingObjects.length} ${remainingObjects.length === 1 ? 'ball' : 'balls'} left.`;
      next.statusMessage = 'Out of shots — Retry Challenge!';
      return next;
    }

    next.dailyChallenge = dc;
    next.phase = 'aiming';
    next.statusMessage = `${shotsLeft} ${shotsLeft === 1 ? 'shot' : 'shots'} left · ${
      remainingObjects.length
    } ${remainingObjects.length === 1 ? 'ball' : 'balls'} remaining`;
    return next;
  }

  // Trick Shot sandbox mode: track pocketed balls, respawn cue ball cleanly if scratched, keep sandbox ready
  if (prevState.gameMode === 'trick_shot') {
    currPlayer.ballsPocketed += summary.pocketedBallIds.length;
    if (summary.cueBallPocketed) {
      const spot = findSafeCueBallSpot(next.balls, false);
      const cue = next.balls.find((b) => b.id === 0);
      if (cue) {
        cue.pocketed = false;
        cue.x = spot.x;
        cue.y = BALL_REST_Y;
        cue.z = spot.z;
      }
      next.phase = 'aiming';
      next.lastFoul = 'Cue ball pocketed';
      next.statusMessage = 'Cue ball scratched — Click Reset Shot or Edit Table to retry';
    } else if (summary.pocketedBallIds.length > 0) {
      next.statusMessage = `Sunk ${summary.pocketedBallIds.map((id) => `#${id}`).join(', ')} — Reset Shot to retry or Replay`;
      next.phase = 'aiming';
    } else {
      next.statusMessage = 'Shot complete — Reset Shot, Replay, or Edit Table';
      next.phase = 'aiming';
    }
    return next;
  }

  // Practice mode: never lose, respawn cue ball if scratched, reset rack if all cleared
  if (prevState.gameMode === 'practice') {
    currPlayer.ballsPocketed += summary.pocketedBallIds.length;
    if (summary.cueBallPocketed) {
      const spot = findSafeCueBallSpot(next.balls, false);
      const cue = next.balls.find((b) => b.id === 0);
      if (cue) {
        cue.pocketed = false;
        cue.x = spot.x;
        cue.y = BALL_REST_Y;
        cue.z = spot.z;
      }
      next.phase = 'ball_in_hand';
      next.lastFoul = 'Cue ball scratched';
      next.statusMessage = 'Scratch — Place cue ball anywhere';
    } else {
      const remaining = next.balls.filter((b) => b.id > 0 && !b.pocketed);
      if (remaining.length === 0) {
        next.balls = createPracticeRack('full_rack');
        next.statusMessage = 'Table cleared! Fresh rack set.';
      } else if (summary.pocketedBallIds.length > 0) {
        next.statusMessage = `Pocketed ${summary.pocketedBallIds.map((id) => `#${id}`).join(', ')}`;
      } else {
        next.statusMessage = 'Practice shot complete';
      }
      next.phase = 'aiming';
    }
    return next;
  }

  // 9-BALL RULES
  if (prevState.gameMode === '9-ball') {
    const lowestBefore = getLowestBallId(prevState.balls);
    let foulReason: string | null = null;

    if (summary.cueBallPocketed) {
      foulReason = 'Scratch: Cue ball pocketed';
    } else if (summary.firstContactBallId === null) {
      foulReason = 'Foul: Cue ball missed all object balls';
    } else if (lowestBefore !== null && summary.firstContactBallId !== lowestBefore) {
      foulReason = `Foul: Must strike lowest ball (#${lowestBefore}) first`;
    } else if (
      summary.pocketedBallIds.length === 0 &&
      summary.railContactsAfterFirstHit === 0 &&
      !prevState.isBreakShot
    ) {
      foulReason = 'Foul: No rail contact or ball pocketed after hit';
    } else if (prevState.isBreakShot && summary.pocketedBallIds.length === 0 && summary.totalRailContacts < 4) {
      foulReason = 'Foul: Illegal break (fewer than 4 cushions)';
    }

    const ninePocketed = summary.pocketedBallIds.includes(9);

    if (foulReason) {
      currPlayer.foulsInRow += 1;
      // If 9-ball was pocketed on a foul, re-spot 9-ball on foot spot!
      if (ninePocketed) {
        const ball9 = next.balls.find((b) => b.id === 9);
        if (ball9) {
          ball9.pocketed = false;
          ball9.x = FOOT_SPOT_X;
          ball9.y = BALL_REST_Y;
          ball9.z = 0;
        }
      }

      if (currPlayer.foulsInRow >= 3) {
        next.phase = 'game_over';
        next.winnerIndex = oppIdx;
        next.winReason = `${currPlayer.name} committed 3 consecutive fouls`;
        next.statusMessage = `${oppPlayer.name} wins by 3-foul rule!`;
        return next;
      }

      // Respawn cue ball for opponent ball-in-hand
      const cue = next.balls.find((b) => b.id === 0);
      if (cue) {
        const spot = findSafeCueBallSpot(next.balls, false);
        cue.pocketed = false;
        cue.x = spot.x;
        cue.y = BALL_REST_Y;
        cue.z = spot.z;
      }

      next.isBreakShot = false;
      next.turnIndex = oppIdx;
      next.phase = 'ball_in_hand';
      next.lastFoul = foulReason;
      next.statusMessage = `${foulReason} — ${oppPlayer.name} gets ball in hand`;
      return next;
    }

    // Legal shot in 9-ball
    currPlayer.foulsInRow = 0;
    currPlayer.ballsPocketed += summary.pocketedBallIds.length;
    next.isBreakShot = false;

    if (ninePocketed) {
      next.phase = 'game_over';
      next.winnerIndex = currIdx;
      next.winReason = prevState.isBreakShot
        ? '9-Ball pocketed on a legal break!'
        : '9-Ball legally pocketed!';
      next.statusMessage = `${currPlayer.name} wins the rack!`;
      return next;
    }

    if (summary.pocketedBallIds.length > 0) {
      next.turnIndex = currIdx;
      next.phase = 'aiming';
      next.statusMessage = `${currPlayer.name} pocketed ${summary.pocketedBallIds.map((i) => `#${i}`).join(', ')} — shoots again`;
    } else {
      next.turnIndex = oppIdx;
      next.phase = 'aiming';
      next.statusMessage = `${oppPlayer.name}'s turn`;
    }
    return next;
  }

  // 8-BALL RULES
  const legalTargetsBefore = getLegalTargetBallIds(prevState);
  const eightPocketed = summary.pocketedBallIds.includes(8);
  let foulReason: string | null = null;

  if (summary.cueBallPocketed) {
    foulReason = 'Scratch: Cue ball pocketed';
  } else if (summary.firstContactBallId === null) {
    foulReason = 'Foul: Cue ball failed to strike any ball';
  } else if (!prevState.isBreakShot && !legalTargetsBefore.includes(summary.firstContactBallId)) {
    foulReason = `Foul: Struck wrong ball (#${summary.firstContactBallId}) first`;
  } else if (
    !prevState.isBreakShot &&
    summary.pocketedBallIds.length === 0 &&
    summary.railContactsAfterFirstHit === 0
  ) {
    foulReason = 'Foul: No rail or pot after contact';
  } else if (
    prevState.isBreakShot &&
    summary.pocketedBallIds.length === 0 &&
    summary.totalRailContacts < 4
  ) {
    foulReason = 'Foul: Weak break (fewer than 4 rails)';
  }

  // Check 8-ball win/loss
  if (eightPocketed) {
    if (prevState.isBreakShot && !foulReason) {
      next.phase = 'game_over';
      next.winnerIndex = currIdx;
      next.winReason = '8-Ball pocketed on a legal break!';
      next.statusMessage = `${currPlayer.name} wins on the break!`;
      return next;
    }

    const wasOnEightBall = legalTargetsBefore.length === 1 && legalTargetsBefore[0] === 8;
    if (wasOnEightBall && !foulReason) {
      next.phase = 'game_over';
      next.winnerIndex = currIdx;
      next.winReason = '8-Ball legally pocketed!';
      next.statusMessage = `${currPlayer.name} wins the match!`;
      return next;
    } else {
      next.phase = 'game_over';
      next.winnerIndex = oppIdx;
      next.winReason = foulReason
        ? `Pocketed 8-Ball with foul (${foulReason})`
        : '8-Ball pocketed prematurely';
      next.statusMessage = `${oppPlayer.name} wins!`;
      return next;
    }
  }

  if (foulReason) {
    const cue = next.balls.find((b) => b.id === 0);
    if (cue) {
      const spot = findSafeCueBallSpot(next.balls, prevState.isBreakShot);
      cue.pocketed = false;
      cue.x = spot.x;
      cue.y = BALL_REST_Y;
      cue.z = spot.z;
    }
    next.isBreakShot = false;
    next.turnIndex = oppIdx;
    next.phase = 'ball_in_hand';
    next.lastFoul = foulReason;
    next.statusMessage = `${foulReason} — ${oppPlayer.name} ball in hand`;
    return next;
  }

  // Legal 8-ball shot
  currPlayer.ballsPocketed += summary.pocketedBallIds.length;
  const wasBreak = prevState.isBreakShot;
  next.isBreakShot = false;

  // Group assignment if open table (and not break shot, per WPA standard; or assign on first post-break pot)
  const pocketedSolids = summary.pocketedBallIds.filter(isSolid);
  const pocketedStripes = summary.pocketedBallIds.filter(isStripe);

  if (next.openTable && !wasBreak && summary.pocketedBallIds.length > 0) {
    if (pocketedSolids.length > 0 && pocketedStripes.length === 0) {
      next.openTable = false;
      currPlayer.group = 'solids';
      oppPlayer.group = 'stripes';
    } else if (pocketedStripes.length > 0 && pocketedSolids.length === 0) {
      next.openTable = false;
      currPlayer.group = 'stripes';
      oppPlayer.group = 'solids';
    } else if (pocketedSolids.length > 0 && pocketedStripes.length > 0) {
      // Assign based on first pocketed ball
      const firstId = summary.pocketedBallIds[0];
      const chosenGroup: PlayerGroup = isSolid(firstId) ? 'solids' : 'stripes';
      next.openTable = false;
      currPlayer.group = chosenGroup;
      oppPlayer.group = chosenGroup === 'solids' ? 'stripes' : 'solids';
    }
  }

  // Determine if current player keeps turn
  let keepsTurn = false;
  if (wasBreak) {
    keepsTurn = summary.pocketedBallIds.length > 0;
  } else if (next.openTable) {
    keepsTurn = summary.pocketedBallIds.length > 0;
  } else {
    const myGroup = next.players[currIdx].group;
    keepsTurn = summary.pocketedBallIds.some((id) =>
      myGroup === 'solids' ? isSolid(id) : isStripe(id),
    );
  }

  if (keepsTurn) {
    next.turnIndex = currIdx;
    next.phase = 'aiming';
    const groupNote = !prevState.players[currIdx].group && next.players[currIdx].group
      ? ` (${next.players[currIdx].group === 'solids' ? 'Solids 1–7' : 'Stripes 9–15'})`
      : '';
    next.statusMessage = `${currPlayer.name}${groupNote} pocketed ${summary.pocketedBallIds.map((i) => `#${i}`).join(', ')} — shoots again`;
  } else {
    next.turnIndex = oppIdx;
    next.phase = 'aiming';
    next.statusMessage = `${oppPlayer.name}'s turn`;
  }

  return next;
}
