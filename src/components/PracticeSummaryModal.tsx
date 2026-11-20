import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Flame, Home, Play, RotateCcw, Target, X } from 'lucide-react';
import {
  HALF_LENGTH,
  HALF_WIDTH,
  POCKETS,
  TABLE_CLOTHS,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from '../game/constants.ts';
import type { PracticePotRecord, TableClothId } from '../game/types.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

export interface PracticeSessionSummaryData {
  shotsTaken: number;
  ballsPocketed: number;
  scratches: number;
  bestStreak: number;
  pots: PracticePotRecord[];
}

interface PracticeSummaryModalProps {
  session: PracticeSessionSummaryData;
  careerPots: PracticePotRecord[];
  careerShots: number;
  careerPocketed: number;
  careerBestStreak: number;
  tableCloth: TableClothId;
  onContinuePractice: () => void;
  onRestartPractice: () => void;
  onExitToMenu: () => void;
}

const POCKET_SHORT = ['TL', 'TS', 'TR', 'BL', 'BS', 'BR'];

export interface AccuracyInsights {
  pocketCounts: number[];
  favoritePocketIndex: number | null;
  favoritePocketCount: number;
  avgDistanceM: number;
  strongestZone: string;
}

export function computePracticeAccuracyInsights(pots: PracticePotRecord[]): AccuracyInsights {
  const pocketCounts = [0, 0, 0, 0, 0, 0];
  let totalDist = 0;
  let headCount = 0;
  let midCount = 0;
  let footCount = 0;

  for (const pot of pots) {
    if (pot.pocketIndex >= 0 && pot.pocketIndex < 6) {
      pocketCounts[pot.pocketIndex] += 1;
    }
    totalDist += pot.distanceM;
    if (pot.originX < -0.42) headCount += 1;
    else if (pot.originX > 0.42) footCount += 1;
    else midCount += 1;
  }

  let favoritePocketIndex: number | null = null;
  let favoritePocketCount = 0;
  for (let i = 0; i < pocketCounts.length; i++) {
    if (pocketCounts[i] > favoritePocketCount) {
      favoritePocketCount = pocketCounts[i];
      favoritePocketIndex = i;
    }
  }

  let strongestZone = 'Balanced Table';
  if (pots.length > 0) {
    if (footCount >= headCount && footCount >= midCount) strongestZone = 'Foot End (Rack Zone)';
    else if (headCount >= footCount && headCount >= midCount) strongestZone = 'Head End (Break Zone)';
    else strongestZone = 'Center Felt';
  }

  return {
    pocketCounts,
    favoritePocketIndex,
    favoritePocketCount,
    avgDistanceM: pots.length > 0 ? totalDist / pots.length : 0,
    strongestZone,
  };
}

function sampleHeatColor(t: number): [number, number, number, number] {
  if (t <= 0.02) return [0, 0, 0, 0];
  const clamped = Math.min(1, Math.max(0, t));
  // 4-stop perceptual thermal ramp: Emerald -> Amber -> Orange-Red -> Bright Gold
  let r = 0;
  let g = 0;
  let b = 0;
  if (clamped < 0.35) {
    const u = clamped / 0.35;
    r = 16 + u * (245 - 16);
    g = 185 + u * (158 - 185);
    b = 129 + u * (11 - 129);
  } else if (clamped < 0.72) {
    const u = (clamped - 0.35) / 0.37;
    r = 245 + u * (239 - 245);
    g = 158 + u * (68 - 158);
    b = 11 + u * (68 - 11);
  } else {
    const u = (clamped - 0.72) / 0.28;
    r = 239 + u * (254 - 239);
    g = 68 + u * (240 - 68);
    b = 68 + u * (138 - 68);
  }
  const alpha = Math.round(Math.min(238, Math.pow(clamped, 0.72) * 238));
  return [Math.round(r), Math.round(g), Math.round(b), alpha];
}

type HeatmapLayer = 'combined' | 'origins' | 'pockets';
type HeatmapScope = 'session' | 'career';

export const PracticeSummaryModal: React.FC<PracticeSummaryModalProps> = ({
  session,
  careerPots,
  careerShots,
  careerPocketed,
  careerBestStreak,
  tableCloth,
  onContinuePractice,
  onRestartPractice,
  onExitToMenu,
}) => {
  const { t, formatMessage } = useI18n();
  const [scope, setScope] = useState<HeatmapScope>(() =>
    session.pots.length > 0 ? 'session' : careerPots.length > 0 ? 'career' : 'session',
  );
  const [layer, setLayer] = useState<HeatmapLayer>('combined');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const pocketLabels = useMemo(
    () => [
      t.pocketTopLeft,
      t.pocketTopSide,
      t.pocketTopRight,
      t.pocketBottomLeft,
      t.pocketBottomSide,
      t.pocketBottomRight,
    ],
    [t],
  );

  const zoneLabelMap: Record<string, string> = {
    'Balanced Table': t.zoneBalanced,
    'Foot End (Rack Zone)': t.zoneFootEnd,
    'Head End (Break Zone)': t.zoneHeadEnd,
    'Center Felt': t.zoneCenterFelt,
  };

  const activePots = scope === 'session' ? session.pots : careerPots;
  const activeShots = scope === 'session' ? session.shotsTaken : careerShots;
  const activePocketed = scope === 'session' ? session.ballsPocketed : careerPocketed;
  const activeBestStreak = scope === 'session' ? session.bestStreak : careerBestStreak;
  const accuracyPct =
    activeShots > 0 ? Math.min(100, Math.round((activePocketed / activeShots) * 100)) : 0;

  const insights = useMemo(() => computePracticeAccuracyInsights(activePots), [activePots]);
  const cloth = TABLE_CLOTHS[tableCloth];

  // Render thermal Gaussian density field on canvas whenever pots, scope, or layer changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 640;
    const H = 320;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    if (activePots.length === 0) return;

    // Accumulate smooth float density buffer at 1/2 resolution (320 x 160) for crispness & speed
    const gw = 320;
    const gh = 160;
    const grid = new Float32Array(gw * gh);

    const addKernel = (nx: number, nz: number, radiusPx: number, weight: number) => {
      const cx = ((nx + HALF_LENGTH) / TABLE_LENGTH) * gw;
      const cy = ((nz + HALF_WIDTH) / TABLE_WIDTH) * gh;
      const rSq = radiusPx * radiusPx;
      const x0 = Math.max(0, Math.floor(cx - radiusPx));
      const x1 = Math.min(gw - 1, Math.ceil(cx + radiusPx));
      const y0 = Math.max(0, Math.floor(cy - radiusPx));
      const y1 = Math.min(gh - 1, Math.ceil(cy + radiusPx));

      for (let py = y0; py <= y1; py++) {
        const dy = py - cy;
        for (let px = x0; px <= x1; px++) {
          const dx = px - cx;
          const dSq = dx * dx + dy * dy;
          if (dSq < rSq) {
            const falloff = Math.exp((-dSq / rSq) * 3.1);
            grid[py * gw + px] += falloff * weight;
          }
        }
      }
    };

    for (const pot of activePots) {
      if (layer === 'combined' || layer === 'origins') {
        addKernel(pot.originX, pot.originZ, 23, 1.0);
      }
      if (layer === 'combined' || layer === 'pockets') {
        // Clamp pocket center inside playable border so glow sits visibly on pocket jaw
        const px = Math.max(-HALF_LENGTH + 0.04, Math.min(HALF_LENGTH - 0.04, pot.pocketX));
        const pz = Math.max(-HALF_WIDTH + 0.04, Math.min(HALF_WIDTH - 0.04, pot.pocketZ));
        addKernel(px, pz, 26, layer === 'pockets' ? 1.15 : 0.72);
      }
    }

    let maxVal = 0;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] > maxVal) maxVal = grid[i];
    }
    if (maxVal <= 0) return;

    const off = document.createElement('canvas');
    off.width = gw;
    off.height = gh;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;

    const img = offCtx.createImageData(gw, gh);
    const data = img.data;
    const norm = Math.max(1.2, maxVal);
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i] / norm;
      const [r, g, b, a] = sampleHeatColor(t);
      const o = i * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    }
    offCtx.putImageData(img, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, W, H);
  }, [activePots, layer]);

  const toSvgX = (x: number) => ((x + HALF_LENGTH) / TABLE_LENGTH) * 640;
  const toSvgY = (z: number) => ((z + HALF_WIDTH) / TABLE_WIDTH) * 320;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-black/78">
      <div className="w-full max-w-3xl rounded-xl bg-[#0E1311] border border-white/15 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
              <Target className="w-3.5 h-3.5 shrink-0" />
              <span>{t.practice}</span>
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-white mt-0.5">
              {t.practiceSummaryTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onContinuePractice}
            aria-label={t.close}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto custom-scroll space-y-5 flex-1">
          {/* Scope & Metrics Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#141A17] border border-white/10">
              <button
                type="button"
                onClick={() => setScope('session')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  scope === 'session'
                    ? 'bg-emerald-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {formatMessage(t.thisSessionCount, { count: session.pots.length })}
              </button>
              <button
                type="button"
                onClick={() => setScope('career')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  scope === 'career'
                    ? 'bg-emerald-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {formatMessage(t.allPracticeCount, { count: careerPots.length })}
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#141A17] border border-white/10">
              {(
                [
                  ['combined', t.layerCombined],
                  ['origins', t.layerOrigins],
                  ['pockets', t.layerPockets],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLayer(id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    layer === id
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-400/50'
                      : 'text-zinc-400 hover:text-white border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 4 KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-lg bg-[#141A17] border border-white/10">
              <div className="text-xs text-zinc-400">{t.shotsTakenLabel}</div>
              <div className="font-mono-num text-xl font-bold text-white mt-1">{activeShots}</div>
            </div>
            <div className="p-3.5 rounded-lg bg-[#141A17] border border-white/10">
              <div className="text-xs text-zinc-400">{t.ballsPocketedLabel}</div>
              <div className="font-mono-num text-xl font-bold text-emerald-400 mt-1">
                {activePocketed}
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-[#141A17] border border-white/10">
              <div className="text-xs text-zinc-400">{t.potAccuracyLabel}</div>
              <div className="font-mono-num text-xl font-bold text-amber-300 mt-1">
                {accuracyPct}%
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-[#141A17] border border-white/10">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{t.bestStreakLabel}</span>
              </div>
              <div className="font-mono-num text-xl font-bold text-white mt-1">
                {activeBestStreak}
              </div>
            </div>
          </div>

          {/* Visual Table Heatmap */}
          <div className="p-4 rounded-xl bg-[#141A17] border border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-zinc-200">
                {t.heatmapTitle}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span>{t.heatLow}</span>
                <span
                  className="w-24 h-2 rounded-full"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(16,185,129,0.5) 0%, rgba(245,158,11,0.8) 45%, rgba(239,68,68,0.92) 78%, rgba(254,240,138,1) 100%)',
                  }}
                />
                <span>{t.heatHighCluster}</span>
              </div>
            </div>

            {/* 9-foot Pool Table Frame + Canvas Heatmap + SVG Vector/Pocket Overlay */}
            <div
              className="relative w-full aspect-[2/1] rounded-lg overflow-hidden border-8 shadow-inner"
              style={{
                backgroundColor: cloth.clothColor,
                borderColor: cloth.woodColor,
              }}
            >
              {/* Table markings (SVG) */}
              <svg
                viewBox="0 0 640 320"
                className="absolute inset-0 w-full h-full pointer-events-none"
                aria-label={t.heatmapTitle}
              >
                {/* Head string & Foot spot */}
                <line
                  x1={160}
                  y1={0}
                  x2={160}
                  y2={320}
                  stroke="rgba(255,255,255,0.14)"
                  strokeWidth={1.5}
                  strokeDasharray="6 6"
                />
                <circle cx={480} cy={160} r={3.5} fill="rgba(255,255,255,0.25)" />
                <circle cx={320} cy={160} r={3.5} fill="rgba(255,255,255,0.2)" />
                {/* 6 Pockets */}
                {POCKETS.map((p) => (
                  <circle
                    key={p.index}
                    cx={toSvgX(p.x)}
                    cy={toSvgY(p.z)}
                    r={16}
                    fill="#080B0A"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth={1.5}
                  />
                ))}
              </svg>

              {/* Gaussian Thermal Density Canvas */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />

              {/* Subtle Origin Markers & Pocket Count Readouts */}
              <svg
                viewBox="0 0 640 320"
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                {layer === 'combined' &&
                  activePots.slice(0, 60).map((pot, idx) => (
                    <line
                      key={`${pot.timestamp}-${pot.ballId}-${idx}`}
                      x1={toSvgX(pot.originX)}
                      y1={toSvgY(pot.originZ)}
                      x2={toSvgX(pot.pocketX)}
                      y2={toSvgY(pot.pocketZ)}
                      stroke="rgba(255,255,255,0.22)"
                      strokeWidth={1.1}
                      strokeDasharray="3 3"
                    />
                  ))}

                {(layer === 'combined' || layer === 'origins') &&
                  activePots.slice(0, 80).map((pot, idx) => (
                    <circle
                      key={`pt-${pot.timestamp}-${pot.ballId}-${idx}`}
                      cx={toSvgX(pot.originX)}
                      cy={toSvgY(pot.originZ)}
                      r={3.5}
                      fill="#FEF08A"
                      fillOpacity={0.82}
                      stroke="#080B0A"
                      strokeWidth={1}
                    />
                  ))}

                {POCKETS.map((p) => {
                  const cnt = insights.pocketCounts[p.index] ?? 0;
                  if (cnt === 0) return null;
                  const cx = Math.max(24, Math.min(616, toSvgX(p.x)));
                  const cy = Math.max(20, Math.min(300, toSvgY(p.z)));
                  return (
                    <g key={`cnt-${p.index}`}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={12}
                        fill="#0B0F0E"
                        fillOpacity={0.9}
                        stroke="#FBBF24"
                        strokeWidth={1.5}
                      />
                      <text
                        x={cx}
                        y={cy + 4}
                        textAnchor="middle"
                        fill="#FEF08A"
                        fontSize={11}
                        fontWeight="700"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {cnt}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {activePots.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/45 p-4 text-center">
                  <p className="text-xs sm:text-sm text-zinc-200 max-w-sm">
                    {t.heatmapEmptyHint}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Pocket Distribution & Pattern Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 6-Pocket Conversion Breakdown */}
            <div className="p-4 rounded-lg bg-[#141A17] border border-white/10 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <BarChart3 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{t.pocketDistribution}</span>
              </div>
              <div className="space-y-2">
                {pocketLabels.map((name, idx) => {
                  const count = insights.pocketCounts[idx] ?? 0;
                  const share = activePots.length > 0 ? Math.round((count / activePots.length) * 100) : 0;
                  return (
                    <div key={POCKET_SHORT[idx]} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300">
                          <span className="font-mono-num text-zinc-500 mr-1.5">
                            {POCKET_SHORT[idx]}
                          </span>
                          {name}
                        </span>
                        <span className="font-mono-num text-zinc-300">
                          {count} ({share}%)
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/50 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${share}%`,
                            backgroundColor:
                              count > 0 && idx === insights.favoritePocketIndex
                                ? '#F59E0B'
                                : '#10B981',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Accuracy Pattern Readout */}
            <div className="p-4 rounded-lg bg-[#141A17] border border-white/10 flex flex-col justify-between space-y-3">
              <div className="text-xs font-semibold text-zinc-300">
                {t.shootingAccuracyPatterns}
              </div>
              <div className="space-y-2.5 text-xs flex-1">
                <div className="flex items-center justify-between py-1.5 border-b border-white/10">
                  <span className="text-zinc-400">{t.favoriteTargetPocket}</span>
                  <span className="font-semibold text-amber-300">
                    {insights.favoritePocketIndex !== null
                      ? `${pocketLabels[insights.favoritePocketIndex]} (${insights.favoritePocketCount})`
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-white/10">
                  <span className="text-zinc-400">{t.primaryPotZone}</span>
                  <span className="font-semibold text-white">
                    {zoneLabelMap[insights.strongestZone] ?? insights.strongestZone}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-white/10">
                  <span className="text-zinc-400">{t.avgObjectToPocketDist}</span>
                  <span className="font-mono-num font-semibold text-emerald-400">
                    {activePots.length > 0 ? `${insights.avgDistanceM.toFixed(2)} m` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-zinc-400">{t.sessionScratches}</span>
                  <span className="font-mono-num font-semibold text-zinc-200">
                    {session.scratches}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {t.heatmapLegendNote}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3.5 sm:py-4 border-t border-white/10 bg-[#0B0F0E]">
          <button
            type="button"
            onClick={onExitToMenu}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#141A17] hover:bg-white/10 border border-white/10 text-sm font-medium text-zinc-300 min-h-[44px]"
          >
            <Home className="w-4 h-4" />
            <span>{t.mainMenu}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRestartPractice}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#141A17] hover:bg-white/10 border border-white/15 text-sm font-semibold text-white min-h-[44px]"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t.newRack}</span>
            </button>
            <button
              type="button"
              onClick={onContinuePractice}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white min-h-[44px]"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{t.continuePractice}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
