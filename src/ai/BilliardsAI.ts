import {
  AI_DIFFICULTIES,
  BALL_DIAMETER,
  BALL_RADIUS,
  HALF_LENGTH,
  HALF_WIDTH,
  POCKETS,
} from '../game/constants.ts';
import {
  findSafeCueBallSpot,
  getLegalTargetBallIds,
  isValidBallInHandPosition,
} from '../game/rules.ts';
import type {
  AIDifficulty,
  BallState,
  MatchState,
  ShotParams,
} from '../game/types.ts';

interface CandidateShot {
  angle: number;
  power: number;
  spinX: number;
  spinY: number;
  score: number;
  targetId: number;
}

function pointToSegmentDistance(
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
  const projX = ax + t * dx;
  const projZ = az + t * dz;
  return { dist: Math.hypot(px - projX, pz - projZ), t };
}

function isPathClear(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  balls: BallState[],
  ignoreIds: Set<number>,
  clearanceRadius = BALL_DIAMETER * 1.03,
): boolean {
  for (const b of balls) {
    if (b.pocketed || ignoreIds.has(b.id)) continue;
    const { dist, t } = pointToSegmentDistance(b.x, b.z, ax, az, bx, bz);
    if (t > 0.01 && t < 0.99 && dist < clearanceRadius) {
      return false;
    }
  }
  return true;
}

function isInsideTable(x: number, z: number): boolean {
  const m = BALL_RADIUS + 0.008;
  return (
    x >= -HALF_LENGTH + m &&
    x <= HALF_LENGTH - m &&
    z >= -HALF_WIDTH + m &&
    z <= HALF_WIDTH - m
  );
}

/**
 * Evaluates all direct pot shots for a given cue position and returns the best candidate.
 */
function findBestDirectPot(
  cueX: number,
  cueZ: number,
  balls: BallState[],
  legalIds: number[],
): CandidateShot | null {
  let best: CandidateShot | null = null;
  const ballMap = new Map(balls.map((b) => [b.id, b]));

  for (const targetId of legalIds) {
    const target = ballMap.get(targetId);
    if (!target || target.pocketed) continue;

    for (const pocket of POCKETS) {
      // Vector from target to pocket
      const tpX = pocket.x - target.x;
      const tpZ = pocket.z - target.z;
      const tpDist = Math.hypot(tpX, tpZ);
      if (tpDist < 0.02) continue;

      const uTpX = tpX / tpDist;
      const uTpZ = tpZ / tpDist;

      // Ghost ball center where cue ball must strike target
      const ghostX = target.x - uTpX * BALL_DIAMETER;
      const ghostZ = target.z - uTpZ * BALL_DIAMETER;

      if (!isInsideTable(ghostX, ghostZ)) continue;

      // Vector from cue ball to ghost ball
      const cgX = ghostX - cueX;
      const cgZ = ghostZ - cueZ;
      const cgDist = Math.hypot(cgX, cgZ);
      if (cgDist < 0.01) continue;

      const uCgX = cgX / cgDist;
      const uCgZ = cgZ / cgDist;

      // Cut angle cosine between cue->ghost and target->pocket
      const cosCut = uCgX * uTpX + uCgZ * uTpZ;
      if (cosCut < 0.22) continue; // > ~77 degree cut is too thin

      const ignoreCueAndTarget = new Set([0, targetId]);
      if (!isPathClear(cueX, cueZ, ghostX, ghostZ, balls, ignoreCueAndTarget)) continue;
      if (!isPathClear(target.x, target.z, pocket.x, pocket.z, balls, ignoreCueAndTarget)) continue;

      // Score candidate: prefer straighter cuts, shorter distances, corner pockets
      const pocketBonus = pocket.isCorner ? 1.15 : 0.95;
      const distPenalty = (cgDist + tpDist * 1.15) * 0.45;
      const score = (cosCut * 3.0 * pocketBonus) - distPenalty;

      // Ideal power scales with total travel distance and cut thinness
      const basePower = Math.min(0.88, Math.max(0.24, (cgDist + tpDist) * 0.22 + (1 - cosCut) * 0.25));

      // Subtle follow or draw depending on cut angle
      let spinY = 0;
      if (cosCut > 0.85 && tpDist < 0.8) {
        spinY = 0.25;
      }

      if (!best || score > best.score) {
        best = {
          angle: Math.atan2(cgZ, cgX),
          power: basePower,
          spinX: 0,
          spinY,
          score,
          targetId,
        };
      }
    }
  }

  return best;
}

/**
 * Evaluates 1-ball combination / carom shots if no direct pot is available.
 */
function findBestComboShot(
  cueX: number,
  cueZ: number,
  balls: BallState[],
  legalIds: number[],
): CandidateShot | null {
  let best: CandidateShot | null = null;
  const ballMap = new Map(balls.map((b) => [b.id, b]));
  const otherActive = balls.filter((b) => b.id > 0 && !b.pocketed);

  for (const firstId of legalIds) {
    const first = ballMap.get(firstId);
    if (!first || first.pocketed) continue;

    for (const second of otherActive) {
      if (second.id === firstId) continue;
      // Avoid potting the 8-ball illegally in 8-ball? Wait: in 8-ball only pot legal balls or non-8.
      for (const pocket of POCKETS) {
        const spX = pocket.x - second.x;
        const spZ = pocket.z - second.z;
        const spDist = Math.hypot(spX, spZ);
        if (spDist < 0.02 || spDist > 1.3) continue;
        const uSpX = spX / spDist;
        const uSpZ = spZ / spDist;

        const ghost2X = second.x - uSpX * BALL_DIAMETER;
        const ghost2Z = second.z - uSpZ * BALL_DIAMETER;
        if (!isInsideTable(ghost2X, ghost2Z)) continue;

        const f2X = ghost2X - first.x;
        const f2Z = ghost2Z - first.z;
        const f2Dist = Math.hypot(f2X, f2Z);
        if (f2Dist < 0.02 || f2Dist > 0.9) continue;
        const uF2X = f2X / f2Dist;
        const uF2Z = f2Z / f2Dist;

        const cos2 = uF2X * uSpX + uF2Z * uSpZ;
        if (cos2 < 0.65) continue;

        const ghost1X = first.x - uF2X * BALL_DIAMETER;
        const ghost1Z = first.z - uF2Z * BALL_DIAMETER;
        if (!isInsideTable(ghost1X, ghost1Z)) continue;

        const c1X = ghost1X - cueX;
        const c1Z = ghost1Z - cueZ;
        const c1Dist = Math.hypot(c1X, c1Z);
        if (c1Dist < 0.02) continue;
        const uC1X = c1X / c1Dist;
        const uC1Z = c1Z / c1Dist;

        const cos1 = uC1X * uF2X + uC1Z * uF2Z;
        if (cos1 < 0.55) continue;

        const ignore = new Set([0, firstId, second.id]);
        if (!isPathClear(cueX, cueZ, ghost1X, ghost1Z, balls, ignore)) continue;
        if (!isPathClear(first.x, first.z, ghost2X, ghost2Z, balls, ignore)) continue;
        if (!isPathClear(second.x, second.z, pocket.x, pocket.z, balls, ignore)) continue;

        const score = (cos1 * cos2 * 1.8) - (c1Dist + f2Dist + spDist) * 0.35;
        if (!best || score > best.score) {
          best = {
            angle: Math.atan2(c1Z, c1X),
            power: Math.min(0.85, Math.max(0.4, (c1Dist + f2Dist + spDist) * 0.25)),
            spinX: 0,
            spinY: 0,
            score,
            targetId: firstId,
          };
        }
      }
    }
  }
  return best;
}

/**
 * Finds a legal contact / defensive shot when no pot is open.
 */
function findDefensiveOrHitShot(
  cueX: number,
  cueZ: number,
  balls: BallState[],
  legalIds: number[],
  safetySkill: number,
): CandidateShot {
  const ballMap = new Map(balls.map((b) => [b.id, b]));
  let bestHit: CandidateShot | null = null;

  for (const id of legalIds) {
    const b = ballMap.get(id);
    if (!b || b.pocketed) continue;

    const dx = b.x - cueX;
    const dz = b.z - cueZ;
    const dist = Math.hypot(dx, dz);
    const ignore = new Set([0, id]);
    const clear = isPathClear(cueX, cueZ, b.x, b.z, balls, ignore, BALL_DIAMETER * 0.96);

    // Try slight left/right edge hit for safety (drives target to rail gently)
    const baseAngle = Math.atan2(dz, dx);
    const score = (clear ? 2.0 : 0.2) - dist * 0.4;
    if (!bestHit || score > bestHit.score) {
      bestHit = {
        angle: baseAngle + (safetySkill > 0.5 ? 0.04 : 0),
        power: safetySkill > 0.5 ? 0.32 : 0.45,
        spinX: 0,
        spinY: safetySkill > 0.5 ? -0.35 : 0,
        score,
        targetId: id,
      };
    }
  }

  if (bestHit) return bestHit;

  // Fallback bank / kick angle
  return {
    angle: 0,
    power: 0.5,
    spinX: 0,
    spinY: 0,
    score: -10,
    targetId: legalIds[0] ?? 1,
  };
}

export class BilliardsAI {
  /**
   * Computes cue ball placement if AI has ball-in-hand.
   */
  public static chooseBallInHandSpot(
    state: MatchState,
    difficulty: AIDifficulty,
  ): { x: number; z: number } {
    const legalIds = getLegalTargetBallIds(state);
    const behindHeadString = state.isBreakShot;

    if (difficulty === 'beginner') {
      return findSafeCueBallSpot(state.balls, behindHeadString);
    }

    let bestSpot = findSafeCueBallSpot(state.balls, behindHeadString);
    let bestScore = -999;

    const maxX = behindHeadString ? -HALF_LENGTH / 2 - 0.02 : HALF_LENGTH - BALL_RADIUS - 0.08;
    const minX = -HALF_LENGTH + BALL_RADIUS + 0.08;
    const maxZ = HALF_WIDTH - BALL_RADIUS - 0.08;

    // Sample candidate cue ball placements aligned behind legal balls
    const ballMap = new Map(state.balls.map((b) => [b.id, b]));
    for (const tid of legalIds) {
      const target = ballMap.get(tid);
      if (!target || target.pocketed) continue;

      for (const pocket of POCKETS) {
        const tpX = pocket.x - target.x;
        const tpZ = pocket.z - target.z;
        const tpDist = Math.hypot(tpX, tpZ);
        if (tpDist < 0.05) continue;
        const uX = tpX / tpDist;
        const uZ = tpZ / tpDist;

        for (const backDist of [0.28, 0.48, 0.72]) {
          const cx = target.x - uX * (BALL_DIAMETER + backDist);
          const cz = target.z - uZ * (BALL_DIAMETER + backDist);
          if (cx < minX || cx > maxX || Math.abs(cz) > maxZ) continue;
          if (!isValidBallInHandPosition(cx, cz, state.balls, behindHeadString)) continue;

          const pot = findBestDirectPot(cx, cz, state.balls, legalIds);
          if (pot && pot.score > bestScore) {
            bestScore = pot.score;
            bestSpot = { x: cx, z: cz };
          }
        }
      }
    }

    return bestSpot;
  }

  /**
   * Calculates the AI's shot parameters using actual table geometry and difficulty skill.
   */
  public static computeShot(state: MatchState, difficulty: AIDifficulty): ShotParams {
    const profile = AI_DIFFICULTIES[difficulty];
    const cue = state.balls.find((b) => b.id === 0);
    if (!cue || cue.pocketed) {
      return { angle: 0, power: 0.5, spinX: 0, spinY: 0 };
    }

    // Break shot: aim firmly at the apex ball with slight off-center cut for spread
    if (state.isBreakShot) {
      const jitterRad = ((Math.random() - 0.5) * 2 * profile.angleJitterDeg * Math.PI) / 180;
      return {
        angle: 0.015 + jitterRad,
        power: Math.min(1.0, 0.92 + (Math.random() - 0.5) * 0.08),
        spinX: 0,
        spinY: -0.15,
      };
    }

    const legalIds = getLegalTargetBallIds(state);
    let chosen: CandidateShot | null = findBestDirectPot(cue.x, cue.z, state.balls, legalIds);

    if (!chosen && profile.comboSkill > 0.25) {
      const combo = findBestComboShot(cue.x, cue.z, state.balls, legalIds);
      if (combo && Math.random() < profile.comboSkill) {
        chosen = combo;
      }
    }

    if (!chosen) {
      chosen = findDefensiveOrHitShot(cue.x, cue.z, state.balls, legalIds, profile.safetySkill);
    }

    // Apply human-like angular & power dispersion scaled by difficulty
    const gaussianLike = (Math.random() + Math.random() + Math.random()) / 3 - 0.5; // [-0.5, 0.5] centered
    const angleJitterRad = (gaussianLike * 2 * profile.angleJitterDeg * Math.PI) / 180;
    const powerJitter = gaussianLike * 2 * profile.powerJitter;

    return {
      angle: chosen.angle + angleJitterRad,
      power: Math.max(0.15, Math.min(0.98, chosen.power + powerJitter)),
      spinX: chosen.spinX,
      spinY: chosen.spinY,
    };
  }
}
