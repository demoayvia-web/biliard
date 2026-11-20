import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ENVIRONMENTS } from '../game/constants.ts';
import type { EnvironmentId } from '../game/types.ts';
import { createWoodTextures } from './textures.ts';

export interface EnvironmentRigInstance {
  group: THREE.Group;
  applyEnvironment: (envId: EnvironmentId) => void;
  setShadowQuality: (mapSize: number, enabled: boolean) => void;
  dispose: () => void;
}

/**
 * Sets up RoomEnvironment PBR IBL, 3-point lighting rig (<= 3 shadow casters),
 * horizon-matched fog, and surrounding billiard room architecture across 4 distinct themes.
 */
export function buildEnvironmentRig(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  initialEnv: EnvironmentId,
  maxAnisotropy: number,
): EnvironmentRigInstance {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // Mandatory Studio PBR Reflections (RoomEnvironment + PMREMGenerator)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();
  disposables.push(envTex);

  const envCfg = ENVIRONMENTS[initialEnv];
  scene.background = new THREE.Color(envCfg.bgHex);
  scene.fog = new THREE.FogExp2(envCfg.fogHex, envCfg.fogDensity);

  // 1. Warm Key Directional Light (tight orthographic shadow frustum covering the table)
  const keyLight = new THREE.DirectionalLight(envCfg.keyColor, envCfg.keyIntensity);
  keyLight.position.set(0.75, 4.6, 0.85);
  keyLight.castShadow = renderer.shadowMap.enabled;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.radius = 3.0;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 10;
  keyLight.shadow.camera.left = -2.2;
  keyLight.shadow.camera.right = 2.2;
  keyLight.shadow.camera.top = 2.2;
  keyLight.shadow.camera.bottom = -2.2;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  // 2. Cool Hemisphere Fill
  const hemiLight = new THREE.HemisphereLight(envCfg.hemiSky, envCfg.hemiGround, envCfg.hemiIntensity);
  scene.add(hemiLight);

  // 3. Overhead 3-Shade Pendant Point Lights (unshadowed, highlights cloth weave & ball speculars)
  const tableGlow = new THREE.PointLight(0xfff1d6, 1.25, 7.5, 1.8);
  tableGlow.position.set(0, 2.05, 0);
  scene.add(tableGlow);

  const tableGlowLeft = new THREE.PointLight(0xfff1d6, 0.58, 6.5, 1.8);
  tableGlowLeft.position.set(-0.72, 2.02, 0);
  scene.add(tableGlowLeft);

  const tableGlowRight = new THREE.PointLight(0xfff1d6, 0.58, 6.5, 1.8);
  tableGlowRight.position.set(0.72, 2.02, 0);
  scene.add(tableGlowRight);

  // Room Architecture: Floor, Perimeter Walls, Wainscoting Pillars & Neon/Accent Cove Strips
  const floorTex = createWoodTextures(envCfg.floorColor, maxAnisotropy);
  floorTex.map.repeat.set(6, 6);
  floorTex.roughnessMap.repeat.set(6, 6);

  const floorGeo = new THREE.PlaneGeometry(18, 18);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex.map,
    roughnessMap: floorTex.roughnessMap,
    roughness: 0.42,
    metalness: 0.08,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo, floorMat, floorTex.map, floorTex.roughnessMap);

  // Subtle decorative carpet rug directly beneath the billiard table (offset y=0.002)
  const rugGeo = new THREE.PlaneGeometry(4.4, 3.0);
  rugGeo.rotateX(-Math.PI / 2);
  const rugMat = new THREE.MeshStandardMaterial({
    color: 0x161412,
    roughness: 0.95,
    metalness: 0.0,
  });
  const rug = new THREE.Mesh(rugGeo, rugMat);
  rug.position.set(0, 0.002, 0);
  rug.receiveShadow = true;
  group.add(rug);
  disposables.push(rugGeo, rugMat);

  // Architectural Room Walls
  const wallMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(envCfg.wallColor),
    roughness: 0.85,
    metalness: 0.05,
  });
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x1e1815,
    roughness: 0.55,
    metalness: 0.15,
  });
  const accentStripMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(envCfg.accentHex),
  });
  disposables.push(wallMat, pillarMat, accentStripMat);

  const wallHeight = 4.5;
  const roomRadius = 6.2;
  const wallConfigs: Array<{ x: number; z: number; w: number; rotY: number }> = [
    { x: 0, z: -roomRadius, w: roomRadius * 2, rotY: 0 },
    { x: 0, z: roomRadius, w: roomRadius * 2, rotY: Math.PI },
    { x: -roomRadius, z: 0, w: roomRadius * 2, rotY: Math.PI / 2 },
    { x: roomRadius, z: 0, w: roomRadius * 2, rotY: -Math.PI / 2 },
  ];

  const wallGeo = new THREE.PlaneGeometry(roomRadius * 2, wallHeight);
  const stripGeo = new THREE.BoxGeometry(roomRadius * 1.9, 0.035, 0.04);
  disposables.push(wallGeo, stripGeo);

  for (const wc of wallConfigs) {
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(wc.x, wallHeight / 2, wc.z);
    wall.rotation.y = wc.rotY;
    group.add(wall);

    // Architectural cove accent line along upper wall
    const strip = new THREE.Mesh(stripGeo, accentStripMat);
    strip.position.set(
      wc.x === 0 ? 0 : wc.x - Math.sign(wc.x) * 0.04,
      3.4,
      wc.z === 0 ? 0 : wc.z - Math.sign(wc.z) * 0.04,
    );
    strip.rotation.y = wc.rotY;
    group.add(strip);
  }

  // 8 Architectural Columns around the room perimeter (InstancedMesh)
  const colGeo = new THREE.BoxGeometry(0.28, wallHeight, 0.28);
  const colInst = new THREE.InstancedMesh(colGeo, pillarMat, 8);
  const dummy = new THREE.Object3D();
  const colCoords: Array<[number, number]> = [
    [-5.9, -5.9],
    [0, -5.95],
    [5.9, -5.9],
    [-5.95, 0],
    [5.95, 0],
    [-5.9, 5.9],
    [0, 5.95],
    [5.9, 5.9],
  ];
  colCoords.forEach(([cx, cz], i) => {
    dummy.position.set(cx, wallHeight / 2, cz);
    dummy.updateMatrix();
    colInst.setMatrixAt(i, dummy.matrix);
  });
  colInst.instanceMatrix.needsUpdate = true;
  colInst.computeBoundingSphere();
  group.add(colInst);
  disposables.push(colGeo);

  // Cue Rack Silhouette on Back Wall
  const rackGroup = new THREE.Group();
  rackGroup.position.set(0, 1.35, -5.82);
  const rackBoard = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 0.06), pillarMat);
  rackGroup.add(rackBoard);
  for (let i = -2; i <= 2; i++) {
    const wallCue = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.015, 1.4, 10),
      new THREE.MeshStandardMaterial({ color: 0xd9b88c, roughness: 0.4 }),
    );
    wallCue.position.set(i * 0.2, 0, 0.05);
    rackGroup.add(wallCue);
  }
  group.add(rackGroup);

  scene.add(group);

  const applyEnvironment = (envId: EnvironmentId) => {
    const cfg = ENVIRONMENTS[envId];
    scene.background = new THREE.Color(cfg.bgHex);
    scene.fog = new THREE.FogExp2(cfg.fogHex, cfg.fogDensity);
    keyLight.color.set(cfg.keyColor);
    keyLight.intensity = cfg.keyIntensity;
    hemiLight.color.set(cfg.hemiSky);
    hemiLight.groundColor.set(cfg.hemiGround);
    hemiLight.intensity = cfg.hemiIntensity;
    floorMat.color.set(cfg.floorColor);
    wallMat.color.set(cfg.wallColor);
    accentStripMat.color.set(cfg.accentHex);

    if (envId === 'neon_room') {
      tableGlow.color.set(0xd1fae5);
      tableGlow.intensity = 1.45;
      tableGlowLeft.color.set(0xd1fae5);
      tableGlowLeft.intensity = 0.65;
      tableGlowRight.color.set(0xd1fae5);
      tableGlowRight.intensity = 0.65;
    } else if (envId === 'championship_arena') {
      tableGlow.color.set(0xf0f9ff);
      tableGlow.intensity = 1.55;
      tableGlowLeft.color.set(0xf0f9ff);
      tableGlowLeft.intensity = 0.7;
      tableGlowRight.color.set(0xf0f9ff);
      tableGlowRight.intensity = 0.7;
    } else {
      tableGlow.color.set(0xfff1d6);
      tableGlow.intensity = 1.25;
      tableGlowLeft.color.set(0xfff1d6);
      tableGlowLeft.intensity = 0.58;
      tableGlowRight.color.set(0xfff1d6);
      tableGlowRight.intensity = 0.58;
    }
  };

  const setShadowQuality = (mapSize: number, enabled: boolean) => {
    keyLight.castShadow = enabled;
    if (enabled && keyLight.shadow.mapSize.width !== mapSize) {
      keyLight.shadow.mapSize.set(mapSize, mapSize);
      keyLight.shadow.map?.dispose();
      keyLight.shadow.map = null;
    }
  };

  const dispose = () => {
    scene.remove(group);
    scene.remove(keyLight);
    scene.remove(hemiLight);
    scene.remove(tableGlow);
    scene.remove(tableGlowLeft);
    scene.remove(tableGlowRight);
    for (const d of disposables) d.dispose();
  };

  return { group, applyEnvironment, setShadowQuality, dispose };
}
