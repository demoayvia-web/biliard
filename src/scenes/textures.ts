import * as THREE from 'three';
import { BALL_COLORS } from '../game/constants.ts';
import type { TableClothId } from '../game/types.ts';

export interface ClothFabricProfile {
  weaveType: 'worsted_twill' | 'pro_twill' | 'velour_nap' | 'carbon_herringbone';
  warpFreq: number;
  weftFreq: number;
  baseRoughness: number;
  roughnessContrast: number;
  normalScale: number;
  sheen: number;
  sheenRoughness: number;
  sheenColor: string;
  envMapIntensity: number;
}

export const CLOTH_FABRIC_PROFILES: Record<TableClothId, ClothFabricProfile> = {
  emerald: {
    weaveType: 'worsted_twill',
    warpFreq: 128,
    weftFreq: 128,
    baseRoughness: 0.84,
    roughnessContrast: 0.14,
    normalScale: 0.58,
    sheen: 0.36,
    sheenRoughness: 0.68,
    sheenColor: '#34d399',
    envMapIntensity: 0.55,
  },
  tournament_blue: {
    weaveType: 'pro_twill',
    warpFreq: 144,
    weftFreq: 144,
    baseRoughness: 0.79,
    roughnessContrast: 0.15,
    normalScale: 0.52,
    sheen: 0.42,
    sheenRoughness: 0.62,
    sheenColor: '#60a5fa',
    envMapIntensity: 0.58,
  },
  burgundy: {
    weaveType: 'velour_nap',
    warpFreq: 96,
    weftFreq: 96,
    baseRoughness: 0.88,
    roughnessContrast: 0.16,
    normalScale: 0.68,
    sheen: 0.48,
    sheenRoughness: 0.74,
    sheenColor: '#f87171',
    envMapIntensity: 0.5,
  },
  obsidian: {
    weaveType: 'carbon_herringbone',
    warpFreq: 136,
    weftFreq: 136,
    baseRoughness: 0.76,
    roughnessContrast: 0.17,
    normalScale: 0.56,
    sheen: 0.34,
    sheenRoughness: 0.58,
    sheenColor: '#6ee7b7',
    envMapIntensity: 0.62,
  },
};

export interface FeltTextureSet {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  bumpMap: THREE.DataTexture;
  profile: ClothFabricProfile;
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function tileHash(ix: number, iy: number, period: number, seed: number): number {
  const wx = ((ix % period) + period) % period;
  const wy = ((iy % period) + period) % period;
  let n = (wx * 374761393 + wy * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothTileNoise(u: number, v: number, freq: number, seed: number): number {
  const fx = u * freq;
  const fy = v * freq;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const n00 = tileHash(x0, y0, freq, seed);
  const n10 = tileHash(x0 + 1, y0, freq, seed);
  const n01 = tileHash(x0, y0 + 1, freq, seed);
  const n11 = tileHash(x0 + 1, y0 + 1, freq, seed);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

export function createBallTexture(ballId: number, maxAnisotropy = 4): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const info = BALL_COLORS[ballId] ?? BALL_COLORS[0];
  const ivory = '#F7F3E6';

  if (ballId === 0) {
    // Pro cue ball with 6 subtle red training dots so players can visually read spin!
    ctx.fillStyle = ivory;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#C81E1E';
    const dotPositions: Array<[number, number]> = [
      [w * 0.25, h * 0.5],
      [w * 0.5, h * 0.5],
      [w * 0.75, h * 0.5],
      [w * 0.0, h * 0.5],
      [w * 0.5, h * 0.16],
      [w * 0.5, h * 0.84],
    ];
    for (const [dx, dy] of dotPositions) {
      ctx.beginPath();
      ctx.arc(dx, dy, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (!info.isStripe) {
    // Solid ball (1-8)
    ctx.fillStyle = info.hex;
    ctx.fillRect(0, 0, w, h);

    // Dual opposite number medallions around equator
    for (const cx of [w * 0.25, w * 0.75]) {
      const cy = h * 0.5;
      ctx.fillStyle = ivory;
      ctx.beginPath();
      ctx.arc(cx, cy, 42, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#111111';
      ctx.font = 'bold 44px "Outfit", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ballId), cx, cy + 2);
    }
  } else {
    // Striped ball (9-15)
    ctx.fillStyle = ivory;
    ctx.fillRect(0, 0, w, h);

    // Center colored band
    const bandTop = h * 0.23;
    const bandHeight = h * 0.54;
    ctx.fillStyle = info.hex;
    ctx.fillRect(0, bandTop, w, bandHeight);

    // Crisp dark edge hairline on stripe
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, bandTop, w, 2);
    ctx.fillRect(0, bandTop + bandHeight - 2, w, 2);

    for (const cx of [w * 0.25, w * 0.75]) {
      const cy = h * 0.5;
      ctx.fillStyle = ivory;
      ctx.beginPath();
      ctx.arc(cx, cy, 42, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#111111';
      ctx.font = 'bold 42px "Outfit", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ballId), cx, cy + 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates seamless 1024x1024 PBR fabric maps (albedo, tangent-space normal map,
 * roughness map, and bump map) calibrated to the selected TableClothId.
 */
export function createFeltTextures(
  baseHex: string,
  maxAnisotropy = 8,
  clothId: TableClothId = 'emerald',
  repeatX = 10,
  repeatY = 5,
): FeltTextureSet {
  const size = 1024;
  const pixelCount = size * size;
  const profile = CLOTH_FABRIC_PROFILES[clothId] ?? CLOTH_FABRIC_PROFILES.emerald;
  const [baseR, baseG, baseB] = parseHexRgb(baseHex);

  const heightField = new Float32Array(pixelCount);
  const colorData = new Uint8Array(pixelCount * 4);
  const normalData = new Uint8Array(pixelCount * 4);
  const roughData = new Uint8Array(pixelCount * 4);
  const bumpData = new Uint8Array(pixelCount * 4);

  const twoPi = Math.PI * 2;
  const fw = profile.warpFreq;
  const ft = profile.weftFreq;

  // Pass 1: Build seamless multi-scale fabric weave + wool nap height field
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const sinWeft = Math.sin(twoPi * v * ft);

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;
      const sinWarp = Math.sin(twoPi * u * fw);

      let weaveHeight = 0;
      if (profile.weaveType === 'worsted_twill') {
        const twill = Math.sin(twoPi * (u * fw + v * (ft * 0.5)));
        weaveHeight = sinWarp * 0.28 + sinWeft * 0.28 + twill * 0.44;
      } else if (profile.weaveType === 'pro_twill') {
        const twill = Math.sin(twoPi * (u * fw + v * ft));
        const cross = sinWarp * sinWeft;
        weaveHeight = cross * 0.52 + twill * 0.48;
      } else if (profile.weaveType === 'velour_nap') {
        const napDrift = smoothTileNoise(u, v, 32, 17) - 0.5;
        const plush = Math.sin(twoPi * (u * fw * 0.75 + napDrift * 1.4)) * sinWeft;
        weaveHeight = plush * 0.55 + napDrift * 0.65;
      } else {
        // carbon_herringbone
        const chevronDir = Math.sin(twoPi * u * 16) >= 0 ? 1 : -1;
        const herr = Math.sin(twoPi * (u * fw + chevronDir * v * ft));
        weaveHeight = herr * 0.64 + sinWarp * sinWeft * 0.36;
      }

      // Micro-fiber wool grain + subtle brushed cloth variation (all seamless periodic)
      const fineFiber = tileHash(x, y, size, 101) - 0.5;
      const brushedNap = smoothTileNoise(u, v, 64, 43) - 0.5;
      const macroMottle = smoothTileNoise(u, v, 12, 71) - 0.5;

      const hVal =
        weaveHeight * 0.54 +
        brushedNap * 0.28 +
        fineFiber * 0.22 +
        macroMottle * 0.14;

      heightField[idx] = hVal;

      // Albedo: subtle weave shadowing + directional nap tint without darkening overall table
      const shadeDelta = weaveHeight * 5.5 + macroMottle * 7.0 + fineFiber * 4.5;
      const cOff = idx * 4;
      colorData[cOff] = clampByte(baseR + shadeDelta);
      colorData[cOff + 1] = clampByte(baseG + shadeDelta * 1.05);
      colorData[cOff + 2] = clampByte(baseB + shadeDelta);
      colorData[cOff + 3] = 255;

      // Roughness: crests slightly smoother (catching wool sheen), valleys rougher
      const roughVal =
        profile.baseRoughness -
        weaveHeight * profile.roughnessContrast * 0.65 -
        brushedNap * profile.roughnessContrast * 0.55 +
        fineFiber * 0.05;
      const rByte = clampByte(roughVal * 255);
      roughData[cOff] = rByte;
      roughData[cOff + 1] = rByte;
      roughData[cOff + 2] = rByte;
      roughData[cOff + 3] = 255;

      const bByte = clampByte(128 + hVal * 92);
      bumpData[cOff] = bByte;
      bumpData[cOff + 1] = bByte;
      bumpData[cOff + 2] = bByte;
      bumpData[cOff + 3] = 255;
    }
  }

  // Pass 2: Central-difference tangent-space normal map from seamless heightField
  const mask = size - 1;
  const slopeStrength = 2.35;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1) & mask;
    const yp = (y + 1) & mask;
    const row = y * size;
    const rowM = ym * size;
    const rowP = yp * size;

    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & mask;
      const xp = (x + 1) & mask;

      const dhdx = (heightField[row + xp] - heightField[row + xm]) * 0.5 * slopeStrength;
      const dhdy = (heightField[rowP + x] - heightField[rowM + x]) * 0.5 * slopeStrength;

      const nx = -dhdx;
      const ny = -dhdy;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);

      const nOff = (row + x) * 4;
      normalData[nOff] = clampByte((nx * invLen * 0.5 + 0.5) * 255);
      normalData[nOff + 1] = clampByte((ny * invLen * 0.5 + 0.5) * 255);
      normalData[nOff + 2] = clampByte((nz * invLen * 0.5 + 0.5) * 255);
      normalData[nOff + 3] = 255;
    }
  }

  const configureDataTex = (
    data: Uint8Array,
    colorSpace: THREE.ColorSpace,
    rx: number,
    ry: number,
  ): THREE.DataTexture => {
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.colorSpace = colorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = maxAnisotropy;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    map: configureDataTex(colorData, THREE.SRGBColorSpace, repeatX, repeatY),
    normalMap: configureDataTex(normalData, THREE.NoColorSpace, repeatX, repeatY),
    roughnessMap: configureDataTex(roughData, THREE.NoColorSpace, repeatX, repeatY),
    bumpMap: configureDataTex(bumpData, THREE.NoColorSpace, repeatX, repeatY),
    profile,
  };
}

export function createWoodTextures(
  baseHex: string,
  maxAnisotropy = 4,
): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const w = 512;
  const h = 256;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = w;
  cCanvas.height = h;
  const cCtx = cCanvas.getContext('2d')!;

  const rCanvas = document.createElement('canvas');
  rCanvas.width = w;
  rCanvas.height = h;
  const rCtx = rCanvas.getContext('2d')!;

  cCtx.fillStyle = baseHex;
  cCtx.fillRect(0, 0, w, h);

  rCtx.fillStyle = '#484848';
  rCtx.fillRect(0, 0, w, h);

  // Natural hardwood grain streaks
  for (let i = 0; i < 180; i++) {
    const y = Math.random() * h;
    const thickness = 1 + Math.random() * 3;
    const alpha = 0.04 + Math.random() * 0.1;
    cCtx.strokeStyle = i % 2 === 0 ? `rgba(0,0,0,${alpha})` : `rgba(255,220,180,${alpha * 0.45})`;
    cCtx.lineWidth = thickness;
    cCtx.beginPath();
    cCtx.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) {
      cCtx.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
    }
    cCtx.stroke();

    rCtx.strokeStyle = `rgba(110,110,110,${alpha})`;
    rCtx.lineWidth = thickness;
    rCtx.beginPath();
    rCtx.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) {
      rCtx.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
    }
    rCtx.stroke();
  }

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  return { map, roughnessMap };
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, 'rgba(0,0,0,0.65)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
