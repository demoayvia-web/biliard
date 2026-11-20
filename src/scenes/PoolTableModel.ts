import * as THREE from 'three';
import {
  CUSHION_HEIGHT,
  FOOT_SPOT_X,
  FRAME_HEIGHT,
  HALF_LENGTH,
  HALF_WIDTH,
  HEAD_STRING_X,
  POCKETS,
  RAIL_WIDTH,
  SLATE_Y,
  TABLE_CLOTHS,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from '../game/constants.ts';
import type { TableClothId } from '../game/types.ts';
import {
  createContactShadowTexture,
  createFeltTextures,
  createWoodTextures,
  type FeltTextureSet,
} from './textures.ts';

export interface PoolTableInstance {
  group: THREE.Group;
  applyClothStyle: (styleId: TableClothId) => void;
  dispose: () => void;
}

function cloneCushionClothMaps(felt: FeltTextureSet) {
  const normalMap = felt.normalMap.clone();
  normalMap.repeat.set(3.8, 3.8);
  normalMap.needsUpdate = true;

  const roughnessMap = felt.roughnessMap.clone();
  roughnessMap.repeat.set(3.8, 3.8);
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap };
}

/**
 * Builds a composite 12-part tournament billiard table grounded at y = 0.
 */
export function buildPoolTable(
  initialStyle: TableClothId,
  maxAnisotropy: number,
): PoolTableInstance {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const style = TABLE_CLOTHS[initialStyle];
  let feltTextures = createFeltTextures(style.clothColor, maxAnisotropy, initialStyle, 10, 5);
  let cushionMaps = cloneCushionClothMaps(feltTextures);
  let woodTextures = createWoodTextures(style.woodColor, maxAnisotropy);

  const slateMat = new THREE.MeshPhysicalMaterial({
    map: feltTextures.map,
    normalMap: feltTextures.normalMap,
    normalScale: new THREE.Vector2(
      feltTextures.profile.normalScale,
      feltTextures.profile.normalScale,
    ),
    roughnessMap: feltTextures.roughnessMap,
    roughness: 1.0,
    metalness: 0.0,
    sheen: feltTextures.profile.sheen,
    sheenRoughness: feltTextures.profile.sheenRoughness,
    sheenColor: new THREE.Color(feltTextures.profile.sheenColor),
    envMapIntensity: feltTextures.profile.envMapIntensity,
  });

  const cushionMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(style.cushionColor),
    normalMap: cushionMaps.normalMap,
    normalScale: new THREE.Vector2(
      feltTextures.profile.normalScale * 0.9,
      feltTextures.profile.normalScale * 0.9,
    ),
    roughnessMap: cushionMaps.roughnessMap,
    roughness: 1.0,
    metalness: 0.0,
    sheen: feltTextures.profile.sheen * 0.9,
    sheenRoughness: feltTextures.profile.sheenRoughness,
    sheenColor: new THREE.Color(feltTextures.profile.sheenColor),
    envMapIntensity: feltTextures.profile.envMapIntensity,
  });

  const woodMat = new THREE.MeshPhysicalMaterial({
    map: woodTextures.map,
    roughnessMap: woodTextures.roughnessMap,
    roughness: 0.28,
    metalness: 0.04,
    clearcoat: 0.65,
    clearcoatRoughness: 0.14,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(style.accentColor),
    metalness: 0.92,
    roughness: 0.22,
  });

  const pocketInteriorMat = new THREE.MeshStandardMaterial({
    color: 0x070708,
    roughness: 0.95,
    metalness: 0.05,
  });

  const leatherPocketMat = new THREE.MeshStandardMaterial({
    color: 0x1a120d,
    roughness: 0.72,
    metalness: 0.08,
  });

  disposables.push(slateMat, cushionMat, woodMat, brassMat, pocketInteriorMat, leatherPocketMat);

  // 1. Slate playing surface
  const slateGeo = new THREE.BoxGeometry(TABLE_LENGTH + 0.14, 0.04, TABLE_WIDTH + 0.14);
  const slateMesh = new THREE.Mesh(slateGeo, slateMat);
  slateMesh.name = 'billiard-table-slate';
  slateMesh.position.set(0, SLATE_Y - 0.02, 0);
  slateMesh.receiveShadow = true;
  group.add(slateMesh);
  disposables.push(slateGeo);

  // 2. Head string line & Foot spot / Head spot markers (with polygonOffset to prevent z-fighting)
  const markingMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.22,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const headLineGeo = new THREE.PlaneGeometry(0.004, TABLE_WIDTH);
  headLineGeo.rotateX(-Math.PI / 2);
  const headLine = new THREE.Mesh(headLineGeo, markingMat);
  headLine.position.set(HEAD_STRING_X, SLATE_Y + 0.0004, 0);
  group.add(headLine);

  const spotGeo = new THREE.CircleGeometry(0.009, 20);
  spotGeo.rotateX(-Math.PI / 2);
  const footSpot = new THREE.Mesh(spotGeo, markingMat);
  footSpot.position.set(FOOT_SPOT_X, SLATE_Y + 0.0004, 0);
  group.add(footSpot);

  const headSpot = new THREE.Mesh(spotGeo, markingMat);
  headSpot.position.set(HEAD_STRING_X, SLATE_Y + 0.0004, 0);
  group.add(headSpot);
  disposables.push(markingMat, headLineGeo, spotGeo);

  // 3. Beveled cushion rails around pocket gaps (ExtrudeGeometry)
  const cushionProfile = new THREE.Shape();
  cushionProfile.moveTo(0, 0);
  cushionProfile.lineTo(0.055, 0);
  cushionProfile.lineTo(0.055, CUSHION_HEIGHT);
  cushionProfile.lineTo(0.014, CUSHION_HEIGHT);
  cushionProfile.lineTo(0, CUSHION_HEIGHT * 0.64); // Cushion nose bevel
  cushionProfile.lineTo(0.012, 0.006);
  cushionProfile.closePath();

  const cornerGap = 0.098;
  const sideGap = 0.068;
  const longSegLen = HALF_LENGTH - cornerGap - sideGap;
  const longCenterOffset = sideGap + longSegLen / 2;

  const makeCushionMesh = (len: number) => {
    const geo = new THREE.ExtrudeGeometry(cushionProfile, {
      depth: len,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.002,
      bevelSegments: 2,
    });
    geo.translate(0, 0, -len / 2);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, cushionMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // Top (-Z) & Bottom (+Z) cushions (bevelSize 0.002 compensated so nose rests at ±HALF_WIDTH)
  for (const signZ of [-1, 1]) {
    for (const signX of [-1, 1]) {
      const m = makeCushionMesh(longSegLen);
      m.position.set(signX * longCenterOffset, SLATE_Y, signZ * (HALF_WIDTH + 0.002));
      // Profile nose faces -X in local space; rotate so nose faces inward (toward z = 0)
      m.rotation.y = signZ > 0 ? -Math.PI / 2 : Math.PI / 2;
      group.add(m);
    }
  }

  // Left (-X) & Right (+X) end cushions
  const shortSegLen = (HALF_WIDTH - cornerGap) * 2;
  for (const signX of [-1, 1]) {
    const m = makeCushionMesh(shortSegLen);
    m.position.set(signX * (HALF_LENGTH + 0.002), SLATE_Y, 0);
    m.rotation.y = signX > 0 ? 0 : Math.PI;
    group.add(m);
  }

  // 4. Hardwood outer rails (4 perimeter beams with beveled edges)
  const railHeight = 0.056;
  const railTopY = SLATE_Y + railHeight / 2 + 0.002;
  const outerOffsetX = HALF_LENGTH + 0.055 + RAIL_WIDTH / 2 - 0.012;
  const outerOffsetZ = HALF_WIDTH + 0.055 + RAIL_WIDTH / 2 - 0.012;

  const longWoodGeo = new THREE.BoxGeometry(TABLE_LENGTH + RAIL_WIDTH * 2 + 0.08, railHeight, RAIL_WIDTH);
  const shortWoodGeo = new THREE.BoxGeometry(RAIL_WIDTH, railHeight, TABLE_WIDTH + 0.09);
  disposables.push(longWoodGeo, shortWoodGeo);

  for (const signZ of [-1, 1]) {
    const rail = new THREE.Mesh(longWoodGeo, woodMat);
    rail.position.set(0, railTopY, signZ * outerOffsetZ);
    rail.castShadow = true;
    rail.receiveShadow = true;
    group.add(rail);
  }
  for (const signX of [-1, 1]) {
    const rail = new THREE.Mesh(shortWoodGeo, woodMat);
    rail.position.set(signX * outerOffsetX, railTopY, 0);
    rail.castShadow = true;
    rail.receiveShadow = true;
    group.add(rail);
  }

  // 5. 18 Inlaid Pearl/Brass Diamond Rail Sights (InstancedMesh)
  const diamondGeo = new THREE.OctahedronGeometry(0.007, 0);
  diamondGeo.scale(1.4, 0.3, 0.85);
  const diamondMat = new THREE.MeshStandardMaterial({
    color: 0xf4efe4,
    roughness: 0.25,
    metalness: 0.35,
  });
  const diamondInst = new THREE.InstancedMesh(diamondGeo, diamondMat, 18);
  const dummy = new THREE.Object3D();
  let dIdx = 0;

  // 6 sights along each long rail (3 per half)
  for (const signZ of [-1, 1]) {
    const zPos = signZ * (outerOffsetZ + 0.005);
    for (let i = 1; i <= 3; i++) {
      dummy.position.set(-HALF_LENGTH + (HALF_LENGTH / 4) * i, SLATE_Y + railHeight + 0.002, zPos);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      diamondInst.setMatrixAt(dIdx++, dummy.matrix);

      dummy.position.set((HALF_LENGTH / 4) * i, SLATE_Y + railHeight + 0.002, zPos);
      dummy.updateMatrix();
      diamondInst.setMatrixAt(dIdx++, dummy.matrix);
    }
  }
  // 3 sights along each short rail
  for (const signX of [-1, 1]) {
    const xPos = signX * (outerOffsetX + 0.005);
    for (let i = 1; i <= 3; i++) {
      dummy.position.set(xPos, SLATE_Y + railHeight + 0.002, -HALF_WIDTH + (TABLE_WIDTH / 4) * i);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.updateMatrix();
      diamondInst.setMatrixAt(dIdx++, dummy.matrix);
    }
  }
  diamondInst.instanceMatrix.needsUpdate = true;
  diamondInst.computeBoundingSphere();
  group.add(diamondInst);
  disposables.push(diamondGeo, diamondMat);

  // 6. Six Pockets: Brass collars + dark pocket wells + leather drop cups
  const pocketWellGeo = new THREE.CylinderGeometry(0.062, 0.055, 0.045, 24);
  const cornerCollarGeo = new THREE.TorusGeometry(0.068, 0.012, 12, 24, Math.PI * 1.45);
  const sideCollarGeo = new THREE.TorusGeometry(0.068, 0.012, 12, 24, Math.PI * 1.15);
  const dropCupGeo = new THREE.CylinderGeometry(0.056, 0.042, 0.14, 18);
  disposables.push(pocketWellGeo, cornerCollarGeo, sideCollarGeo, dropCupGeo);

  for (const p of POCKETS) {
    // Dark circular hole flush in slate
    const well = new THREE.Mesh(pocketWellGeo, pocketInteriorMat);
    well.position.set(p.x, SLATE_Y - 0.0221, p.z);
    group.add(well);

    // Leather cup underneath
    const cup = new THREE.Mesh(dropCupGeo, leatherPocketMat);
    cup.position.set(p.x, SLATE_Y - 0.09, p.z);
    cup.castShadow = true;
    group.add(cup);

    // Brass / Chrome casting collar framing the pocket rim
    const collar = new THREE.Mesh(p.isCorner ? cornerCollarGeo : sideCollarGeo, brassMat);
    collar.rotation.x = Math.PI / 2;
    if (p.isCorner) {
      const ang = Math.atan2(-p.z, -p.x);
      collar.rotation.z = ang + Math.PI * 0.72;
    } else {
      collar.rotation.z = p.z < 0 ? Math.PI * 0.92 : -Math.PI * 0.08;
    }
    collar.position.set(p.x, SLATE_Y + 0.045, p.z);
    collar.castShadow = true;
    group.add(collar);
  }

  // 7. Structural Apron Skirts & Brass Trim Molding
  const apronLongGeo = new THREE.BoxGeometry(TABLE_LENGTH + RAIL_WIDTH * 1.6, FRAME_HEIGHT, 0.05);
  const apronShortGeo = new THREE.BoxGeometry(0.05, FRAME_HEIGHT, TABLE_WIDTH + RAIL_WIDTH * 1.6);
  const apronY = SLATE_Y - 0.04 - FRAME_HEIGHT / 2;
  disposables.push(apronLongGeo, apronShortGeo);

  for (const signZ of [-1, 1]) {
    const skirt = new THREE.Mesh(apronLongGeo, woodMat);
    skirt.position.set(0, apronY, signZ * (HALF_WIDTH + 0.11));
    skirt.castShadow = true;
    skirt.receiveShadow = true;
    group.add(skirt);
  }
  for (const signX of [-1, 1]) {
    const skirt = new THREE.Mesh(apronShortGeo, woodMat);
    skirt.position.set(signX * (HALF_LENGTH + 0.11), apronY, 0);
    skirt.castShadow = true;
    skirt.receiveShadow = true;
    group.add(skirt);
  }

  // 8. Four Turned Hardwood Legs + Brass Ferrules (LatheGeometry, bottom flush at y = 0)
  const legTopY = SLATE_Y - 0.04;
  const legPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.048, 0.0),
    new THREE.Vector2(0.055, 0.08),
    new THREE.Vector2(0.042, 0.18),
    new THREE.Vector2(0.072, 0.34),
    new THREE.Vector2(0.086, 0.52),
    new THREE.Vector2(0.074, 0.64),
    new THREE.Vector2(0.095, legTopY),
  ];
  const legGeo = new THREE.LatheGeometry(legPoints, 24);
  const ferruleGeo = new THREE.CylinderGeometry(0.056, 0.05, 0.075, 24);
  disposables.push(legGeo, ferruleGeo);

  const legPositions: Array<[number, number]> = [
    [-HALF_LENGTH - 0.05, -HALF_WIDTH - 0.05],
    [HALF_LENGTH + 0.05, -HALF_WIDTH - 0.05],
    [-HALF_LENGTH - 0.05, HALF_WIDTH + 0.05],
    [HALF_LENGTH + 0.05, HALF_WIDTH + 0.05],
  ];

  for (const [lx, lz] of legPositions) {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(lx, 0, lz);
    leg.castShadow = true;
    leg.receiveShadow = true;
    group.add(leg);

    const ferrule = new THREE.Mesh(ferruleGeo, brassMat);
    ferrule.position.set(lx, 0.0375, lz);
    group.add(ferrule);
  }

  // 9. Soft radial contact shadow beneath the table on y = 0.004
  const shadowTex = createContactShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  const shadowGeo = new THREE.PlaneGeometry(TABLE_LENGTH + 1.2, TABLE_WIDTH + 1.0);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.position.set(0, 0.004, 0);
  group.add(shadowPlane);
  disposables.push(shadowTex, shadowMat, shadowGeo);

  // 10. Overhead 3-Shade Tournament Pendant Lamp Fixture
  const lampGroup = new THREE.Group();
  lampGroup.position.set(0, 2.28, 0);

  const barGeo = new THREE.CylinderGeometry(0.016, 0.016, 1.85, 16);
  barGeo.rotateZ(Math.PI / 2);
  const lampBar = new THREE.Mesh(barGeo, brassMat);
  lampGroup.add(lampBar);

  const rodGeo = new THREE.CylinderGeometry(0.01, 0.01, 1.2, 12);
  for (const rx of [-0.55, 0.55]) {
    const rod = new THREE.Mesh(rodGeo, brassMat);
    rod.position.set(rx, 0.6, 0);
    lampGroup.add(rod);
  }

  const shadeGeo = new THREE.ConeGeometry(0.24, 0.16, 28, 1, true);
  const shadeOuterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a482d,
    roughness: 0.25,
    metalness: 0.1,
    clearcoat: 0.8,
    side: THREE.DoubleSide,
  });
  const bulbGeo = new THREE.SphereGeometry(0.045, 16, 12);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff3d6 });

  for (const sx of [-0.72, 0, 0.72]) {
    const shade = new THREE.Mesh(shadeGeo, shadeOuterMat);
    shade.position.set(sx, -0.06, 0);
    lampGroup.add(shade);

    const trimRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.008, 8, 28), brassMat);
    trimRing.rotation.x = Math.PI / 2;
    trimRing.position.set(sx, -0.14, 0);
    lampGroup.add(trimRing);

    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(sx, -0.08, 0);
    lampGroup.add(bulb);
  }
  group.add(lampGroup);
  disposables.push(barGeo, rodGeo, shadeGeo, shadeOuterMat, bulbGeo, bulbMat);

  const applyClothStyle = (styleId: TableClothId) => {
    const nextStyle = TABLE_CLOTHS[styleId];
    const prevFelt = feltTextures;
    const prevCushion = cushionMaps;
    const prevWood = woodTextures;

    feltTextures = createFeltTextures(nextStyle.clothColor, maxAnisotropy, styleId, 10, 5);
    cushionMaps = cloneCushionClothMaps(feltTextures);
    woodTextures = createWoodTextures(nextStyle.woodColor, maxAnisotropy);

    slateMat.map = feltTextures.map;
    slateMat.normalMap = feltTextures.normalMap;
    slateMat.normalScale.set(
      feltTextures.profile.normalScale,
      feltTextures.profile.normalScale,
    );
    slateMat.roughnessMap = feltTextures.roughnessMap;
    slateMat.sheen = feltTextures.profile.sheen;
    slateMat.sheenRoughness = feltTextures.profile.sheenRoughness;
    slateMat.sheenColor.set(feltTextures.profile.sheenColor);
    slateMat.envMapIntensity = feltTextures.profile.envMapIntensity;
    slateMat.needsUpdate = true;

    cushionMat.color.set(nextStyle.cushionColor);
    cushionMat.normalMap = cushionMaps.normalMap;
    cushionMat.normalScale.set(
      feltTextures.profile.normalScale * 0.9,
      feltTextures.profile.normalScale * 0.9,
    );
    cushionMat.roughnessMap = cushionMaps.roughnessMap;
    cushionMat.sheen = feltTextures.profile.sheen * 0.9;
    cushionMat.sheenRoughness = feltTextures.profile.sheenRoughness;
    cushionMat.sheenColor.set(feltTextures.profile.sheenColor);
    cushionMat.envMapIntensity = feltTextures.profile.envMapIntensity;
    cushionMat.needsUpdate = true;

    woodMat.map = woodTextures.map;
    woodMat.roughnessMap = woodTextures.roughnessMap;
    woodMat.needsUpdate = true;

    brassMat.color.set(nextStyle.accentColor);

    prevFelt.map.dispose();
    prevFelt.normalMap.dispose();
    prevFelt.roughnessMap.dispose();
    prevFelt.bumpMap.dispose();
    prevCushion.normalMap.dispose();
    prevCushion.roughnessMap.dispose();
    prevWood.map.dispose();
    prevWood.roughnessMap.dispose();
  };

  const dispose = () => {
    feltTextures.map.dispose();
    feltTextures.normalMap.dispose();
    feltTextures.roughnessMap.dispose();
    feltTextures.bumpMap.dispose();
    cushionMaps.normalMap.dispose();
    cushionMaps.roughnessMap.dispose();
    woodTextures.map.dispose();
    woodTextures.roughnessMap.dispose();
    for (const d of disposables) d.dispose();
  };

  return { group, applyClothStyle, dispose };
}
