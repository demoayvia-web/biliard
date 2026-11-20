import * as THREE from 'three';
import { BALL_COLORS, BALL_RADIUS, SLATE_Y } from '../game/constants.ts';
import type { ShotReplayData } from '../game/types.ts';

interface BallTrailEntry {
  ballId: number;
  baseLine: THREE.Line;
  activeLine: THREE.Line;
  frameCount: number;
}

export interface ReplayTrailsInstance {
  group: THREE.Group;
  setReplay: (replay: ShotReplayData | null) => void;
  updateProgress: (visible: boolean, currentTime: number, showCuePathTracer?: boolean) => void;
  dispose: () => void;
}

/**
 * Renders 3D ball trajectory lines on the table surface during Last-Shot Replay:
 * - Progressive multi-ball trails (toggled by `Trails`)
 * - Persistent full-shot cue ball floor path tracer + impact markers (toggled by `Path Tracer`)
 */
export function buildReplayTrails(scene: THREE.Scene): ReplayTrailsInstance {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const trailsGroup = new THREE.Group();
  const cueTracerGroup = new THREE.Group();
  group.add(trailsGroup);
  group.add(cueTracerGroup);

  let entries: BallTrailEntry[] = [];
  let tracerDisposables: Array<{ dispose: () => void }> = [];
  let activeReplay: ShotReplayData | null = null;
  const trailY = SLATE_Y + 0.005;
  const tracerY = SLATE_Y + 0.0068;

  const clearEntries = () => {
    for (const e of entries) {
      trailsGroup.remove(e.baseLine);
      trailsGroup.remove(e.activeLine);
      e.baseLine.geometry.dispose();
      (e.baseLine.material as THREE.Material).dispose();
      e.activeLine.geometry.dispose();
      (e.activeLine.material as THREE.Material).dispose();
    }
    entries = [];

    while (cueTracerGroup.children.length > 0) {
      cueTracerGroup.remove(cueTracerGroup.children[0]);
    }
    for (const d of tracerDisposables) {
      d.dispose();
    }
    tracerDisposables = [];
  };

  const setReplay = (replay: ShotReplayData | null) => {
    if (activeReplay === replay) return;
    activeReplay = replay;
    clearEntries();

    if (!replay || replay.frames.length < 2) return;

    const frameCount = replay.frames.length;
    const firstFrame = replay.frames[0];

    // 1. Progressive multi-ball trails
    for (const firstPose of firstFrame.balls) {
      const id = firstPose.id;
      if (firstPose.pocketed) continue;

      let totalDist = 0;
      let prevX = firstPose.x;
      let prevZ = firstPose.z;
      const points: number[] = [];

      for (let f = 0; f < frameCount; f++) {
        const pose = replay.frames[f].balls.find((b) => b.id === id);
        if (!pose || pose.pocketed) {
          points.push(prevX, trailY, prevZ);
          continue;
        }
        const segDist = Math.hypot(pose.x - prevX, pose.z - prevZ);
        totalDist += segDist;
        prevX = pose.x;
        prevZ = pose.z;
        points.push(pose.x, trailY, pose.z);
      }

      if (totalDist < 0.025) continue;

      const colorHex = id === 0 ? '#34D399' : BALL_COLORS[id]?.hex ?? '#FFFFFF';
      const baseGeo = new THREE.BufferGeometry();
      baseGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));

      const baseMat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: id === 0 ? 0.28 : 0.2,
        depthWrite: false,
      });
      const baseLine = new THREE.Line(baseGeo, baseMat);
      trailsGroup.add(baseLine);

      const activeGeo = new THREE.BufferGeometry();
      activeGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      activeGeo.setDrawRange(0, 1);

      const activeMat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: id === 0 ? 0.95 : 0.82,
        depthWrite: false,
      });
      const activeLine = new THREE.Line(activeGeo, activeMat);
      trailsGroup.add(activeLine);

      entries.push({
        ballId: id,
        baseLine,
        activeLine,
        frameCount,
      });
    }

    // 2. Persistent Cue-Ball Floor Path Tracer (full trajectory + start/impact/end markers)
    const firstCue = firstFrame.balls.find((b) => b.id === 0);
    if (firstCue && !firstCue.pocketed) {
      const tracerPoints: number[] = [];
      let prevX = firstCue.x;
      let prevZ = firstCue.z;
      let endX = firstCue.x;
      let endZ = firstCue.z;
      let cueDist = 0;

      for (let f = 0; f < frameCount; f++) {
        const pose = replay.frames[f].balls.find((b) => b.id === 0);
        if (!pose || pose.pocketed) {
          tracerPoints.push(prevX, tracerY, prevZ);
          continue;
        }
        cueDist += Math.hypot(pose.x - prevX, pose.z - prevZ);
        prevX = pose.x;
        prevZ = pose.z;
        endX = pose.x;
        endZ = pose.z;
        tracerPoints.push(pose.x, tracerY, pose.z);
      }

      if (cueDist >= 0.015) {
        // Primary luminous gold tracer line across full shot duration
        const tracerGeo = new THREE.BufferGeometry();
        tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute(tracerPoints, 3));
        const tracerMat = new THREE.LineBasicMaterial({
          color: 0xfde047,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
        });
        const tracerLine = new THREE.Line(tracerGeo, tracerMat);
        cueTracerGroup.add(tracerLine);
        tracerDisposables.push(tracerGeo, tracerMat);

        // Soft cyan under-glow slightly shifted for crisp floor contrast on any cloth
        const glowGeo = new THREE.BufferGeometry();
        const glowPoints = tracerPoints.map((v, idx) => (idx % 3 === 1 ? tracerY - 0.0008 : v));
        glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPoints, 3));
        const glowMat = new THREE.LineBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        });
        const glowLine = new THREE.Line(glowGeo, glowMat);
        cueTracerGroup.add(glowLine);
        tracerDisposables.push(glowGeo, glowMat);

        // Start marker ring on floor (cyan)
        const startGeo = new THREE.RingGeometry(BALL_RADIUS * 0.45, BALL_RADIUS * 0.72, 24);
        startGeo.rotateX(-Math.PI / 2);
        const startMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const startRing = new THREE.Mesh(startGeo, startMat);
        startRing.position.set(firstCue.x, tracerY + 0.0005, firstCue.z);
        cueTracerGroup.add(startRing);
        tracerDisposables.push(startGeo, startMat);

        // Final resting / scratch ring on floor (gold)
        const endGeo = new THREE.RingGeometry(BALL_RADIUS * 0.55, BALL_RADIUS * 0.85, 24);
        endGeo.rotateX(-Math.PI / 2);
        const endMat = new THREE.MeshBasicMaterial({
          color: 0xfde047,
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const endRing = new THREE.Mesh(endGeo, endMat);
        endRing.position.set(endX, tracerY + 0.0005, endZ);
        cueTracerGroup.add(endRing);
        tracerDisposables.push(endGeo, endMat);

        // Cushion & ball impact floor pips along cue ball trajectory
        const impactCoords: number[] = [];
        for (const ev of replay.events) {
          if ((ev.type === 'ball-ball' || ev.type === 'cushion') && (ev.ballA === 0 || ev.ballB === 0)) {
            impactCoords.push(ev.x, tracerY + 0.001, ev.z);
          }
        }
        if (impactCoords.length > 0) {
          const pipGeo = new THREE.BufferGeometry();
          pipGeo.setAttribute('position', new THREE.Float32BufferAttribute(impactCoords, 3));
          const pipMat = new THREE.PointsMaterial({
            color: 0xfef08a,
            size: 0.026,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
          });
          const pipPoints = new THREE.Points(pipGeo, pipMat);
          cueTracerGroup.add(pipPoints);
          tracerDisposables.push(pipGeo, pipMat);
        }
      }
    }
  };

  const updateProgress = (
    showTrails: boolean,
    currentTime: number,
    showCuePathTracer = false,
  ) => {
    const anyVisible = (showTrails || showCuePathTracer) && Boolean(activeReplay);
    if (!anyVisible || !activeReplay) {
      group.visible = false;
      return;
    }

    group.visible = true;
    trailsGroup.visible = showTrails && entries.length > 0;
    cueTracerGroup.visible = showCuePathTracer && cueTracerGroup.children.length > 0;

    if (trailsGroup.visible) {
      const frames = activeReplay.frames;
      let idx = 1;
      while (idx < frames.length && frames[idx].time <= currentTime) {
        idx++;
      }
      const drawCount = Math.max(2, Math.min(frames.length, idx));
      for (const e of entries) {
        e.activeLine.geometry.setDrawRange(0, drawCount);
      }
    }
  };

  const dispose = () => {
    clearEntries();
    scene.remove(group);
  };

  return { group, setReplay, updateProgress, dispose };
}
