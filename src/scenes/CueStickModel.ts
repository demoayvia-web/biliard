import * as THREE from 'three';
import { CUE_STYLES } from '../game/constants.ts';
import type { CueStyleId } from '../game/types.ts';

export interface CueStickInstance {
  group: THREE.Group;
  applyStyle: (styleId: CueStyleId) => void;
  dispose: () => void;
}

/**
 * Composite 6-part procedural billiard cue stick.
 * Local origin (0,0,0) is at the chalked cue tip, extending along -X (so rotating by shot angle points tip toward +X).
 */
export function buildCueStick(initialStyle: CueStyleId): CueStickInstance {
  const group = new THREE.Group();
  const style = CUE_STYLES[initialStyle];

  const tipMat = new THREE.MeshStandardMaterial({ color: 0x1e6091, roughness: 0.9, metalness: 0.0 });
  const ferruleMat = new THREE.MeshPhysicalMaterial({ color: 0xf6f3ea, roughness: 0.2, clearcoat: 0.7 });
  const shaftMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(style.shaftColor),
    roughness: 0.3,
    metalness: 0.04,
    clearcoat: 0.55,
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(style.inlayColor),
    roughness: 0.22,
    metalness: 0.85,
  });
  const wrapMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(style.wrapColor),
    roughness: 0.78,
    metalness: 0.05,
  });
  const buttMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(style.buttColor),
    roughness: 0.22,
    metalness: 0.1,
    clearcoat: 0.85,
  });
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

  const makeCylinder = (rFront: number, rBack: number, len: number, xStart: number, mat: THREE.Material) => {
    const geo = new THREE.CylinderGeometry(rBack, rFront, len, 18);
    geo.rotateZ(Math.PI / 2); // +Y becomes -X
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(xStart - len / 2, 0, 0);
    mesh.castShadow = true;
    group.add(mesh);
    return geo;
  };

  // Total cue length ~1.47m
  const g1 = makeCylinder(0.0062, 0.0064, 0.008, 0, tipMat);
  const g2 = makeCylinder(0.0064, 0.0068, 0.024, -0.008, ferruleMat);
  const g3 = makeCylinder(0.0068, 0.0108, 0.71, -0.032, shaftMat);
  const g4 = makeCylinder(0.0108, 0.0112, 0.025, -0.742, jointMat);
  const g5 = makeCylinder(0.0112, 0.0132, 0.34, -0.767, wrapMat);
  const g6 = makeCylinder(0.0132, 0.0156, 0.35, -1.107, buttMat);
  const g7 = makeCylinder(0.0156, 0.015, 0.018, -1.457, bumperMat);

  // Subtle cue elevation (~3.5 degrees)
  group.rotation.z = -0.06;

  const applyStyle = (styleId: CueStyleId) => {
    const s = CUE_STYLES[styleId];
    shaftMat.color.set(s.shaftColor);
    buttMat.color.set(s.buttColor);
    wrapMat.color.set(s.wrapColor);
    jointMat.color.set(s.inlayColor);
  };

  const dispose = () => {
    [g1, g2, g3, g4, g5, g6, g7, tipMat, ferruleMat, shaftMat, jointMat, wrapMat, buttMat, bumperMat].forEach((x) =>
      x.dispose(),
    );
  };

  return { group, applyStyle, dispose };
}
