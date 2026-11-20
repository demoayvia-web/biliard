export interface TouchPointerSample {
  pointerId: number;
  x: number;
  y: number;
  pointerType: string;
}

export interface PointerDownResult {
  isTwoFinger: boolean;
  restoreAimAngle?: number;
}

export interface PointerMoveResult {
  handledByTwoFinger: boolean;
  canStartAimDrag: boolean;
  dragDeltaX: number;
  dragDeltaY: number;
}

export interface PointerUpResult {
  doubleTapReset: boolean;
}

export interface TouchCameraConfig {
  minZoom?: number;
  maxZoom?: number;
  defaultZoom?: number;
  minPitchOffset?: number;
  maxPitchOffset?: number;
  touchSlopPx?: number;
  postTwoFingerCooldownMs?: number;
}

interface ActivePointer {
  x: number;
  y: number;
  pointerType: string;
}

interface TwoFingerSnapshot {
  dist: number;
  angle: number;
  midX: number;
  midY: number;
}

interface SingleTouchTracker {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTimeMs: number;
  pointerType: string;
  movedBeyondSlop: boolean;
  maxTravelSq: number;
  aimSnapshot: number | null;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function normalizeAngle(rad: number): number {
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}

function dampValue(current: number, target: number, lambda: number, dt: number): number {
  const factor = 1 - Math.exp(-lambda * dt);
  return current + (target - current) * factor;
}

export class TouchCameraController {
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly defaultZoom: number;
  readonly minPitchOffset: number;
  readonly maxPitchOffset: number;
  readonly touchSlopPx: number;
  readonly postTwoFingerCooldownMs: number;

  targetZoom: number;
  zoom: number;

  targetYawOffset = 0;
  yawOffset = 0;

  targetPitchOffset = 0;
  pitchOffset = 0;

  private activePointers = new Map<number, ActivePointer>();
  private prevTwoFinger: TwoFingerSnapshot | null = null;
  private singleTracker: SingleTouchTracker | null = null;
  private twoFingerUsedInSequence = false;
  private cooldownUntilMs = 0;
  private lastCleanTap: { timeMs: number; x: number; y: number } | null = null;

  constructor(config: TouchCameraConfig = {}) {
    this.minZoom = config.minZoom ?? 0.72;
    this.maxZoom = config.maxZoom ?? 2.75;
    this.defaultZoom = config.defaultZoom ?? 1.42;
    this.minPitchOffset = config.minPitchOffset ?? -0.22;
    this.maxPitchOffset = config.maxPitchOffset ?? 0.85;
    this.touchSlopPx = config.touchSlopPx ?? 6;
    this.postTwoFingerCooldownMs = config.postTwoFingerCooldownMs ?? 150;

    this.targetZoom = this.defaultZoom;
    this.zoom = this.defaultZoom;
  }

  get pointerCount(): number {
    return this.activePointers.size;
  }

  isTwoFingerActive(): boolean {
    return this.activePointers.size >= 2;
  }

  hasCustomAdjustment(): boolean {
    return (
      Math.abs(normalizeAngle(this.targetYawOffset)) > 0.03 ||
      Math.abs(this.targetPitchOffset) > 0.03 ||
      Math.abs(this.targetZoom - this.defaultZoom) > 0.08
    );
  }

  private captureTwoFingerSnapshot(): TwoFingerSnapshot | null {
    if (this.activePointers.size < 2) return null;
    const iter = this.activePointers.values();
    const p1 = iter.next().value;
    const p2 = iter.next().value;
    if (!p1 || !p2) return null;

    return {
      dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
      angle: Math.atan2(p2.y - p1.y, p2.x - p1.x),
      midX: (p1.x + p2.x) * 0.5,
      midY: (p1.y + p2.y) * 0.5,
    };
  }

  handlePointerDown(
    sample: TouchPointerSample,
    nowMs: number,
    currentAimAngle: number | null,
  ): PointerDownResult {
    this.activePointers.set(sample.pointerId, {
      x: sample.x,
      y: sample.y,
      pointerType: sample.pointerType,
    });

    if (this.activePointers.size >= 2) {
      this.twoFingerUsedInSequence = true;
      this.prevTwoFinger = this.captureTwoFingerSnapshot();

      let restoreAimAngle: number | undefined;
      if (
        this.singleTracker &&
        this.singleTracker.aimSnapshot !== null &&
        nowMs - this.singleTracker.startTimeMs < 240 &&
        this.singleTracker.maxTravelSq < 18 * 18
      ) {
        restoreAimAngle = this.singleTracker.aimSnapshot;
      }
      this.singleTracker = null;
      return { isTwoFinger: true, restoreAimAngle };
    }

    this.twoFingerUsedInSequence = false;
    this.prevTwoFinger = null;
    const slopBypass = sample.pointerType !== 'touch';
    this.singleTracker = {
      pointerId: sample.pointerId,
      startX: sample.x,
      startY: sample.y,
      lastX: sample.x,
      lastY: sample.y,
      startTimeMs: nowMs,
      pointerType: sample.pointerType,
      movedBeyondSlop: slopBypass,
      maxTravelSq: 0,
      aimSnapshot: currentAimAngle,
    };

    return { isTwoFinger: false };
  }

  handlePointerMove(
    sample: TouchPointerSample,
    nowMs: number,
    viewportWidth: number,
    viewportHeight: number,
    sensitivity: number,
  ): PointerMoveResult {
    if (this.activePointers.has(sample.pointerId)) {
      this.activePointers.set(sample.pointerId, {
        x: sample.x,
        y: sample.y,
        pointerType: sample.pointerType,
      });
    }

    if (this.activePointers.size >= 2) {
      const next = this.captureTwoFingerSnapshot();
      if (next && this.prevTwoFinger) {
        // Pinch-to-zoom (multiplicative ratio keeps feel consistent across zoom levels)
        if (this.prevTwoFinger.dist >= 16 && next.dist >= 16) {
          const rawRatio = this.prevTwoFinger.dist / next.dist;
          const clampedRatio = clamp(rawRatio, 0.84, 1.18);
          this.targetZoom = clamp(this.targetZoom * clampedRatio, this.minZoom, this.maxZoom);
        }

        // Two-finger twist rotation + parallel horizontal sweep -> Yaw camera orbit
        const dAngle = clamp(normalizeAngle(next.angle - this.prevTwoFinger.angle), -0.35, 0.35);
        const dMidX = clamp(next.midX - this.prevTwoFinger.midX, -80, 80);
        const dMidY = clamp(next.midY - this.prevTwoFinger.midY, -80, 80);

        const sens = Math.max(0.35, sensitivity);
        const twistGain = 1.2 * sens;
        const sweepGain = (2.4 / Math.max(320, viewportWidth)) * sens;
        const pitchGain = (1.65 / Math.max(320, viewportHeight)) * sens;

        this.targetYawOffset -= dAngle * twistGain + dMidX * sweepGain;
        this.targetPitchOffset = clamp(
          this.targetPitchOffset + dMidY * pitchGain,
          this.minPitchOffset,
          this.maxPitchOffset,
        );
      }
      this.prevTwoFinger = next;

      return {
        handledByTwoFinger: true,
        canStartAimDrag: false,
        dragDeltaX: 0,
        dragDeltaY: 0,
      };
    }

    if (nowMs < this.cooldownUntilMs) {
      if (this.singleTracker && this.singleTracker.pointerId === sample.pointerId) {
        this.singleTracker.lastX = sample.x;
        this.singleTracker.lastY = sample.y;
      }
      return {
        handledByTwoFinger: false,
        canStartAimDrag: false,
        dragDeltaX: 0,
        dragDeltaY: 0,
      };
    }

    if (!this.singleTracker || this.singleTracker.pointerId !== sample.pointerId) {
      return {
        handledByTwoFinger: false,
        canStartAimDrag: false,
        dragDeltaX: 0,
        dragDeltaY: 0,
      };
    }

    const totalDx = sample.x - this.singleTracker.startX;
    const totalDy = sample.y - this.singleTracker.startY;
    const travelSq = totalDx * totalDx + totalDy * totalDy;
    if (travelSq > this.singleTracker.maxTravelSq) {
      this.singleTracker.maxTravelSq = travelSq;
    }

    if (!this.singleTracker.movedBeyondSlop) {
      if (travelSq < this.touchSlopPx * this.touchSlopPx) {
        return {
          handledByTwoFinger: false,
          canStartAimDrag: false,
          dragDeltaX: 0,
          dragDeltaY: 0,
        };
      }
      this.singleTracker.movedBeyondSlop = true;
      this.singleTracker.lastX = sample.x;
      this.singleTracker.lastY = sample.y;
      return {
        handledByTwoFinger: false,
        canStartAimDrag: true,
        dragDeltaX: 0,
        dragDeltaY: 0,
      };
    }

    const dragDeltaX = sample.x - this.singleTracker.lastX;
    const dragDeltaY = sample.y - this.singleTracker.lastY;
    this.singleTracker.lastX = sample.x;
    this.singleTracker.lastY = sample.y;

    return {
      handledByTwoFinger: false,
      canStartAimDrag: true,
      dragDeltaX,
      dragDeltaY,
    };
  }

  handlePointerUp(
    pointerId: number,
    nowMs: number,
    allowDoubleTapReset: boolean,
  ): PointerUpResult {
    const pointer = this.activePointers.get(pointerId);
    this.activePointers.delete(pointerId);

    if (this.activePointers.size >= 2) {
      this.prevTwoFinger = this.captureTwoFingerSnapshot();
      return { doubleTapReset: false };
    }

    if (this.prevTwoFinger !== null) {
      this.prevTwoFinger = null;
      this.cooldownUntilMs = nowMs + this.postTwoFingerCooldownMs;
    }

    let doubleTapReset = false;
    if (
      this.activePointers.size === 0 &&
      allowDoubleTapReset &&
      !this.twoFingerUsedInSequence &&
      this.singleTracker &&
      this.singleTracker.pointerId === pointerId &&
      nowMs - this.singleTracker.startTimeMs < 260 &&
      this.singleTracker.maxTravelSq < 10 * 10
    ) {
      const tapX = pointer?.x ?? this.singleTracker.lastX;
      const tapY = pointer?.y ?? this.singleTracker.lastY;

      if (
        this.lastCleanTap &&
        nowMs - this.lastCleanTap.timeMs < 320 &&
        Math.hypot(tapX - this.lastCleanTap.x, tapY - this.lastCleanTap.y) < 38
      ) {
        this.resetAll();
        this.lastCleanTap = null;
        doubleTapReset = true;
      } else {
        this.lastCleanTap = { timeMs: nowMs, x: tapX, y: tapY };
      }
    }

    if (this.activePointers.size === 0) {
      this.singleTracker = null;
      this.twoFingerUsedInSequence = false;
    } else {
      // One remaining finger after lifting a second finger: re-anchor without aim jump
      const [remId, remPos] = this.activePointers.entries().next().value as [number, ActivePointer];
      this.singleTracker = {
        pointerId: remId,
        startX: remPos.x,
        startY: remPos.y,
        lastX: remPos.x,
        lastY: remPos.y,
        startTimeMs: nowMs,
        pointerType: remPos.pointerType,
        movedBeyondSlop: false,
        maxTravelSq: 0,
        aimSnapshot: null,
      };
    }

    return { doubleTapReset };
  }

  clearPointers(): void {
    this.activePointers.clear();
    this.prevTwoFinger = null;
    this.singleTracker = null;
    this.twoFingerUsedInSequence = false;
  }

  applyWheelDelta(deltaY: number): void {
    this.targetZoom = clamp(this.targetZoom + deltaY * 0.0012, this.minZoom, this.maxZoom);
  }

  resetOrientation(): void {
    this.yawOffset = normalizeAngle(this.yawOffset);
    this.targetYawOffset = 0;
    this.targetPitchOffset = 0;
  }

  resetAll(): void {
    this.resetOrientation();
    this.targetZoom = this.defaultZoom;
  }

  step(dt: number, isSoftwareGl: boolean): void {
    const lambda = isSoftwareGl ? 24 : 14;
    this.zoom = dampValue(this.zoom, this.targetZoom, lambda, dt);
    this.yawOffset = dampValue(this.yawOffset, this.targetYawOffset, lambda, dt);
    this.pitchOffset = dampValue(this.pitchOffset, this.targetPitchOffset, lambda, dt);
  }
}
