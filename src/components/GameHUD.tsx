import React, { useRef, useState } from 'react';
import {
  BarChart3,
  Bookmark,
  Camera,
  ChevronDown,
  ChevronUp,
  Compass,
  Crosshair,
  Film,
  Gauge,
  Lightbulb,
  Move,
  Pause,
  Play,
  RotateCcw,
  Route,
  Target,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  BALL_COLORS,
  CUE_STYLES,
  ENVIRONMENTS,
  TABLE_CLOTHS,
  TABLE_SURFACE_STYLES,
} from '../game/constants.ts';
import type { PracticeDrillId, PracticeIdealShot } from '../game/rules.ts';
import type {
  CameraPreset,
  CueStyleId,
  EnvironmentId,
  MatchState,
  ShotReplayData,
  TableClothId,
  TableSurfaceStyleId,
} from '../game/types.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

interface GameHUDProps {
  matchState: MatchState;
  shotPower: number;
  spin: { x: number; y: number };
  canShoot: boolean;
  cameraPreset: CameraPreset;
  cueStyle: CueStyleId;
  tableCloth: TableClothId;
  environmentId: EnvironmentId;
  surfaceStyle: TableSurfaceStyleId;
  muted: boolean;
  localSeatIndex?: 0 | 1;
  hasReplay: boolean;
  isReplaying: boolean;
  replayData: ShotReplayData | null;
  replayTime: number;
  replayPaused: boolean;
  replaySpeed: number;
  showReplayTrails: boolean;
  showCuePathTracer: boolean;
  onStartReplay: () => void;
  onExitReplay: () => void;
  onReplayTogglePause: () => void;
  onReplaySeek: (time: number) => void;
  onReplaySpeedChange: (speed: number) => void;
  onToggleReplayTrails: () => void;
  onToggleCuePathTracer: () => void;
  onPowerChange: (power: number) => void;
  onShoot: (power: number) => void;
  onSpinChange: (x: number, y: number) => void;
  onConfirmBallInHand: () => void;
  onEnablePracticeBallInHand?: () => void;
  onSwitchPracticeDrill?: (drill: PracticeDrillId) => void;
  onCameraPresetChange: (preset: CameraPreset) => void;
  onCueStyleChange: (style: CueStyleId) => void;
  onTableClothChange: (cloth: TableClothId) => void;
  onEnvironmentChange: (env: EnvironmentId) => void;
  onSurfaceStyleChange: (style: TableSurfaceStyleId) => void;
  onToggleMute: () => void;
  onRestart: () => void;
  onPause: () => void;
  isEditMode?: boolean;
  selectedEditBallId?: number | null;
  onToggleEditMode?: () => void;
  onSelectEditBall?: (ballId: number) => void;
  onToggleBallOnTable?: (ballId: number) => void;
  onClearTrickShotTable?: () => void;
  onResetTrickShot?: () => void;
  onOpenTrickShotModal?: () => void;
  showIdealGuide?: boolean;
  idealShot?: PracticeIdealShot | null;
  onToggleIdealGuide?: () => void;
  onAlignToIdealShot?: (idealAngle: number) => void;
  onEndPracticeSession?: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  matchState,
  shotPower,
  spin,
  canShoot,
  cameraPreset,
  cueStyle,
  tableCloth,
  environmentId,
  surfaceStyle,
  muted,
  localSeatIndex,
  hasReplay,
  isReplaying,
  replayData,
  replayTime,
  replayPaused,
  replaySpeed,
  showReplayTrails,
  showCuePathTracer,
  onStartReplay,
  onExitReplay,
  onReplayTogglePause,
  onReplaySeek,
  onReplaySpeedChange,
  onToggleReplayTrails,
  onToggleCuePathTracer,
  onPowerChange,
  onShoot,
  onSpinChange,
  onConfirmBallInHand,
  onEnablePracticeBallInHand,
  onSwitchPracticeDrill,
  onCameraPresetChange,
  onCueStyleChange,
  onTableClothChange,
  onEnvironmentChange,
  onSurfaceStyleChange,
  onToggleMute,
  onRestart,
  onPause,
  isEditMode = false,
  selectedEditBallId = null,
  onToggleEditMode,
  onSelectEditBall,
  onToggleBallOnTable,
  onClearTrickShotTable,
  onResetTrickShot,
  onOpenTrickShotModal,
  showIdealGuide = false,
  idealShot = null,
  onToggleIdealGuide,
  onAlignToIdealShot,
  onEndPracticeSession,
}) => {
  const { t } = useI18n();
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<'none' | 'cue' | 'venue' | 'drill'>('none');
  const [showDailyHint, setShowDailyHint] = useState(false);
  const [pullDragging, setPullDragging] = useState(false);
  const pullStartYRef = useRef(0);
  const currentPowerRef = useRef(shotPower);
  currentPowerRef.current = shotPower;

  const spinPadRef = useRef<HTMLDivElement | null>(null);
  const [spinDragging, setSpinDragging] = useState(false);

  const p1 = matchState.players[0];
  const p2 = matchState.players[1];
  const activeTurn = matchState.turnIndex;

  // Compute remaining group balls for 8-ball display
  const renderRemainingBalls = (group: 'solids' | 'stripes' | null) => {
    if (matchState.gameMode === '9-ball') {
      const rem = matchState.balls.filter((b) => b.id > 0 && !b.pocketed).slice(0, 5);
      return (
        <div className="flex items-center gap-1 mt-1">
          {rem.map((b) => (
            <span
              key={b.id}
              className="w-4 h-4 rounded-full text-[9px] font-mono-num font-bold flex items-center justify-center text-black border border-black/40"
              style={{ backgroundColor: BALL_COLORS[b.id]?.hex ?? '#fff' }}
            >
              {b.id}
            </span>
          ))}
        </div>
      );
    }
    if (!group) return null;
    const ids = group === 'solids' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
    return (
      <div className="flex items-center gap-1 mt-1">
        {ids.map((id) => {
          const pocketed = matchState.balls.find((b) => b.id === id)?.pocketed;
          return (
            <span
              key={id}
              className={`w-3.5 h-3.5 rounded-full border border-white/25 ${
                pocketed ? 'opacity-20' : 'opacity-100'
              }`}
              style={{ backgroundColor: BALL_COLORS[id]?.hex }}
              title={BALL_COLORS[id]?.name}
            />
          );
        })}
      </div>
    );
  };

  // Pull-to-Shoot vertical slider handlers (supports mouse & touch)
  const onPowerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canShoot || matchState.phase === 'ball_in_hand') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPullDragging(true);
    pullStartYRef.current = e.clientY;
    onPowerChange(0.12);
  };

  const onPowerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pullDragging) return;
    const dy = e.clientY - pullStartYRef.current;
    // Dragging downwards charges power 0 -> 1; dragging back up above start cancels (<0.05)
    const nextPower = Math.max(0, Math.min(1, dy / 150));
    onPowerChange(nextPower);
  };

  const onPowerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pullDragging) return;
    setPullDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (currentPowerRef.current >= 0.06) {
      onShoot(currentPowerRef.current);
    } else {
      onPowerChange(0.45);
    }
  };

  // Spin pad handlers
  const updateSpinFromPointer = (clientX: number, clientY: number) => {
    const el = spinPadRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((clientY - rect.top) / rect.height) * 2 - 1); // +Y = top of ball (topspin)
    const dist = Math.hypot(nx, ny);
    const clampedX = dist > 1 ? nx / dist : nx;
    const clampedY = dist > 1 ? ny / dist : ny;
    onSpinChange(Number(clampedX.toFixed(2)), Number(clampedY.toFixed(2)));
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-2.5 sm:p-4 safe-area-inset">
      {/* TOP BAR: Player Matchup & Status (wraps center strip cleanly on <sm mobile portrait) */}
      <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-1.5 sm:gap-4">
        {/* Player 1 */}
        <div
          className={`order-1 pointer-events-auto flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border transition-colors ${
            activeTurn === 0
              ? 'bg-[#0E1613]/95 border-emerald-500/70'
              : 'bg-[#0B0F0E]/90 border-white/10'
          }`}
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-emerald-600 flex items-center justify-center font-display font-bold text-xs text-white shrink-0">
            {p1.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[90px] sm:max-w-[110px]">
                {p1.name}
              </span>
              {localSeatIndex === 0 && (
                <span className="text-[10px] text-emerald-400 font-medium">{t.youTag}</span>
              )}
            </div>
            {matchState.gameMode === 'daily_challenge' && matchState.dailyChallenge ? (
              <div className="text-[11px] font-mono-num text-amber-300">
                {t.shotsLeft}:{' '}
                {Math.max(
                  0,
                  matchState.dailyChallenge.maxShots - matchState.dailyChallenge.shotsTaken,
                )}{' '}
                / {matchState.dailyChallenge.maxShots}
              </div>
            ) : matchState.gameMode === 'practice' || matchState.gameMode === 'trick_shot' ? (
              <div className="text-[11px] font-mono-num text-zinc-400">
                {matchState.gameMode === 'trick_shot'
                  ? `${matchState.balls.filter((b) => !b.pocketed).length} ${t.onTable} · ${p1.ballsPocketed} ${t.sunk}`
                  : `${t.potted}: ${p1.ballsPocketed}`}
              </div>
            ) : (
              renderRemainingBalls(p1.group)
            )}
          </div>
        </div>

        {/* Center Turn / Status Strip (drops to second row on narrow mobile portrait) */}
        <div className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1 sm:max-w-md pointer-events-auto flex flex-col items-center text-center">
          <div
            className={`px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-lg border text-[11px] sm:text-xs font-medium max-w-full ${
              isReplaying
                ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
                : isEditMode
                  ? 'bg-amber-950/95 border-amber-500/50 text-amber-200'
                  : matchState.lastFoul
                    ? 'bg-red-950/95 border-red-500/50 text-red-200'
                    : 'bg-[#0B0F0E]/92 border-white/12 text-zinc-200'
            }`}
          >
            {isReplaying && replayData
              ? (() => {
                  const sx = replayData.shot.spinX;
                  const sy = replayData.shot.spinY;
                  const spinParts: string[] = [];
                  if (sx < -0.08) spinParts.push(t.leftEnglish);
                  else if (sx > 0.08) spinParts.push(t.rightEnglish);
                  if (sy > 0.12) spinParts.push(t.followSpin);
                  else if (sy < -0.12) spinParts.push(t.drawSpin);
                  return (
                    <>
                      <span>
                        {t.instantReplay} · {t.shotWord} #{replayData.shotNumber} ({replayData.shooterName})
                      </span>
                      {spinParts.length > 0 && (
                        <span
                          className={`ml-1.5 ${
                            sx < -0.08
                              ? 'text-sky-300'
                              : sx > 0.08
                                ? 'text-amber-300'
                                : 'text-emerald-300'
                          }`}
                        >
                          · {spinParts.join(' · ')}
                        </span>
                      )}
                    </>
                  );
                })()
              : isEditMode
                ? t.sandboxEditBanner
                : matchState.statusMessage}
          </div>

          {!isReplaying && matchState.phase === 'ball_in_hand' && canShoot && (
            <button
              type="button"
              onClick={onConfirmBallInHand}
              className="mt-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg min-h-[38px]"
            >
              {t.confirmCuePos}
            </button>
          )}

          {/* Practice Mode Ideal Ghost-Ball Aiming Indicator */}
          {!isReplaying &&
            matchState.gameMode === 'practice' &&
            matchState.phase === 'aiming' &&
            showIdealGuide &&
            idealShot && (
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-[#0B0F0E]/94 border border-amber-400/45 shadow-lg">
                <span
                  className="w-3 h-3 rounded-full border border-white/60 shrink-0"
                  style={{
                    backgroundColor: BALL_COLORS[idealShot.targetBallId]?.hex ?? '#FFFFFF',
                  }}
                />
                <span className="text-xs font-semibold text-white whitespace-nowrap">
                  #{idealShot.targetBallId} → {idealShot.pocketLabel}
                </span>
                <span className="font-mono-num text-[11px] text-amber-300 whitespace-nowrap">
                  {idealShot.cutAngleDeg}° {t.cutDeg}
                </span>
                <span
                  className={`font-mono-num text-[11px] font-semibold whitespace-nowrap ${
                    Math.abs(idealShot.angleErrorDeg) <= 1.5
                      ? 'text-emerald-400'
                      : 'text-zinc-300'
                  }`}
                >
                  {Math.abs(idealShot.angleErrorDeg) <= 1.5
                    ? t.aligned
                    : `${t.aimArrow} ${idealShot.angleErrorDeg > 0 ? '←' : '→'} ${Math.abs(idealShot.angleErrorDeg).toFixed(1)}°`}
                </span>
                {onAlignToIdealShot && Math.abs(idealShot.angleErrorDeg) > 1.5 && (
                  <button
                    type="button"
                    onClick={() => onAlignToIdealShot(idealShot.idealAngle)}
                    className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-[11px] font-semibold text-amber-200 whitespace-nowrap"
                  >
                    {t.alignBtn}
                  </button>
                )}
              </div>
            )}
          {/* Daily Challenge Objective & Optional Tip */}
          {!isReplaying &&
            matchState.gameMode === 'daily_challenge' &&
            matchState.dailyChallenge && (
              <div className="mt-1.5 px-3 py-1.5 rounded-lg bg-[#0B0F0E]/92 border border-amber-400/30 text-[11px] text-zinc-200 max-w-sm">
                <div className="font-medium text-amber-200">
                  {matchState.dailyChallenge.objectiveLabel}
                </div>
                {showDailyHint && (
                  <div className="mt-1 pt-1 border-t border-white/10 text-zinc-300">
                    {matchState.dailyChallenge.hint}
                  </div>
                )}
              </div>
            )}
        </div>

        {/* Player 2 (or Practice / Trick Shot Sandbox / Daily Challenge shortcuts) */}
        {matchState.gameMode !== 'practice' &&
        matchState.gameMode !== 'trick_shot' &&
        matchState.gameMode !== 'daily_challenge' ? (
          <div
            className={`order-2 sm:order-3 pointer-events-auto flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border transition-colors ${
              activeTurn === 1
                ? 'bg-[#0E1613]/95 border-emerald-500/70'
                : 'bg-[#0B0F0E]/90 border-white/10'
            }`}
          >
            <div className="min-w-0 text-right">
              <div className="flex items-center justify-end gap-1.5">
                {localSeatIndex === 1 && (
                  <span className="text-[10px] text-emerald-400 font-medium">{t.youTag}</span>
                )}
                <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[90px] sm:max-w-[110px]">
                  {p2.name}
                </span>
              </div>
              {renderRemainingBalls(p2.group)}
            </div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-amber-600 flex items-center justify-center font-display font-bold text-xs text-white shrink-0">
              {p2.name.slice(0, 2).toUpperCase()}
            </div>
          </div>
        ) : matchState.gameMode === 'trick_shot' ? (
          <div className="order-2 sm:order-3 pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
            {!isReplaying && onToggleEditMode && matchState.phase !== 'shooting' && (
              <button
                type="button"
                onClick={onToggleEditMode}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg border text-xs font-semibold min-h-[38px] transition-colors ${
                  isEditMode
                    ? 'bg-emerald-600 border-emerald-400 text-white'
                    : 'bg-[#0E1311]/92 border-white/15 hover:border-emerald-500/50 text-zinc-100'
                }`}
              >
                {isEditMode ? (
                  <>
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>{t.shootMode}</span>
                  </>
                ) : (
                  <>
                    <Move className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t.editTable}</span>
                  </>
                )}
              </button>
            )}

            {!isReplaying && onResetTrickShot && matchState.phase !== 'shooting' && (
              <button
                type="button"
                onClick={onResetTrickShot}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg bg-[#0E1311]/92 border border-white/15 hover:border-emerald-500/50 text-xs font-semibold text-zinc-200 min-h-[38px]"
                title={t.resetShot}
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">{t.resetShot}</span>
              </button>
            )}

            {!isReplaying && onOpenTrickShotModal && (
              <button
                type="button"
                onClick={onOpenTrickShotModal}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg bg-[#0E1311]/92 border border-emerald-500/35 hover:border-emerald-400 text-xs font-semibold text-emerald-300 min-h-[38px]"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>{t.layouts}</span>
              </button>
            )}
          </div>
        ) : matchState.gameMode === 'daily_challenge' ? (
          <div className="order-2 sm:order-3 pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
            {!isReplaying && (
              <button
                type="button"
                aria-pressed={showDailyHint}
                onClick={() => setShowDailyHint((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg border text-xs font-semibold min-h-[38px] transition-colors ${
                  showDailyHint
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                    : 'bg-[#0E1311]/92 border-white/15 hover:border-amber-400/40 text-zinc-200'
                }`}
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{t.tip}</span>
              </button>
            )}

            {!isReplaying && matchState.phase !== 'shooting' && (
              <button
                type="button"
                onClick={onRestart}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg bg-[#0E1311]/92 border border-white/15 hover:border-emerald-500/50 text-xs font-semibold text-zinc-200 min-h-[38px]"
              >
                <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.retry}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="order-2 sm:order-3 pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
            {!isReplaying && onToggleIdealGuide && (
              <button
                type="button"
                aria-pressed={showIdealGuide}
                onClick={onToggleIdealGuide}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg border text-xs font-semibold min-h-[38px] transition-colors ${
                  showIdealGuide
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                    : 'bg-[#0E1311]/92 border-white/15 hover:border-amber-400/40 text-zinc-300'
                }`}
              >
                <Compass className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{t.idealPath}</span>
              </button>
            )}

            {!isReplaying && onEnablePracticeBallInHand && matchState.phase === 'aiming' && (
              <button
                type="button"
                onClick={onEnablePracticeBallInHand}
                className="px-2.5 sm:px-3 py-2 rounded-lg bg-[#0E1311]/92 border border-white/15 hover:border-emerald-500/50 text-xs font-semibold text-zinc-200 min-h-[38px]"
              >
                {t.moveCueBall}
              </button>
            )}

            {!isReplaying && onEndPracticeSession && matchState.phase !== 'shooting' && (
              <button
                type="button"
                onClick={onEndPracticeSession}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/45 text-xs font-semibold text-emerald-200 min-h-[38px]"
              >
                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{t.endSession}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* MIDDLE FLANKS: Compact Spin Selector (Left) & Pull-to-Shoot Power Bar (Right) */}
      {!isReplaying && !isEditMode ? (
      <div className="flex items-center justify-between my-auto">
        {/* Cue Ball Spin Selector */}
        <div className="pointer-events-auto flex flex-col items-center gap-1 sm:gap-1.5 p-2 sm:p-2.5 rounded-xl bg-[#0B0F0E]/92 border border-white/12">
          <div className="text-[10px] font-semibold text-zinc-400">{t.spin}</div>
          <div
            ref={spinPadRef}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setSpinDragging(true);
              updateSpinFromPointer(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (spinDragging) updateSpinFromPointer(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              setSpinDragging(false);
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            onPointerCancel={(e) => {
              setSpinDragging(false);
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            className="relative w-12 h-12 sm:w-16 sm:h-16 rounded-full cursor-crosshair border border-white/20 touch-none"
            style={{
              background:
                'radial-gradient(circle at 35% 30%, #FFFFFF 0%, #EAE4D3 65%, #BEB59F 100%)',
            }}
          >
            {/* Crosshair lines */}
            <div className="absolute inset-x-2 top-1/2 h-px bg-black/15 pointer-events-none" />
            <div className="absolute inset-y-2 left-1/2 w-px bg-black/15 pointer-events-none" />
            {/* Tip Contact Dot */}
            <div
              className="absolute w-3 h-3 rounded-full bg-red-600 border border-white shadow-sm -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left: `${((spin.x + 1) / 2) * 100}%`,
                top: `${((1 - spin.y) / 2) * 100}%`,
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => onSpinChange(0, 0)}
            className="text-[10px] text-zinc-400 hover:text-emerald-400 font-mono-num min-h-[24px]"
          >
            {spin.x === 0 && spin.y === 0
              ? t.center
              : `${spin.y > 0.15 ? t.top : spin.y < -0.15 ? t.draw : t.mid} ${
                  spin.x > 0.15 ? t.rightShort : spin.x < -0.15 ? t.leftShort : ''
                }`}
          </button>
        </div>

        {/* Pull-to-Shoot Power Bar */}
        <div className="pointer-events-auto flex flex-col items-center gap-1 sm:gap-1.5 p-2 sm:p-2.5 rounded-xl bg-[#0B0F0E]/92 border border-white/12">
          <div className="font-mono-num text-[11px] font-semibold text-emerald-400">
            {Math.round(shotPower * 100)}%
          </div>
          <div
            onPointerDown={onPowerPointerDown}
            onPointerMove={onPowerPointerMove}
            onPointerUp={onPowerPointerUp}
            onPointerCancel={onPowerPointerUp}
            className={`relative w-10 sm:w-11 h-28 sm:h-44 rounded-lg bg-[#141A17] border border-white/15 overflow-hidden flex flex-col justify-end select-none touch-none ${
              canShoot && matchState.phase !== 'ball_in_hand'
                ? 'cursor-ns-resize'
                : 'opacity-40 cursor-not-allowed'
            }`}
          >
            <div
              className="w-full transition-colors"
              style={{
                height: `${shotPower * 100}%`,
                background:
                  shotPower > 0.8
                    ? 'linear-gradient(180deg, #EF4444 0%, #F59E0B 100%)'
                    : 'linear-gradient(180deg, #10B981 0%, #059669 100%)',
              }}
            />
            <div className="absolute inset-x-0 top-1.5 text-center text-[9px] font-semibold text-zinc-400 pointer-events-none">
              {t.pull}
            </div>
          </div>
          <button
            type="button"
            disabled={!canShoot || matchState.phase === 'ball_in_hand'}
            onClick={() => onShoot(shotPower)}
            className="w-full py-1.5 px-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-35 text-[11px] font-bold text-white min-h-[34px]"
          >
            {t.hit}
          </button>
        </div>
      </div>
      ) : (
        <div className="my-auto" />
      )}

      {/* BOTTOM COLLAPSIBLE DOCK OR REPLAY PLAYER */}
      {isReplaying && replayData ? (
        <div className="flex flex-col items-center">
          <div className="pointer-events-auto w-full max-w-4xl rounded-xl bg-[#0B0F0E]/95 border border-emerald-500/35 shadow-2xl px-3.5 py-2.5 space-y-2">
            {/* Scrubber Row */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onReplayTogglePause}
                aria-label={replayPaused ? t.playReplay : t.pauseReplay}
                className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                {replayPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
              </button>

              <span className="font-mono-num text-xs text-zinc-300 shrink-0 w-24">
                {replayTime.toFixed(2)}s / {replayData.duration.toFixed(2)}s
              </span>

              <input
                type="range"
                min={0}
                max={Math.max(0.05, replayData.duration)}
                step={0.01}
                value={Math.min(replayTime, replayData.duration)}
                onChange={(e) => onReplaySeek(Number(e.target.value))}
                className="flex-1 accent-emerald-500 cursor-pointer"
                aria-label={t.replayTimeline}
              />

              <button
                type="button"
                onClick={() => onReplaySeek(0)}
                aria-label={t.restartReplay}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 shrink-0 min-h-[36px]"
                title={t.restartReplay}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Camera Angles, Speed & Exit Row */}
            <div className="flex items-center justify-between gap-2 overflow-x-auto pt-1 border-t border-white/10">
              <div className="flex items-center gap-1">
                <Camera className="w-3.5 h-3.5 text-emerald-400 mr-0.5 hidden sm:block shrink-0" />
                {(
                  [
                    ['follow', t.camFollow],
                    ['aim', t.camShot],
                    ['overhead', t.camTop2d],
                    ['orbit', t.camOrbit],
                    ['low', t.camLow],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onCameraPresetChange(id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap min-h-[32px] ${
                      cameraPreset === id
                        ? 'bg-emerald-600 text-white'
                        : 'text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  aria-pressed={replaySpeed < 1}
                  onClick={() => {
                    const nextSpeed =
                      replaySpeed >= 1 ? 0.5 : replaySpeed === 0.5 ? 0.25 : 1;
                    onReplaySpeedChange(nextSpeed);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border whitespace-nowrap min-h-[32px] transition-colors ${
                    replaySpeed < 1
                      ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                      : 'bg-[#141A17] border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Gauge className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.slowMotion}</span>
                  {replaySpeed < 1 && (
                    <span className="font-mono-num text-[11px] text-amber-300">
                      {replaySpeed}x
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-0.5 bg-[#141A17] rounded-md p-0.5 border border-white/10">
                  {[0.25, 0.5, 1, 2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => onReplaySpeedChange(spd)}
                      className={`px-2 py-1 rounded text-[11px] font-mono-num font-semibold ${
                        replaySpeed === spd
                          ? 'bg-emerald-600 text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  aria-pressed={showCuePathTracer}
                  onClick={onToggleCuePathTracer}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border whitespace-nowrap min-h-[32px] ${
                    showCuePathTracer
                      ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                      : 'bg-[#141A17] border-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Target className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.pathTracer}</span>
                </button>

                <button
                  type="button"
                  aria-pressed={showReplayTrails}
                  onClick={onToggleReplayTrails}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border min-h-[32px] ${
                    showReplayTrails
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-[#141A17] border-white/10 text-zinc-400'
                  }`}
                >
                  <Route className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.trails}</span>
                </button>

                <button
                  type="button"
                  onClick={onExitReplay}
                  className="flex items-center gap-1 px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs font-semibold text-white min-h-[32px]"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{t.exit}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
      <div className="flex flex-col items-center">
        {/* Trick Shot Sandbox Ball Palette Tray when in Edit Table mode */}
        {isEditMode && matchState.gameMode === 'trick_shot' && (
          <div className="pointer-events-auto mb-2 px-3 py-2.5 rounded-xl bg-[#0B0F0E]/95 border border-emerald-500/35 shadow-2xl max-w-3xl w-full space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-300">
                {t.ballTrayHint}
              </span>
              <div className="flex items-center gap-1.5">
                {selectedEditBallId !== null && selectedEditBallId > 0 && onToggleBallOnTable && (
                  <button
                    type="button"
                    onClick={() => onToggleBallOnTable(selectedEditBallId)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-950/50 hover:bg-red-900/60 border border-red-500/35 text-xs font-semibold text-red-200 min-h-[30px]"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t.removeBall} #{selectedEditBallId}
                  </button>
                )}
                {onClearTrickShotTable && (
                  <button
                    type="button"
                    onClick={onClearTrickShotTable}
                    className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-200 min-h-[30px]"
                  >
                    {t.clearBalls}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {Array.from({ length: 16 }, (_, id) => {
                const ball = matchState.balls.find((b) => b.id === id);
                const onTable = Boolean(ball && !ball.pocketed);
                const selected = selectedEditBallId === id;
                const meta = BALL_COLORS[id];

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      if (onTable) {
                        onSelectEditBall?.(id);
                      } else {
                        onToggleBallOnTable?.(id);
                      }
                    }}
                    className={`relative w-8 h-8 rounded-full font-mono-num text-[11px] font-bold flex items-center justify-center shrink-0 border-2 transition-transform ${
                      selected
                        ? 'border-emerald-400 scale-110 shadow-lg shadow-emerald-950/70'
                        : onTable
                          ? 'border-white/40 hover:border-white'
                          : 'border-white/15 opacity-40 hover:opacity-85'
                    }`}
                    style={{
                      backgroundColor: id === 0 ? '#F4F1E8' : meta?.hex ?? '#FFFFFF',
                      color: id === 0 || id === 1 || id === 9 ? '#111111' : '#FFFFFF',
                    }}
                  >
                    {meta?.isStripe && (
                      <span className="absolute inset-x-0.5 top-0.5 bottom-0.5 rounded-full border-2 border-white/85 pointer-events-none" />
                    )}
                    <span className="relative z-10">{id === 0 ? 'C' : id}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Optional Popover Drawer above dock */}
        {!dockCollapsed && openDrawer !== 'none' && (
          <div className="pointer-events-auto mb-2 p-3 rounded-xl bg-[#0E1311]/96 border border-white/15 shadow-xl max-w-md w-full">
            {openDrawer === 'cue' && (
              <div>
                <div className="text-xs font-semibold text-zinc-400 mb-2">{t.selectCueStick}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(CUE_STYLES) as CueStyleId[]).map((cid) => (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => {
                        onCueStyleChange(cid);
                        setOpenDrawer('none');
                      }}
                      className={`px-3 py-2 rounded-lg border text-left text-xs ${
                        cueStyle === cid
                          ? 'bg-emerald-600/20 border-emerald-500 text-white'
                          : 'bg-[#141A17] border-white/10 text-zinc-300'
                      }`}
                    >
                      <div className="font-semibold">{CUE_STYLES[cid].name}</div>
                      <div className="text-[10px] text-zinc-400">{CUE_STYLES[cid].controlLabel}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {openDrawer === 'venue' && (
              <div className="space-y-2.5">
                <div>
                  <div className="text-xs font-semibold text-zinc-400 mb-1.5">{t.tableCloth}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(TABLE_CLOTHS) as TableClothId[]).map((tid) => (
                      <button
                        key={tid}
                        type="button"
                        onClick={() => onTableClothChange(tid)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                          tableCloth === tid
                            ? 'bg-emerald-600/20 border-emerald-500 text-white'
                            : 'bg-[#141A17] border-white/10 text-zinc-300'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-sm shrink-0"
                          style={{ backgroundColor: TABLE_CLOTHS[tid].clothColor }}
                        />
                        <span className="truncate">{TABLE_CLOTHS[tid].name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-400 mb-1.5">{t.roomEnvironment}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(ENVIRONMENTS) as EnvironmentId[]).map((eid) => (
                      <button
                        key={eid}
                        type="button"
                        onClick={() => onEnvironmentChange(eid)}
                        className={`px-2.5 py-1.5 rounded-lg border text-left text-xs truncate ${
                          environmentId === eid
                            ? 'bg-emerald-600/20 border-emerald-500 text-white'
                            : 'bg-[#141A17] border-white/10 text-zinc-300'
                        }`}
                      >
                        {ENVIRONMENTS[eid].name}
                      </button>
                    ))}
                  </div>
                </div>
                {matchState.playMode !== 'online' && (
                  <div>
                    <div className="text-xs font-semibold text-zinc-400 mb-1.5">
                      {t.surfaceStyleLabel}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(Object.keys(TABLE_SURFACE_STYLES) as TableSurfaceStyleId[]).map((sid) => {
                        const cfg = TABLE_SURFACE_STYLES[sid];
                        const label =
                          sid === 'tournament'
                            ? t.surfaceTournament
                            : sid === 'club'
                              ? t.surfaceClub
                              : t.surfaceVintage;
                        return (
                          <button
                            key={sid}
                            type="button"
                            onClick={() => onSurfaceStyleChange(sid)}
                            className={`px-2 py-1.5 rounded-lg border text-left text-[11px] ${
                              surfaceStyle === sid
                                ? 'bg-emerald-600/20 border-emerald-500 text-white'
                                : 'bg-[#141A17] border-white/10 text-zinc-300'
                            }`}
                          >
                            <div className="font-semibold truncate">{label}</div>
                            <div className="text-[9px] font-mono-num text-zinc-400">
                              {cfg.clothFrictionMultiplier.toFixed(2)}x · {cfg.cushionElasticityMultiplier.toFixed(2)}x
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {openDrawer === 'drill' && onSwitchPracticeDrill && (
              <div>
                <div className="text-xs font-semibold text-zinc-400 mb-2">{t.loadPracticeDrill}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['full_rack', t.drillFullRack],
                      ['nine_rack', t.drillNineRack],
                      ['lineup', t.drillLineup],
                      ['cut_shots', t.drillCutShots],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        onSwitchPracticeDrill(id);
                        setOpenDrawer('none');
                      }}
                      className="px-3 py-2 rounded-lg bg-[#141A17] hover:bg-emerald-600/20 border border-white/10 text-xs font-semibold text-zinc-200"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Collapse Handle */}
        <button
          type="button"
          onClick={() => {
            setDockCollapsed(!dockCollapsed);
            setOpenDrawer('none');
          }}
          className="pointer-events-auto flex items-center gap-1 px-3 py-1 rounded-t-lg bg-[#0B0F0E]/92 border border-b-0 border-white/12 text-[11px] font-medium text-zinc-400 hover:text-white"
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? t.controls : t.hide}</span>
        </button>

        {/* Horizontal Dock */}
        {!dockCollapsed && (
          <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-[#0B0F0E]/94 border border-white/14 shadow-2xl overflow-x-auto max-w-[96vw]">
            {/* Camera Presets */}
            <div className="flex items-center gap-1 pr-2 border-r border-white/10">
              <Camera className="w-3.5 h-3.5 text-emerald-400 mr-0.5 hidden sm:block shrink-0" />
              {(
                [
                  ['aim', t.camAim],
                  ['overhead', t.camTop2d],
                  ['orbit', t.camOrbit],
                  ['low', t.camLow],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onCameraPresetChange(id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap min-h-[34px] ${
                    cameraPreset === id
                      ? 'bg-emerald-600 text-white'
                      : 'text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Cue & Venue Popovers */}
            <button
              type="button"
              onClick={() => setOpenDrawer(openDrawer === 'cue' ? 'none' : 'cue')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap min-h-[34px] ${
                openDrawer === 'cue' ? 'bg-white/15 text-white' : 'text-zinc-300 hover:bg-white/10'
              }`}
            >
              {t.cueBtn}
            </button>

            <button
              type="button"
              onClick={() => setOpenDrawer(openDrawer === 'venue' ? 'none' : 'venue')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap min-h-[34px] ${
                openDrawer === 'venue' ? 'bg-white/15 text-white' : 'text-zinc-300 hover:bg-white/10'
              }`}
            >
              {t.roomBtn}
            </button>

            {matchState.gameMode === 'practice' && (
              <button
                type="button"
                onClick={() => setOpenDrawer(openDrawer === 'drill' ? 'none' : 'drill')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap min-h-[34px] ${
                  openDrawer === 'drill' ? 'bg-white/15 text-white' : 'text-zinc-300 hover:bg-white/10'
                }`}
              >
                {t.drillsBtn}
              </button>
            )}

            {matchState.gameMode === 'trick_shot' && onOpenTrickShotModal && (
              <button
                type="button"
                onClick={onOpenTrickShotModal}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap min-h-[34px] text-emerald-300 hover:bg-emerald-500/15"
              >
                {t.layouts}
              </button>
            )}

            {/* Replay, Audio, Restart & Pause */}
            <div className="flex items-center gap-1 pl-2 border-l border-white/10">
              {hasReplay && (
                <button
                  type="button"
                  disabled={matchState.phase === 'shooting'}
                  onClick={onStartReplay}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 disabled:opacity-35 border border-emerald-500/40 text-xs font-semibold text-emerald-300 whitespace-nowrap min-h-[34px]"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>{t.replayBtn}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? t.audioActive : t.muted}
                className="p-2 rounded-lg text-zinc-300 hover:bg-white/10 min-h-[34px]"
              >
                {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {matchState.playMode !== 'online' && (
                <button
                  type="button"
                  onClick={onRestart}
                  aria-label={t.restartRack}
                  className="p-2 rounded-lg text-zinc-300 hover:bg-white/10 min-h-[34px]"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={onPause}
                aria-label={t.menuBtn}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white min-h-[34px]"
              >
                <Pause className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.menuBtn}</span>
              </button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
};
