import RAPIER from '@dimforge/rapier3d-compat';
import {
  BALL_MASS,
  BALL_RADIUS,
  BALL_REST_Y,
  CUSHION_HEIGHT,
  FIXED_DT,
  HALF_LENGTH,
  HALF_WIDTH,
  MAX_SHOT_SPEED,
  MIN_SHOT_SPEED,
  POCKETS,
  SLATE_Y,
  TABLE_SURFACE_STYLES,
} from '../game/constants.ts';
import type {
  BallState,
  PhysicsEvent,
  ShotOutcomeSummary,
  ShotParams,
  SurfacePhysicsMultipliers,
  TableSurfaceStyleId,
} from '../game/types.ts';

let rapierInitPromise: Promise<void> | null = null;

export function ensureRapierInitialized(): Promise<void> {
  if (!rapierInitPromise) {
    rapierInitPromise = RAPIER.init();
  }
  return rapierInitPromise;
}

interface BallRuntime {
  id: number;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  pocketed: boolean;
}

const BASE_SLATE_FRICTION = 0.02;
const BASE_SLIDE_FRICTION = 0.21; // Sliding friction between phenolic resin ball & worsted wool cloth
const BASE_ROLL_FRICTION = 0.0165; // Rolling resistance deceleration
const BASE_SPIN_DECAY_Y = 2.6; // Sidespin decay rate (rad/s^2)
const BASE_CUSHION_RESTITUTION = 0.84;
const BASE_CUSHION_FRICTION = 0.08;

function clampMultiplier(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

/**
 * Deterministic Rapier3D billiard physics engine.
 * Runs identically in the browser (60fps visual stepping) and on Node.js (authoritative shot simulation).
 */
export class RapierPoolEngine {
  public world: RAPIER.World;
  public eventQueue: RAPIER.EventQueue;
  private balls: Map<number, BallRuntime> = new Map();
  private colliderToBallId: Map<number, number> = new Map();
  private cushionColliderHandles: Set<number> = new Set();
  private cushionColliders: RAPIER.Collider[] = [];
  private slateCollider: RAPIER.Collider | null = null;

  // Playing surface physics multipliers (e.g. Professional Tournament vs Club Table)
  private clothFrictionMultiplier = 1.0;
  private cushionElasticityMultiplier = 1.0;

  // Shot telemetry
  private shotElapsed = 0;
  private firstContactBallId: number | null = null;
  private pocketedThisShot: number[] = [];
  private cueBallPocketedThisShot = false;
  private railContactsAfterFirstHit = 0;
  private totalRailContacts = 0;
  private eventsThisShot: PhysicsEvent[] = [];
  private lastCollisionSoundTime: Map<string, number> = new Map();

  constructor(surfaceConfig?: TableSurfaceStyleId | Partial<SurfacePhysicsMultipliers>) {
    if (typeof surfaceConfig === 'string') {
      const preset = TABLE_SURFACE_STYLES[surfaceConfig] ?? TABLE_SURFACE_STYLES.tournament;
      this.clothFrictionMultiplier = preset.clothFrictionMultiplier;
      this.cushionElasticityMultiplier = preset.cushionElasticityMultiplier;
    } else if (surfaceConfig) {
      this.clothFrictionMultiplier = clampMultiplier(
        surfaceConfig.clothFrictionMultiplier ?? 1.0,
        0.4,
        2.5,
        1.0,
      );
      this.cushionElasticityMultiplier = clampMultiplier(
        surfaceConfig.cushionElasticityMultiplier ?? 1.0,
        0.4,
        1.12,
        1.0,
      );
    }

    this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
    this.eventQueue = new RAPIER.EventQueue(true);
    this.buildTableColliders();
  }

  private computeEffectiveCushionRestitution(): number {
    return Math.max(0.35, Math.min(0.94, BASE_CUSHION_RESTITUTION * this.cushionElasticityMultiplier));
  }

  public setSurfaceMultipliers(multipliers: Partial<SurfacePhysicsMultipliers>): void {
    if (multipliers.clothFrictionMultiplier !== undefined) {
      this.clothFrictionMultiplier = clampMultiplier(
        multipliers.clothFrictionMultiplier,
        0.4,
        2.5,
        this.clothFrictionMultiplier,
      );
    }
    if (multipliers.cushionElasticityMultiplier !== undefined) {
      this.cushionElasticityMultiplier = clampMultiplier(
        multipliers.cushionElasticityMultiplier,
        0.4,
        1.12,
        this.cushionElasticityMultiplier,
      );
    }

    if (this.slateCollider) {
      this.slateCollider.setFriction(BASE_SLATE_FRICTION * this.clothFrictionMultiplier);
    }
    const nextRestitution = this.computeEffectiveCushionRestitution();
    for (const col of this.cushionColliders) {
      col.setRestitution(nextRestitution);
    }
  }

  public setSurfaceStyle(styleId: TableSurfaceStyleId): void {
    const preset = TABLE_SURFACE_STYLES[styleId] ?? TABLE_SURFACE_STYLES.tournament;
    this.setSurfaceMultipliers({
      clothFrictionMultiplier: preset.clothFrictionMultiplier,
      cushionElasticityMultiplier: preset.cushionElasticityMultiplier,
    });
  }

  public getSurfaceMultipliers(): SurfacePhysicsMultipliers {
    return {
      clothFrictionMultiplier: this.clothFrictionMultiplier,
      cushionElasticityMultiplier: this.cushionElasticityMultiplier,
    };
  }

  public getEffectivePhysicsParameters(): {
    clothFrictionMultiplier: number;
    cushionElasticityMultiplier: number;
    muSlide: number;
    muRoll: number;
    spinDecayY: number;
    cushionRestitution: number;
  } {
    return {
      clothFrictionMultiplier: this.clothFrictionMultiplier,
      cushionElasticityMultiplier: this.cushionElasticityMultiplier,
      muSlide: BASE_SLIDE_FRICTION * this.clothFrictionMultiplier,
      muRoll: BASE_ROLL_FRICTION * this.clothFrictionMultiplier,
      spinDecayY: BASE_SPIN_DECAY_Y * (0.65 + 0.35 * this.clothFrictionMultiplier),
      cushionRestitution: this.computeEffectiveCushionRestitution(),
    };
  }

  private buildTableColliders(): void {
    // 1. Slate playing surface
    const slateBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const slateColliderDesc = RAPIER.ColliderDesc.cuboid(HALF_LENGTH + 0.12, 0.05, HALF_WIDTH + 0.12)
      .setTranslation(0, SLATE_Y - 0.05, 0)
      .setFriction(BASE_SLATE_FRICTION * this.clothFrictionMultiplier)
      .setRestitution(0.15);
    this.slateCollider = this.world.createCollider(slateColliderDesc, slateBody);

    // 2. Six cushion rails split around pocket openings
    // Corner pocket opening gap along rail ~0.115m, side pocket opening gap ~0.128m
    const cornerGap = 0.098;
    const sideGap = 0.068;
    const cushionThickness = 0.06;
    const cushionHalfH = CUSHION_HEIGHT / 2;
    const cushionY = SLATE_Y + cushionHalfH + 0.006;

    // Top (-Z) & Bottom (+Z) long rails split into left and right segments around side pocket
    const longSegLen = HALF_LENGTH - cornerGap - sideGap;
    const longHalfLen = longSegLen / 2;
    const longCenterOffset = sideGap + longHalfLen;

    const cushionRestitution = this.computeEffectiveCushionRestitution();

    const addCushion = (cx: number, cz: number, hx: number, hz: number, rotY = 0) => {
      const desc = RAPIER.ColliderDesc.cuboid(hx, cushionHalfH, hz)
        .setTranslation(cx, cushionY, cz)
        .setRestitution(cushionRestitution)
        .setFriction(BASE_CUSHION_FRICTION)
        // Min combine ensures cushion elasticity governs ball-rail rebound (<= ball 0.945) while ball-ball stays Average(0.945)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

      if (rotY !== 0) {
        const halfAngle = rotY / 2;
        desc.setRotation({ x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) });
      }
      const col = this.world.createCollider(desc, slateBody);
      this.cushionColliderHandles.add(col.handle);
      this.cushionColliders.push(col);
    };

    // Long cushions (-Z and +Z)
    for (const signZ of [-1, 1]) {
      const cz = signZ * (HALF_WIDTH + cushionThickness / 2);
      addCushion(-longCenterOffset, cz, longHalfLen, cushionThickness / 2);
      addCushion(longCenterOffset, cz, longHalfLen, cushionThickness / 2);

      // Angled jaws at side pockets
      addCushion(-sideGap - 0.008, signZ * (HALF_WIDTH + 0.022), 0.018, 0.025, signZ * 0.42);
      addCushion(sideGap + 0.008, signZ * (HALF_WIDTH + 0.022), 0.018, 0.025, -signZ * 0.42);

      // Angled jaws at corners (on long rail ends)
      addCushion(-(HALF_LENGTH - cornerGap + 0.012), signZ * (HALF_WIDTH + 0.02), 0.022, 0.025, -signZ * 0.55);
      addCushion(HALF_LENGTH - cornerGap + 0.012, signZ * (HALF_WIDTH + 0.02), 0.022, 0.025, signZ * 0.55);
    }

    // End cushions (-X and +X)
    const shortSegLen = (HALF_WIDTH - cornerGap) * 2;
    const shortHalfLen = shortSegLen / 2;
    for (const signX of [-1, 1]) {
      const cx = signX * (HALF_LENGTH + cushionThickness / 2);
      addCushion(cx, 0, cushionThickness / 2, shortHalfLen);

      // Angled jaws at corners (on short rail ends)
      addCushion(signX * (HALF_LENGTH + 0.02), -(HALF_WIDTH - cornerGap + 0.012), 0.025, 0.022, signX * 0.55);
      addCushion(signX * (HALF_LENGTH + 0.02), HALF_WIDTH - cornerGap + 0.012, 0.025, 0.022, -signX * 0.55);
    }

    // Outer pocket backstops so balls never fly out of the arena if hit super hard
    const outerThickness = 0.05;
    const outerWallZ = HALF_WIDTH + 0.11;
    const outerWallX = HALF_LENGTH + 0.11;
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF_LENGTH + 0.15, 0.08, outerThickness / 2)
        .setTranslation(0, SLATE_Y + 0.04, -outerWallZ)
        .setRestitution(0.3),
      slateBody,
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF_LENGTH + 0.15, 0.08, outerThickness / 2)
        .setTranslation(0, SLATE_Y + 0.04, outerWallZ)
        .setRestitution(0.3),
      slateBody,
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(outerThickness / 2, 0.08, HALF_WIDTH + 0.15)
        .setTranslation(-outerWallX, SLATE_Y + 0.04, 0)
        .setRestitution(0.3),
      slateBody,
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(outerThickness / 2, 0.08, HALF_WIDTH + 0.15)
        .setTranslation(outerWallX, SLATE_Y + 0.04, 0)
        .setRestitution(0.3),
      slateBody,
    );
  }

  public loadBalls(ballStates: BallState[]): void {
    // Remove existing ball bodies
    for (const runtime of this.balls.values()) {
      this.world.removeRigidBody(runtime.body);
    }
    this.balls.clear();
    this.colliderToBallId.clear();

    for (const b of ballStates) {
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(b.x, b.pocketed ? SLATE_Y - 0.5 : b.y, b.z)
        .setLinvel(b.vx, b.vy, b.vz)
        .setAngvel({ x: b.wx, y: b.wy, z: b.wz })
        .setRotation({ x: b.qx, y: b.qy, z: b.qz, w: b.qw })
        .setCcdEnabled(true)
        .setLinearDamping(0.08)
        .setAngularDamping(0.12);

      if (b.pocketed) {
        bodyDesc.setGravityScale(0).setSleeping(true);
      }

      const body = this.world.createRigidBody(bodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setMass(BALL_MASS)
        .setRestitution(0.945)
        .setFriction(0.025)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

      if (b.pocketed) {
        colliderDesc.setSensor(true);
      }

      const collider = this.world.createCollider(colliderDesc, body);
      this.balls.set(b.id, { id: b.id, body, collider, pocketed: b.pocketed });
      this.colliderToBallId.set(collider.handle, b.id);
    }
  }

  public setCueBallPosition(x: number, z: number): void {
    const cue = this.balls.get(0);
    if (!cue) return;
    cue.pocketed = false;
    cue.collider.setSensor(false);
    cue.body.setGravityScale(1, true);
    cue.body.setTranslation({ x, y: BALL_REST_Y, z }, true);
    cue.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    cue.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    cue.body.wakeUp();
  }

  public applyShot(shot: ShotParams, powerScale = 1.0): void {
    const cue = this.balls.get(0);
    if (!cue || cue.pocketed) return;

    this.shotElapsed = 0;
    this.firstContactBallId = null;
    this.pocketedThisShot = [];
    this.cueBallPocketedThisShot = false;
    this.railContactsAfterFirstHit = 0;
    this.totalRailContacts = 0;
    this.eventsThisShot = [];
    this.lastCollisionSoundTime.clear();

    const clampedPower = Math.max(0.04, Math.min(1.0, shot.power));
    // Non-linear power curve feels far better for soft touch & massive breaks
    const curvedPower = Math.pow(clampedPower, 1.35);
    const speed = (MIN_SHOT_SPEED + curvedPower * (MAX_SHOT_SPEED - MIN_SHOT_SPEED)) * powerScale;

    const dirX = Math.cos(shot.angle);
    const dirZ = Math.sin(shot.angle);

    cue.body.wakeUp();
    cue.body.setLinvel({ x: dirX * speed, y: 0, z: dirZ * speed }, true);

    // Compute realistic initial angular velocity from tip offset!
    // Right vector in XZ plane: (-dirZ, 0, dirX)
    // Pure roll angular velocity magnitude = speed / BALL_RADIUS
    const rollOmega = speed / BALL_RADIUS;
    // Topspin (+spinY) rolls forward; Backspin (-spinY) spins backward (draw!)
    // Natural center-ball hit starts sliding with low topspin unless tipOffsetY > 0
    const spinY = Math.max(-1, Math.min(1, shot.spinY));
    const spinX = Math.max(-1, Math.min(1, shot.spinX));

    // Axis for forward roll along (dirX, 0, dirZ) is (dirZ, 0, -dirX)? Wait:
    // Let's check right-hand rule: omega x (0, -R, 0) = (-omega_z * R, 0, omega_x * R)
    // For v_slip = 0 when rolling in +dir: (-omega_z * R) = vx => omega_z = -vx / R, omega_x = vz / R
    // Wait: v_contact = v_cm + omega x r_contact where r_contact = (0, -R, 0)
    // omega x (0, -R, 0) = ( -(-omega_z * R) wait: i*(omega_y*(-R) - omega_z*0) - j*(0) + k*(omega_x*(-R) - 0) )
    // Let's compute cross product accurately:
    // a = (wx, wy, wz), b = (0, -R, 0)
    // a x b = (wy*0 - wz*(-R), wz*0 - wx*0, wx*(-R) - wy*0) = (wz * R, 0, -wx * R)
    // So v_contact_x = vx + wz * R, v_contact_z = vz - wx * R.
    // For pure forward roll (v_contact = 0): wz = -vx / R, wx = +vz / R!
    const topSpinFactor = spinY * 1.65; // -1.65 (strong draw) to +1.65 (strong follow)
    const wx = (dirZ * rollOmega) * topSpinFactor;
    const wz = (-dirX * rollOmega) * topSpinFactor;
    // Sidespin (English) around vertical Y axis:
    const wy = -spinX * rollOmega * 1.25;

    cue.body.setAngvel({ x: wx, y: wy, z: wz }, true);
  }

  public stepFixed(): PhysicsEvent[] {
    const stepEvents: PhysicsEvent[] = [];
    this.shotElapsed += FIXED_DT;

    // 1. Apply realistic cloth sliding/rolling friction & spin before stepping Rapier
    this.applyClothFrictionAndSpin(FIXED_DT);

    // 2. Step Rapier world
    this.world.step(this.eventQueue);

    // 3. Drain collision events
    this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      if (!started) return;

      const ballA = this.colliderToBallId.get(handle1);
      const ballB = this.colliderToBallId.get(handle2);
      const isCushion1 = this.cushionColliderHandles.has(handle1);
      const isCushion2 = this.cushionColliderHandles.has(handle2);

      if (ballA !== undefined && ballB !== undefined) {
        const rtA = this.balls.get(ballA)!;
        const rtB = this.balls.get(ballB)!;
        if (rtA.pocketed || rtB.pocketed) return;

        // Track first legal contact by cue ball
        if (this.firstContactBallId === null && (ballA === 0 || ballB === 0)) {
          this.firstContactBallId = ballA === 0 ? ballB : ballA;
        }

        const vA = rtA.body.linvel();
        const vB = rtB.body.linvel();
        const relSpeed = Math.hypot(vA.x - vB.x, vA.z - vB.z);
        if (relSpeed > 0.04) {
          const pairKey = ballA < ballB ? `${ballA}-${ballB}` : `${ballB}-${ballA}`;
          const prevT = this.lastCollisionSoundTime.get(pairKey) ?? -1;
          if (this.shotElapsed - prevT > 0.025) {
            this.lastCollisionSoundTime.set(pairKey, this.shotElapsed);
            const pA = rtA.body.translation();
            const evt: PhysicsEvent = {
              type: 'ball-ball',
              time: this.shotElapsed,
              ballA,
              ballB,
              speed: relSpeed,
              x: pA.x,
              z: pA.z,
            };
            stepEvents.push(evt);
            this.eventsThisShot.push(evt);
          }
        }
      } else if ((ballA !== undefined && isCushion2) || (ballB !== undefined && isCushion1)) {
        const bId = ballA !== undefined ? ballA : ballB!;
        const rt = this.balls.get(bId)!;
        if (rt.pocketed) return;

        this.totalRailContacts += 1;
        if (this.firstContactBallId !== null) {
          this.railContactsAfterFirstHit += 1;
        }

        // Sidespin (English) cushion throw effect on cue ball / spinning balls
        const w = rt.body.angvel();
        const v = rt.body.linvel();
        const pos = rt.body.translation();
        if (Math.abs(w.y) > 0.8) {
          // Determine whether it hit a Z-cushion (near +-HALF_WIDTH) or X-cushion (near +-HALF_LENGTH)
          const nearZ = Math.abs(Math.abs(pos.z) - HALF_WIDTH) < Math.abs(Math.abs(pos.x) - HALF_LENGTH);
          const throwImpulse = w.y * BALL_RADIUS * 0.24;
          if (nearZ) {
            const sign = pos.z > 0 ? 1 : -1;
            rt.body.setLinvel({ x: v.x + sign * throwImpulse, y: v.y, z: v.z }, true);
          } else {
            const sign = pos.x > 0 ? 1 : -1;
            rt.body.setLinvel({ x: v.x, y: v.y, z: v.z - sign * throwImpulse }, true);
          }
          rt.body.setAngvel({ x: w.x, y: w.y * 0.65, z: w.z }, true);
        }

        const speed = Math.hypot(v.x, v.z);
        if (speed > 0.08) {
          const key = `c-${bId}`;
          const prevT = this.lastCollisionSoundTime.get(key) ?? -1;
          if (this.shotElapsed - prevT > 0.03) {
            this.lastCollisionSoundTime.set(key, this.shotElapsed);
            const evt: PhysicsEvent = {
              type: 'cushion',
              time: this.shotElapsed,
              ballA: bId,
              speed,
              x: pos.x,
              z: pos.z,
            };
            stepEvents.push(evt);
            this.eventsThisShot.push(evt);
          }
        }
      }
    });

    // 4. Pocket capture & table-height clamping
    for (const rt of this.balls.values()) {
      if (rt.pocketed) continue;

      const pos = rt.body.translation();
      let captured = false;

      for (const pocket of POCKETS) {
        const dx = pos.x - pocket.x;
        const dz = pos.z - pocket.z;
        const dist = Math.hypot(dx, dz);
        if (dist < pocket.radius) {
          rt.pocketed = true;
          rt.collider.setSensor(true);
          rt.body.setGravityScale(0, true);
          rt.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          rt.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          rt.body.setTranslation({ x: pocket.x, y: SLATE_Y - 0.5, z: pocket.z }, true);
          rt.body.sleep();

          if (rt.id === 0) {
            this.cueBallPocketedThisShot = true;
          } else if (!this.pocketedThisShot.includes(rt.id)) {
            this.pocketedThisShot.push(rt.id);
          }

          const evt: PhysicsEvent = {
            type: 'pocket',
            time: this.shotElapsed,
            ballA: rt.id,
            pocketIndex: pocket.index,
            speed: 1.5,
            x: pocket.x,
            z: pocket.z,
          };
          stepEvents.push(evt);
          this.eventsThisShot.push(evt);
          captured = true;
          break;
        }
      }

      if (!captured) {
        // Keep balls cleanly resting on the slate without vertical micro-bounce
        if (pos.y > BALL_REST_Y + 0.002 || pos.y < BALL_REST_Y - 0.002) {
          const clampedY = Math.max(BALL_REST_Y, Math.min(BALL_REST_Y + 0.015, pos.y));
          rt.body.setTranslation({ x: pos.x, y: clampedY, z: pos.z }, false);
        }
        const v = rt.body.linvel();
        if (Math.abs(v.y) > 0.05) {
          rt.body.setLinvel({ x: v.x, y: v.y * 0.2, z: v.z }, false);
        }
      }
    }

    return stepEvents;
  }

  private applyClothFrictionAndSpin(dt: number): void {
    const g = 9.81;
    const muSlide = BASE_SLIDE_FRICTION * this.clothFrictionMultiplier; // Sliding friction between phenolic resin ball & cloth
    const muRoll = BASE_ROLL_FRICTION * this.clothFrictionMultiplier; // Rolling resistance deceleration
    const spinDecayY = BASE_SPIN_DECAY_Y * (0.65 + 0.35 * this.clothFrictionMultiplier); // Sidespin decay rate (rad/s^2)
    const stopVelThreshold = 0.014;
    const stopOmegaThreshold = 0.35;

    for (const rt of this.balls.values()) {
      if (rt.pocketed) continue;

      const v = rt.body.linvel();
      const w = rt.body.angvel();

      let vx = v.x;
      let vz = v.z;
      let wx = w.x;
      let wy = w.y;
      let wz = w.z;

      // Contact slip velocity on cloth: v_slip = v_cm + omega x (0, -R, 0)
      const slipX = vx + wz * BALL_RADIUS;
      const slipZ = vz - wx * BALL_RADIUS;
      const slipSpeed = Math.hypot(slipX, slipZ);

      if (slipSpeed > 0.025) {
        // Sliding phase: kinetic friction opposes slip and induces rolling torque
        const accelMag = muSlide * g;
        const maxDeltaV = accelMag * dt;
        const ratio = Math.min(1, maxDeltaV / slipSpeed);

        // Friction force per unit mass in XZ: -(slip / slipSpeed) * muSlide * g
        const dvx = -slipX * ratio * 0.285; // 2/7 factor keeps linear+angular transfer balanced
        const dvz = -slipZ * ratio * 0.285;

        vx += dvx;
        vz += dvz;

        // Torque = r_contact x F = (0, -R, 0) x (Fx, 0, Fz) = (-R * Fz, 0, R * Fx)
        // Angular acceleration = Torque / I where I = (2/5) m R^2 => alpha = (5 / 2R) * (-dvz/dt, 0, dvx/dt)
        const dOmegaScale = 2.5 / BALL_RADIUS;
        wx += -dvz * dOmegaScale;
        wz += dvx * dOmegaScale;
      } else {
        // Pure rolling phase: enforce v = omega x r and apply gentle rolling resistance
        const speed = Math.hypot(vx, vz);
        if (speed > stopVelThreshold) {
          const decel = muRoll * g * dt;
          const nextSpeed = Math.max(0, speed - decel);
          const scale = nextSpeed / speed;
          vx *= scale;
          vz *= scale;
          wx = vz / BALL_RADIUS;
          wz = -vx / BALL_RADIUS;
        } else {
          vx = 0;
          vz = 0;
          wx = 0;
          wz = 0;
        }
      }

      // Sidespin (Y-axis) decay
      if (Math.abs(wy) > stopOmegaThreshold) {
        const sign = wy > 0 ? 1 : -1;
        wy = sign * Math.max(0, Math.abs(wy) - spinDecayY * dt);
      } else {
        wy = 0;
      }

      // Crisp stop when both linear and angular motion have settled
      if (
        Math.hypot(vx, vz) < stopVelThreshold &&
        Math.hypot(wx, wy, wz) < stopOmegaThreshold
      ) {
        rt.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        rt.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      } else {
        rt.body.setLinvel({ x: vx, y: v.y, z: vz }, true);
        rt.body.setAngvel({ x: wx, y: wy, z: wz }, true);
      }
    }
  }

  public isAllStopped(): boolean {
    for (const rt of this.balls.values()) {
      if (rt.pocketed) continue;
      const v = rt.body.linvel();
      const w = rt.body.angvel();
      if (Math.hypot(v.x, v.z) > 0.015 || Math.hypot(w.x, w.y, w.z) > 0.4) {
        return false;
      }
    }
    return true;
  }

  public exportBallStates(): BallState[] {
    const out: BallState[] = [];
    for (let id = 0; id <= 15; id++) {
      const rt = this.balls.get(id);
      if (!rt) continue;
      const pos = rt.body.translation();
      const v = rt.body.linvel();
      const w = rt.body.angvel();
      const rot = rt.body.rotation();
      out.push({
        id,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: v.x,
        vy: v.y,
        vz: v.z,
        wx: w.x,
        wy: w.y,
        wz: w.z,
        qx: rot.x,
        qy: rot.y,
        qz: rot.z,
        qw: rot.w,
        pocketed: rt.pocketed,
      });
    }
    return out;
  }

  public getShotOutcomeSummary(): ShotOutcomeSummary {
    return {
      firstContactBallId: this.firstContactBallId,
      pocketedBallIds: [...this.pocketedThisShot],
      cueBallPocketed: this.cueBallPocketedThisShot,
      railContactsAfterFirstHit: this.railContactsAfterFirstHit,
      totalRailContacts: this.totalRailContacts,
      events: [...this.eventsThisShot],
    };
  }

  /**
   * Runs a full shot to completion synchronously (used by authoritative server validation).
   */
  public simulateFullShot(shot: ShotParams, maxSeconds = 18): {
    balls: BallState[];
    summary: ShotOutcomeSummary;
  } {
    this.applyShot(shot);
    const maxSteps = Math.ceil(maxSeconds / FIXED_DT);
    for (let i = 0; i < maxSteps; i++) {
      this.stepFixed();
      if (i > 12 && this.isAllStopped()) {
        break;
      }
    }
    return {
      balls: this.exportBallStates(),
      summary: this.getShotOutcomeSummary(),
    };
  }

  public dispose(): void {
    this.eventQueue.free();
    this.world.free();
    this.balls.clear();
    this.colliderToBallId.clear();
    this.cushionColliderHandles.clear();
    this.cushionColliders = [];
    this.slateCollider = null;
  }
}
