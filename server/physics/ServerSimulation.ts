import { evaluateShotOutcome, isValidBallInHandPosition } from '../../src/game/rules.ts';
import type {
  BallState,
  MatchState,
  PhysicsEvent,
  ShotParams,
  TableSurfaceStyleId,
} from '../../src/game/types.ts';
import { ensureRapierInitialized, RapierPoolEngine } from '../../src/physics/RapierPoolEngine.ts';

/**
 * Authoritative server-side shot simulation using the shared Rapier3D physics & rules engine.
 */
export class ServerSimulation {
  public static async init(): Promise<void> {
    await ensureRapierInitialized();
  }

  public static validateBallPlacement(
    state: MatchState,
    x: number,
    z: number,
  ): { valid: boolean; balls: BallState[] } {
    if (state.phase !== 'ball_in_hand') {
      return { valid: false, balls: state.balls };
    }
    const behindHeadString = state.isBreakShot;
    if (!isValidBallInHandPosition(x, z, state.balls, behindHeadString)) {
      return { valid: false, balls: state.balls };
    }

    const updatedBalls = state.balls.map((b) =>
      b.id === 0 ? { ...b, x, z, pocketed: false } : b,
    );
    return { valid: true, balls: updatedBalls };
  }

  public static executeAuthoritativeShot(
    state: MatchState,
    shot: ShotParams,
    surfaceStyle?: TableSurfaceStyleId,
  ): {
    nextState: MatchState;
    events: PhysicsEvent[];
  } {
    const sanitizedShot: ShotParams = {
      angle: Number.isFinite(shot.angle) ? shot.angle : 0,
      power: Math.max(0.05, Math.min(1.0, Number.isFinite(shot.power) ? shot.power : 0.5)),
      spinX: Math.max(-1, Math.min(1, Number.isFinite(shot.spinX) ? shot.spinX : 0)),
      spinY: Math.max(-1, Math.min(1, Number.isFinite(shot.spinY) ? shot.spinY : 0)),
    };

    const engine = new RapierPoolEngine(surfaceStyle);
    engine.loadBalls(state.balls);
    const { balls, summary } = engine.simulateFullShot(sanitizedShot);
    engine.dispose();

    const nextState = evaluateShotOutcome(state, balls, summary);
    return {
      nextState,
      events: summary.events,
    };
  }
}
