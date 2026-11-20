import * as THREE from 'three';
import {
  BALL_DIAMETER,
  BALL_RADIUS,
  BALL_REST_Y,
  HALF_LENGTH,
  HALF_WIDTH,
  SLATE_Y,
} from '../game/constants.ts';
import type { PracticeIdealShot } from '../game/rules.ts';
import type { BallState } from '../game/types.ts';

export interface AimingVisualsInstance {
  group: THREE.Group;
  update: (opts: {
    visible: boolean;
    cueBall: BallState | undefined;
    balls: BallState[];
    legalTargetIds: number[];
    angle: number;
    aimAssist: 'full' | 'short' | 'off';
    ghostBallGuide?: boolean;
    isBallInHand: boolean;
    ballInHandValid: boolean;
    idealShot?: PracticeIdealShot | null;
  }) => void;
  dispose: () => void;
}

function createGhostProjectionTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Plane width is BALL_DIAMETER * 1.48, so ball radius = (1 / 1.48) * (size / 2)
  const ballPxRadius = (size / 2) / 1.48;

  // Soft interior projection wash
  const fillGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, ballPxRadius);
  fillGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.24)');
  fillGrad.addColorStop(0.75, 'rgba(255, 255, 255, 0.14)');
  fillGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.36)');
  ctx.fillStyle = fillGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, ballPxRadius, 0, Math.PI * 2);
  ctx.fill();

  // Exact ball-footprint circumference ring
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(cx, cy, ballPxRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Outer subtle halo dashed ring
  ctx.save();
  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, ballPxRadius * 1.24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Precision center crosshair ticks
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 2;
  const crossInner = 8;
  const crossOuter = ballPxRadius * 0.48;
  ctx.beginPath();
  ctx.moveTo(cx - crossOuter, cy);
  ctx.lineTo(cx - crossInner, cy);
  ctx.moveTo(cx + crossInner, cy);
  ctx.lineTo(cx + crossOuter, cy);
  ctx.moveTo(cx, cy - crossOuter);
  ctx.lineTo(cx, cy - crossInner);
  ctx.moveTo(cx, cy + crossInner);
  ctx.lineTo(cx, cy + crossOuter);
  ctx.stroke();

  // Center pip
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  // Highlighted forward contact arc (+X side faces target ball when rotated)
  ctx.strokeStyle = 'rgba(255, 255, 255, 1.0)';
  ctx.lineWidth = 7.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, ballPxRadius, -0.52, 0.52);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const CUT_FAN_SEGMENTS = 10;

/**
 * Professional aiming aid:
 * - Main shot trajectory line
 * - Translucent Ghost Ball + precision Table-Surface Ghost-Ball Projection decal
 * - Impact tangency contact point pip & cut-angle floor wedge for complex cut shots
 * - Target ball deflection trajectory & Cue ball tangent deflection line
 * - Legal vs Illegal target color indicator
 */
export function buildAimingVisuals(scene: THREE.Scene): AimingVisualsInstance {
  const group = new THREE.Group();
  const lineY = BALL_REST_Y + 0.002;
  const surfaceY = SLATE_Y + 0.0024;

  const mainLineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0),
  ]);
  const mainLineMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.78,
  });
  const mainLine = new THREE.Line(mainLineGeo, mainLineMat);
  group.add(mainLine);

  const targetLineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0),
  ]);
  const targetLineMat = new THREE.LineBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.85,
  });
  const targetLine = new THREE.Line(targetLineGeo, targetLineMat);
  group.add(targetLine);

  const cueDeflectGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0),
  ]);
  const cueDeflectMat = new THREE.LineBasicMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.45,
  });
  const cueDeflectLine = new THREE.Line(cueDeflectGeo, cueDeflectMat);
  group.add(cueDeflectLine);

  // Translucent 3D Ghost Ball + Ring at contact point
  const ghostGeo = new THREE.SphereGeometry(BALL_RADIUS * 0.98, 24, 16);
  const ghostMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const ghostSphere = new THREE.Mesh(ghostGeo, ghostMat);
  group.add(ghostSphere);

  const ringGeo = new THREE.RingGeometry(BALL_RADIUS * 0.92, BALL_RADIUS * 1.12, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ghostRing = new THREE.Mesh(ringGeo, ringMat);
  group.add(ghostRing);

  // Table-Surface Ghost-Ball Optical Projection Decal (oriented toward target ball)
  const ghostProjTex = createGhostProjectionTexture();
  const projPlaneSize = BALL_DIAMETER * 1.48;
  const ghostProjGeo = new THREE.PlaneGeometry(projPlaneSize, projPlaneSize);
  ghostProjGeo.rotateX(-Math.PI / 2);
  const ghostProjMat = new THREE.MeshBasicMaterial({
    map: ghostProjTex,
    color: 0x10b981,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ghostProjMesh = new THREE.Mesh(ghostProjGeo, ghostProjMat);
  group.add(ghostProjMesh);

  // Exact tangency Contact Point Pip on the table surface between ghost ball & object ball
  const contactPipGeo = new THREE.CircleGeometry(BALL_RADIUS * 0.22, 20);
  contactPipGeo.rotateX(-Math.PI / 2);
  const contactPipMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const contactPipMesh = new THREE.Mesh(contactPipGeo, contactPipMat);
  group.add(contactPipMesh);

  // Cut-Angle Floor Wedge between incoming cue path & outgoing target ball direction
  const cutFanPositions = new Float32Array(CUT_FAN_SEGMENTS * 3 * 3);
  const cutFanGeo = new THREE.BufferGeometry();
  const cutFanPosAttr = new THREE.BufferAttribute(cutFanPositions, 3);
  cutFanPosAttr.setUsage(THREE.DynamicDrawUsage);
  cutFanGeo.setAttribute('position', cutFanPosAttr);
  const cutFanMat = new THREE.MeshBasicMaterial({
    color: 0x34d399,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const cutFanMesh = new THREE.Mesh(cutFanGeo, cutFanMat);
  cutFanMesh.frustumCulled = false;
  group.add(cutFanMesh);

  // Ball-in-hand placement indicator ring around cue ball
  const bihGeo = new THREE.RingGeometry(BALL_RADIUS * 1.3, BALL_RADIUS * 1.65, 32);
  bihGeo.rotateX(-Math.PI / 2);
  const bihMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const bihRing = new THREE.Mesh(bihGeo, bihMat);
  group.add(bihRing);

  // Practice Ideal Ghost Ball Guide visuals (dashed gold/amber path, cyan-emerald when aligned)
  const idealCueGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0),
  ]);
  const idealCueMat = new THREE.LineDashedMaterial({
    color: 0xfbbf24,
    dashSize: 0.045,
    gapSize: 0.025,
    transparent: true,
    opacity: 0.85,
  });
  const idealCueLine = new THREE.Line(idealCueGeo, idealCueMat);
  group.add(idealCueLine);

  const idealTargetGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0),
  ]);
  const idealTargetMat = new THREE.LineDashedMaterial({
    color: 0xfbbf24,
    dashSize: 0.04,
    gapSize: 0.022,
    transparent: true,
    opacity: 0.88,
  });
  const idealTargetLine = new THREE.Line(idealTargetGeo, idealTargetMat);
  group.add(idealTargetLine);

  const idealGhostGeo = new THREE.SphereGeometry(BALL_RADIUS * 0.99, 24, 16);
  const idealGhostMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const idealGhostSphere = new THREE.Mesh(idealGhostGeo, idealGhostMat);
  group.add(idealGhostSphere);

  const idealRingGeo = new THREE.RingGeometry(BALL_RADIUS * 0.96, BALL_RADIUS * 1.24, 32);
  idealRingGeo.rotateX(-Math.PI / 2);
  const idealRingMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const idealGhostRing = new THREE.Mesh(idealRingGeo, idealRingMat);
  group.add(idealGhostRing);

  const idealPocketGeo = new THREE.RingGeometry(BALL_RADIUS * 1.15, BALL_RADIUS * 1.52, 32);
  idealPocketGeo.rotateX(-Math.PI / 2);
  const idealPocketMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const idealPocketRing = new THREE.Mesh(idealPocketGeo, idealPocketMat);
  group.add(idealPocketRing);

  const hideIdealGuide = () => {
    idealCueLine.visible = false;
    idealTargetLine.visible = false;
    idealGhostSphere.visible = false;
    idealGhostRing.visible = false;
    idealPocketRing.visible = false;
  };

  scene.add(group);

  const setLineEndpoints = (
    line: THREE.Line,
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    y = lineY,
  ) => {
    const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.setXYZ(0, x1, y, z1);
    posAttr.setXYZ(1, x2, y, z2);
    posAttr.needsUpdate = true;
  };

  const updateCutFan = (
    cx: number,
    cz: number,
    inAngle: number,
    outAngle: number,
    isLegal: boolean,
  ) => {
    let delta = outAngle - inAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const absDelta = Math.abs(delta);
    if (absDelta < 0.05) {
      cutFanMesh.visible = false;
      return;
    }

    cutFanMesh.visible = true;
    const fanRadius = BALL_DIAMETER * 1.32;
    const y = surfaceY - 0.0002;

    for (let i = 0; i < CUT_FAN_SEGMENTS; i++) {
      const a0 = inAngle + (delta * i) / CUT_FAN_SEGMENTS;
      const a1 = inAngle + (delta * (i + 1)) / CUT_FAN_SEGMENTS;
      const base = i * 9;

      cutFanPositions[base] = cx;
      cutFanPositions[base + 1] = y;
      cutFanPositions[base + 2] = cz;

      cutFanPositions[base + 3] = cx + Math.cos(a0) * fanRadius;
      cutFanPositions[base + 4] = y;
      cutFanPositions[base + 5] = cz + Math.sin(a0) * fanRadius;

      cutFanPositions[base + 6] = cx + Math.cos(a1) * fanRadius;
      cutFanPositions[base + 7] = y;
      cutFanPositions[base + 8] = cz + Math.sin(a1) * fanRadius;
    }
    cutFanPosAttr.needsUpdate = true;

    if (!isLegal) {
      cutFanMat.color.setHex(0xef4444);
      cutFanMat.opacity = 0.22;
    } else if (absDelta > 0.66) {
      // Steep/thin cut (> ~38 deg) highlighted in warm amber-gold
      cutFanMat.color.setHex(0xf59e0b);
      cutFanMat.opacity = 0.28;
    } else {
      cutFanMat.color.setHex(0x34d399);
      cutFanMat.opacity = 0.22;
    }
  };

  const update: AimingVisualsInstance['update'] = ({
    visible,
    cueBall,
    balls,
    legalTargetIds,
    angle,
    aimAssist,
    ghostBallGuide = true,
    isBallInHand,
    ballInHandValid,
    idealShot,
  }) => {
    if (!visible || !cueBall || cueBall.pocketed) {
      group.visible = false;
      hideIdealGuide();
      return;
    }

    group.visible = true;

    if (isBallInHand) {
      mainLine.visible = false;
      targetLine.visible = false;
      cueDeflectLine.visible = false;
      ghostSphere.visible = false;
      ghostRing.visible = false;
      ghostProjMesh.visible = false;
      contactPipMesh.visible = false;
      cutFanMesh.visible = false;
      hideIdealGuide();
      bihRing.visible = true;
      bihRing.position.set(cueBall.x, BALL_REST_Y - BALL_RADIUS + 0.003, cueBall.z);
      bihMat.color.setHex(ballInHandValid ? 0x10b981 : 0xef4444);
      return;
    }

    bihRing.visible = false;

    // Render Practice Ideal Ghost Ball Guide if provided
    if (idealShot) {
      const aligned = Math.abs(idealShot.angleErrorDeg) <= 1.5;
      const guideColor = aligned ? 0x34d399 : 0xfbbf24;
      const idealLineY = lineY + 0.0015;

      idealCueLine.visible = true;
      idealCueMat.color.setHex(guideColor);
      setLineEndpoints(
        idealCueLine,
        cueBall.x,
        cueBall.z,
        idealShot.ghostX,
        idealShot.ghostZ,
        idealLineY,
      );
      idealCueLine.computeLineDistances();

      idealTargetLine.visible = true;
      idealTargetMat.color.setHex(guideColor);
      setLineEndpoints(
        idealTargetLine,
        idealShot.targetX,
        idealShot.targetZ,
        idealShot.pocketX,
        idealShot.pocketZ,
        idealLineY,
      );
      idealTargetLine.computeLineDistances();

      idealGhostSphere.visible = true;
      idealGhostSphere.position.set(idealShot.ghostX, BALL_REST_Y, idealShot.ghostZ);
      idealGhostMat.color.setHex(guideColor);

      idealGhostRing.visible = true;
      idealGhostRing.position.set(
        idealShot.ghostX,
        BALL_REST_Y - BALL_RADIUS + 0.0028,
        idealShot.ghostZ,
      );
      idealRingMat.color.setHex(guideColor);

      idealPocketRing.visible = true;
      idealPocketRing.position.set(
        idealShot.pocketX,
        BALL_REST_Y - BALL_RADIUS + 0.0028,
        idealShot.pocketZ,
      );
      idealPocketMat.color.setHex(guideColor);
    } else {
      hideIdealGuide();
    }

    if (aimAssist === 'off') {
      mainLine.visible = false;
      targetLine.visible = false;
      cueDeflectLine.visible = false;
      ghostSphere.visible = false;
      ghostRing.visible = false;
      ghostProjMesh.visible = false;
      contactPipMesh.visible = false;
      cutFanMesh.visible = false;
      return;
    }

    const dx = Math.cos(angle);
    const dz = Math.sin(angle);

    // 1. Find earliest cushion wall intersection distance
    const maxX = HALF_LENGTH - BALL_RADIUS;
    const minX = -HALF_LENGTH + BALL_RADIUS;
    const maxZ = HALF_WIDTH - BALL_RADIUS;
    const minZ = -HALF_WIDTH + BALL_RADIUS;

    let wallDist = 4.0;
    if (Math.abs(dx) > 1e-6) {
      const tx = ((dx > 0 ? maxX : minX) - cueBall.x) / dx;
      if (tx > 0 && tx < wallDist) wallDist = tx;
    }
    if (Math.abs(dz) > 1e-6) {
      const tz = ((dz > 0 ? maxZ : minZ) - cueBall.z) / dz;
      if (tz > 0 && tz < wallDist) wallDist = tz;
    }

    // 2. Circle-sweep raycast against all active object balls
    let hitDist = wallDist;
    let hitBall: BallState | null = null;
    const sumR = BALL_DIAMETER;

    for (const b of balls) {
      if (b.id === 0 || b.pocketed) continue;
      const ocX = b.x - cueBall.x;
      const ocZ = b.z - cueBall.z;
      const proj = ocX * dx + ocZ * dz;
      if (proj <= 0) continue;

      const perpSq = (ocX * ocX + ocZ * ocZ) - proj * proj;
      const rSq = sumR * sumR;
      if (perpSq >= rSq) continue;

      const thc = Math.sqrt(rSq - perpSq);
      const t = proj - thc;
      if (t > 0 && t < hitDist) {
        hitDist = t;
        hitBall = b;
      }
    }

    const effectiveDist = aimAssist === 'short' ? Math.min(hitDist, 0.55) : hitDist;
    const endX = cueBall.x + dx * effectiveDist;
    const endZ = cueBall.z + dz * effectiveDist;

    mainLine.visible = true;
    setLineEndpoints(mainLine, cueBall.x, cueBall.z, endX, endZ);

    if (hitBall && (aimAssist === 'full' || hitDist <= 0.55)) {
      const isLegal = legalTargetIds.includes(hitBall.id);
      const indicatorHex = isLegal ? 0x10b981 : 0xef4444;

      // Object ball trajectory vector (line of centers)
      const objDirX = hitBall.x - endX;
      const objDirZ = hitBall.z - endZ;
      const len = Math.hypot(objDirX, objDirZ) || 1;
      const uObjX = objDirX / len;
      const uObjZ = objDirZ / len;
      const outAngle = Math.atan2(uObjZ, uObjX);

      if (ghostBallGuide) {
        ghostSphere.visible = true;
        ghostSphere.position.set(endX, BALL_REST_Y, endZ);
        ghostMat.color.setHex(indicatorHex);

        ghostRing.visible = true;
        ghostRing.position.set(endX, BALL_REST_Y - BALL_RADIUS + 0.002, endZ);
        ringMat.color.setHex(indicatorHex);

        // Table-Surface Ghost-Ball Projection Decal oriented toward impact point
        ghostProjMesh.visible = true;
        ghostProjMesh.position.set(endX, surfaceY, endZ);
        ghostProjMesh.rotation.y = -outAngle;
        ghostProjMat.color.setHex(indicatorHex);

        // Contact tangency pip on the felt where cue ball meets object ball
        contactPipMesh.visible = true;
        contactPipMesh.position.set(
          endX + uObjX * BALL_RADIUS,
          surfaceY + 0.0006,
          endZ + uObjZ * BALL_RADIUS,
        );
        contactPipMat.color.setHex(isLegal ? 0xfef08a : 0xfca5a5);

        // Cut-angle floor wedge between incoming cue direction and outgoing target direction
        updateCutFan(endX, endZ, angle, outAngle, isLegal);
      } else {
        ghostSphere.visible = false;
        ghostRing.visible = false;
        ghostProjMesh.visible = false;
        contactPipMesh.visible = false;
        cutFanMesh.visible = false;
      }

      const targetLineLen = aimAssist === 'full' ? 0.65 : 0.25;
      targetLine.visible = true;
      targetLineMat.color.setHex(indicatorHex);
      setLineEndpoints(
        targetLine,
        hitBall.x,
        hitBall.z,
        hitBall.x + uObjX * targetLineLen,
        hitBall.z + uObjZ * targetLineLen,
      );

      // Cue ball tangent deflection line (90 degrees to object ball travel)
      if (aimAssist === 'full') {
        let tanX = -uObjZ;
        let tanZ = uObjX;
        if (tanX * dx + tanZ * dz < 0) {
          tanX = -tanX;
          tanZ = -tanZ;
        }
        const cutStrength = 1 - Math.abs(dx * uObjX + dz * uObjZ);
        const deflectLen = 0.14 + cutStrength * 0.38;
        cueDeflectLine.visible = cutStrength > 0.04;
        setLineEndpoints(
          cueDeflectLine,
          endX,
          endZ,
          endX + tanX * deflectLen,
          endZ + tanZ * deflectLen,
        );
      } else {
        cueDeflectLine.visible = false;
      }
    } else {
      const showIdleGhost = ghostBallGuide && aimAssist === 'full';
      ghostSphere.visible = showIdleGhost;
      ghostSphere.position.set(endX, BALL_REST_Y, endZ);
      ghostMat.color.setHex(0xffffff);

      ghostRing.visible = showIdleGhost;
      ghostRing.position.set(endX, BALL_REST_Y - BALL_RADIUS + 0.002, endZ);
      ringMat.color.setHex(0xffffff);

      ghostProjMesh.visible = showIdleGhost;
      ghostProjMesh.position.set(endX, surfaceY, endZ);
      ghostProjMesh.rotation.y = -angle;
      ghostProjMat.color.setHex(0xe2e8f0);

      contactPipMesh.visible = false;
      cutFanMesh.visible = false;
      targetLine.visible = false;
      cueDeflectLine.visible = false;
    }
  };

  const dispose = () => {
    scene.remove(group);
    [
      mainLineGeo,
      mainLineMat,
      targetLineGeo,
      targetLineMat,
      cueDeflectGeo,
      cueDeflectMat,
      ghostGeo,
      ghostMat,
      ringGeo,
      ringMat,
      ghostProjTex,
      ghostProjGeo,
      ghostProjMat,
      contactPipGeo,
      contactPipMat,
      cutFanGeo,
      cutFanMat,
      bihGeo,
      bihMat,
      idealCueGeo,
      idealCueMat,
      idealTargetGeo,
      idealTargetMat,
      idealGhostGeo,
      idealGhostMat,
      idealRingGeo,
      idealRingMat,
      idealPocketGeo,
      idealPocketMat,
    ].forEach((x) => x.dispose());
  };

  return { group, update, dispose };
}
