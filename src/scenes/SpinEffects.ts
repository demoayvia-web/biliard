import * as THREE from 'three';
import { BALL_RADIUS, SLATE_Y } from '../game/constants.ts';
import type { BallState } from '../game/types.ts';

export interface SpinEffectsUpdateParams {
  active: boolean;
  balls: BallState[];
  dt: number;
  timeScale?: number;
  paused?: boolean;
  resetSignal?: boolean;
}

export interface SpinEffectsInstance {
  group: THREE.Group;
  update: (params: SpinEffectsUpdateParams) => void;
  clear: () => void;
  dispose: () => void;
}

const MAX_BALLS = 16;
const PARTICLE_COUNT = 260;

// Spin & speed thresholds
const SPIN_THRESHOLD = 3.5; // rad/s around Y axis (English / sidespin)
const HIGH_SPEED_THRESHOLD = 1.85; // m/s linear speed for dust wake

// Pre-allocated color constants (no per-frame allocation)
const COLOR_LEFT_ENGLISH = new THREE.Color('#38BDF8'); // Cyan: wy > 0 (CCW from top)
const COLOR_RIGHT_ENGLISH = new THREE.Color('#F59E0B'); // Amber: wy < 0 (CW from top)

function createSpinChevronTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Outer dashed vortex arcs with arrowheads pointing CCW when viewed from +Y.
  // On PlaneGeometry rotated -PI/2 around X, decreasing canvas angle moves CCW in world XZ.
  const radius = 92;
  const arcCount = 3;
  const arcSpan = (Math.PI * 2) / arcCount;
  const sweep = arcSpan * 0.62;

  ctx.lineCap = 'round';

  for (let i = 0; i < arcCount; i++) {
    const startAngle = i * arcSpan;
    const endAngle = startAngle - sweep; // Decreasing angle = CCW from +Y

    // Subtle soft glow stroke
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle, true);
    ctx.stroke();

    // Crisp inner arc
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle, true);
    ctx.stroke();

    // Arrowhead at endAngle pointing in tangent direction (decreasing angle)
    const tipX = cx + Math.cos(endAngle - 0.08) * radius;
    const tipY = cy + Math.sin(endAngle - 0.08) * radius;
    const tx = Math.sin(endAngle); // Tangent unit vector for decreasing angle
    const ty = -Math.cos(endAngle);
    const nx = Math.cos(endAngle); // Outward radial normal
    const ny = Math.sin(endAngle);

    const baseX = cx + Math.cos(endAngle + 0.09) * radius;
    const baseY = cy + Math.sin(endAngle + 0.09) * radius;

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(tipX + tx * 4, tipY + ty * 4);
    ctx.lineTo(baseX + nx * 13, baseY + ny * 13);
    ctx.lineTo(baseX - nx * 13, baseY - ny * 13);
    ctx.closePath();
    ctx.fill();
  }

  // Delicate inner balance ring
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 66, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createDustSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;

  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.72)');
  grad.addColorStop(0.62, 'rgba(255, 255, 255, 0.22)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Renders procedural 3D spin chevron rings (applied English / sidespin) and
 * chalk-dust / vortex particle trails during live shots and instant replay playback.
 */
export function buildSpinEffects(scene: THREE.Scene): SpinEffectsInstance {
  const group = new THREE.Group();
  scene.add(group);

  // 1. Equatorial Spin Marker Rings (16 pre-allocated meshes)
  const ringTexture = createSpinChevronTexture();
  const ringPlaneSize = BALL_RADIUS * 4.4;
  const ringGeo = new THREE.PlaneGeometry(ringPlaneSize, ringPlaneSize);

  const ringWrappers: THREE.Group[] = [];
  const ringMaterials: THREE.MeshBasicMaterial[] = [];

  for (let i = 0; i < MAX_BALLS; i++) {
    const wrapper = new THREE.Group();
    wrapper.visible = false;

    const mat = new THREE.MeshBasicMaterial({
      map: ringTexture,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const plane = new THREE.Mesh(ringGeo, mat);
    plane.rotation.x = -Math.PI / 2;
    wrapper.add(plane);
    group.add(wrapper);

    ringWrappers.push(wrapper);
    ringMaterials.push(mat);
  }

  // 2. Chalk Dust & Spin Vortex Particle Pool (zero per-frame GC)
  const dustTexture = createDustSpriteTexture();
  const posArray = new Float32Array(PARTICLE_COUNT * 3);
  const colArray = new Float32Array(PARTICLE_COUNT * 3);

  const particleGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(posArray, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(colArray, 3);
  colAttr.setUsage(THREE.DynamicDrawUsage);

  particleGeo.setAttribute('position', posAttr);
  particleGeo.setAttribute('color', colAttr);

  const particleMat = new THREE.PointsMaterial({
    size: 0.025,
    sizeAttenuation: true,
    map: dustTexture,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(particleGeo, particleMat);
  points.frustumCulled = false;
  group.add(points);

  // Flat pre-allocated particle state buffers
  const pActive = new Uint8Array(PARTICLE_COUNT);
  const pAge = new Float32Array(PARTICLE_COUNT);
  const pMaxAge = new Float32Array(PARTICLE_COUNT);
  const pVx = new Float32Array(PARTICLE_COUNT);
  const pVy = new Float32Array(PARTICLE_COUNT);
  const pVz = new Float32Array(PARTICLE_COUNT);
  const pR = new Float32Array(PARTICLE_COUNT);
  const pG = new Float32Array(PARTICLE_COUNT);
  const pB = new Float32Array(PARTICLE_COUNT);
  const pSwirl = new Float32Array(PARTICLE_COUNT);

  const spawnAccum = new Float32Array(MAX_BALLS);
  let nextSlot = 0;
  let hasLiveParticles = false;

  // Deterministic fast PRNG for clean jitter without GC
  let rngState = 0x5f3759df;
  const rand = (): number => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };

  const spawnParticle = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    r: number,
    g: number,
    b: number,
    maxAge: number,
    swirl = 0,
  ) => {
    const idx = nextSlot;
    nextSlot = (nextSlot + 1) % PARTICLE_COUNT;

    pActive[idx] = 1;
    pAge[idx] = 0;
    pMaxAge[idx] = maxAge;

    const i3 = idx * 3;
    posArray[i3] = x;
    posArray[i3 + 1] = y;
    posArray[i3 + 2] = z;

    pVx[idx] = vx;
    pVy[idx] = vy;
    pVz[idx] = vz;

    pR[idx] = r;
    pG[idx] = g;
    pB[idx] = b;
    pSwirl[idx] = swirl;

    colArray[i3] = r;
    colArray[i3 + 1] = g;
    colArray[i3 + 2] = b;
    hasLiveParticles = true;
  };

  const clearParticles = () => {
    pActive.fill(0);
    posArray.fill(0);
    colArray.fill(0);
    spawnAccum.fill(0);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    hasLiveParticles = false;
  };

  const clear = () => {
    for (let i = 0; i < MAX_BALLS; i++) {
      ringWrappers[i].visible = false;
      ringMaterials[i].opacity = 0;
    }
    clearParticles();
  };

  const update = ({
    active,
    balls,
    dt,
    timeScale = 1,
    paused = false,
    resetSignal = false,
  }: SpinEffectsUpdateParams) => {
    if (resetSignal) {
      clearParticles();
    }

    if (!active) {
      for (let i = 0; i < MAX_BALLS; i++) {
        ringWrappers[i].visible = false;
      }
      if (hasLiveParticles) {
        clearParticles();
      }
      return;
    }

    const effectiveDt = paused ? 0 : dt * Math.max(0.1, timeScale);

    // 1. Update Equatorial Spin Rings & Emit Spin/Speed Particles
    for (let i = 0; i < MAX_BALLS; i++) {
      ringWrappers[i].visible = false;
    }

    for (let bIdx = 0; bIdx < balls.length; bIdx++) {
      const b = balls[bIdx];
      if (b.pocketed || b.id < 0 || b.id >= MAX_BALLS) continue;

      const speed = Math.hypot(b.vx, b.vz);
      const absWy = Math.abs(b.wy);

      // Update directional English spin marker ring
      if (absWy > SPIN_THRESHOLD) {
        const wrapper = ringWrappers[b.id];
        const mat = ringMaterials[b.id];
        wrapper.visible = true;

        // Place just above slate around ball equator for visibility from all angles
        wrapper.position.set(b.x, Math.max(SLATE_Y + 0.008, b.y - 0.004), b.z);

        const spinStrength = Math.min(1, (absWy - SPIN_THRESHOLD) / 55);
        const targetColor = b.wy >= 0 ? COLOR_LEFT_ENGLISH : COLOR_RIGHT_ENGLISH;
        mat.color.copy(targetColor);
        mat.opacity = 0.28 + spinStrength * 0.62;

        // Mirror horizontally when wy < 0 so chevron tips always point in rotation direction
        const sign = b.wy >= 0 ? 1 : -1;
        const pulseScale = 0.96 + spinStrength * 0.16;
        wrapper.scale.set(sign * pulseScale, pulseScale, pulseScale);

        // Rotate in exact direction of angular velocity wy (scaled for crisp visual readability)
        if (!paused) {
          wrapper.rotation.y += b.wy * 0.22 * effectiveDt;
        }
      }

      if (paused || effectiveDt <= 0) continue;

      // Particle Emission Rate: higher for strong English or high linear speed
      const spinNorm = absWy > SPIN_THRESHOLD ? Math.min(1, (absWy - SPIN_THRESHOLD) / 70) : 0;
      const speedNorm =
        speed > HIGH_SPEED_THRESHOLD
          ? Math.min(1, (speed - HIGH_SPEED_THRESHOLD) / 5.2)
          : 0;

      if (spinNorm <= 0 && speedNorm <= 0) continue;

      const emitRate = spinNorm * 58 + speedNorm * 46; // particles per second
      spawnAccum[b.id] += emitRate * effectiveDt;

      const dirX = speed > 0.01 ? b.vx / speed : 1;
      const dirZ = speed > 0.01 ? b.vz / speed : 0;

      while (spawnAccum[b.id] >= 1 && spawnAccum[b.id] < 12) {
        spawnAccum[b.id] -= 1;

        const isSpinParticle = spinNorm > 0 && (speedNorm === 0 || rand() < 0.62);

        if (isSpinParticle) {
          // Orbital chalk dust swirling tangentially around ball equator
          const angle = rand() * Math.PI * 2;
          const rad = BALL_RADIUS * (1.08 + rand() * 0.42);
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);

          const px = b.x + cosA * rad;
          const py = Math.max(SLATE_Y + 0.006, b.y - 0.006 + rand() * 0.018);
          const pz = b.z + sinA * rad;

          // World XZ tangent for CCW rotation around +Y: (+sinA, -cosA)
          const wySign = b.wy >= 0 ? 1 : -1;
          const tangSpeed = (0.14 + spinNorm * 0.24) * wySign;
          const vx = b.vx * 0.22 + sinA * tangSpeed + (rand() - 0.5) * 0.04;
          const vy = 0.035 + rand() * 0.065;
          const vz = b.vz * 0.22 - cosA * tangSpeed + (rand() - 0.5) * 0.04;

          if (b.wy >= 0) {
            // Left English: Cyan-chalk blend
            spawnParticle(px, py, pz, vx, vy, vz, 0.36, 0.82, 1.0, 0.34 + rand() * 0.22, wySign);
          } else {
            // Right English: Amber-gold chalk blend
            spawnParticle(px, py, pz, vx, vy, vz, 1.0, 0.72, 0.24, 0.34 + rand() * 0.22, wySign);
          }
        } else {
          // High-speed felt & chalk dust wake behind ball
          const spread = (rand() - 0.5) * BALL_RADIUS * 1.15;
          const perpX = -dirZ;
          const perpZ = dirX;
          const trailBack = BALL_RADIUS * (0.7 + rand() * 0.5);

          const px = b.x - dirX * trailBack + perpX * spread;
          const py = SLATE_Y + 0.005 + rand() * 0.015;
          const pz = b.z - dirZ * trailBack + perpZ * spread;

          const vx = -dirX * (0.08 + speedNorm * 0.16) + (rand() - 0.5) * 0.07;
          const vy = 0.028 + rand() * 0.055;
          const vz = -dirZ * (0.08 + speedNorm * 0.16) + (rand() - 0.5) * 0.07;

          // Crisp chalk ivory / pale emerald tint
          spawnParticle(px, py, pz, vx, vy, vz, 0.78, 0.94, 0.88, 0.26 + rand() * 0.2, 0);
        }
      }
      if (spawnAccum[b.id] >= 12) {
        spawnAccum[b.id] = 0;
      }
    }

    // 2. Advect & Fade Active Particles
    if (!paused && effectiveDt > 0 && hasLiveParticles) {
      let anyAlive = false;
      const drag = Math.exp(-3.2 * effectiveDt);

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        if (pActive[i] === 0) continue;

        pAge[i] += effectiveDt;
        const maxAge = pMaxAge[i];
        if (pAge[i] >= maxAge) {
          pActive[i] = 0;
          const i3 = i * 3;
          colArray[i3] = 0;
          colArray[i3 + 1] = 0;
          colArray[i3 + 2] = 0;
          posArray[i3 + 1] = -5; // Move off-table cleanly
          continue;
        }

        anyAlive = true;
        const i3 = i * 3;

        // Subtle aerodynamic swirl + drag
        if (pSwirl[i] !== 0) {
          const svx = pVx[i];
          const svz = pVz[i];
          const rotStep = pSwirl[i] * 2.2 * effectiveDt;
          pVx[i] = svx + svz * rotStep;
          pVz[i] = svz - svx * rotStep;
        }

        pVx[i] *= drag;
        pVy[i] *= drag;
        pVz[i] *= drag;

        posArray[i3] += pVx[i] * effectiveDt;
        posArray[i3 + 1] += pVy[i] * effectiveDt;
        posArray[i3 + 2] += pVz[i] * effectiveDt;

        const lifeLeft = 1 - pAge[i] / maxAge;
        const fade = lifeLeft * lifeLeft;
        colArray[i3] = pR[i] * fade;
        colArray[i3 + 1] = pG[i] * fade;
        colArray[i3 + 2] = pB[i] * fade;
      }

      hasLiveParticles = anyAlive;
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
  };

  const dispose = () => {
    clear();
    for (const mat of ringMaterials) {
      mat.dispose();
    }
    ringGeo.dispose();
    ringTexture.dispose();
    particleGeo.dispose();
    particleMat.dispose();
    dustTexture.dispose();
    scene.remove(group);
  };

  return { group, update, clear, dispose };
}
