import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Flame, Lightbulb, Play, Trophy, X } from 'lucide-react';
import {
  BALL_COLORS,
  HALF_LENGTH,
  HALF_WIDTH,
  POCKETS,
  TABLE_CLOTHS,
} from '../game/constants.ts';
import {
  formatDateKeyDisplay,
  getDailyChallengeForDate,
  getMsUntilNextDay,
} from '../game/dailyChallenges.ts';
import type { DailyChallengeDef, SaveData } from '../game/types.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import { getEffectiveDailyStreak } from '../storage/saveManager.ts';

interface DailyChallengeModalProps {
  saveData: SaveData;
  onStartChallenge: (dateKey: string, challenge: DailyChallengeDef) => void;
  onClose: () => void;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export const DailyChallengeModal: React.FC<DailyChallengeModalProps> = ({
  saveData,
  onStartChallenge,
  onClose,
}) => {
  const { t, formatMessage } = useI18n();
  const [countdownMs, setCountdownMs] = useState(() => getMsUntilNextDay());
  const [showHint, setShowHint] = useState(false);

  const { dateKey, challenge, dayNumber } = getDailyChallengeForDate();
  const completion = saveData.dailyChallenge.completedDates[dateKey];
  const attemptsToday = saveData.dailyChallenge.attemptsByDate[dateKey] ?? 0;
  const activeStreak = getEffectiveDailyStreak(saveData.dailyChallenge, dateKey);
  const potentialNextStreak = completion ? activeStreak : activeStreak + 1;
  const streakBonusXp = completion ? 0 : Math.min(200, (potentialNextStreak - 1) * 50);
  const totalPotentialXp = challenge.xpReward + streakBonusXp;

  const cloth = TABLE_CLOTHS[saveData.selectedTable];
  const difficultyLabel =
    challenge.difficulty === 'Hard'
      ? t.diffHard
      : challenge.difficulty === 'Expert'
        ? t.diffExpert
        : t.diffMaster;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdownMs(getMsUntilNextDay());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-black/78">
      <div className="w-full max-w-2xl rounded-xl bg-[#0E1311] border border-white/15 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-amber-400 font-medium">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono-num">
                #{dayNumber} · {formatDateKeyDisplay(dateKey)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num text-zinc-400">
                {formatCountdown(countdownMs)}
              </span>
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-white mt-0.5 truncate">
              {t.dailyChallenge}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto custom-scroll space-y-5 flex-1">
          {/* Challenge Overview & 2D Felt Diagram */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
            <div className="md:col-span-7 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                  <span className="text-emerald-400 font-semibold">{challenge.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-300 font-semibold">{difficultyLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num">
                    {challenge.maxShots === 1
                      ? t.maxShotsSingle
                      : formatMessage(t.maxShotsPlural, { count: challenge.maxShots })}
                  </span>
                </div>
                <h3 className="font-display text-2xl font-bold text-white text-balance">
                  {challenge.title}
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed mt-2">
                  {challenge.description}
                </p>
              </div>

              <div className="pt-3 border-t border-white/10 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-400">{t.objectiveLabel}</span>
                  <span className="text-white font-medium text-right">
                    {challenge.objectiveLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-400">{t.completionRewardLabel}</span>
                  <span className="font-mono-num font-semibold text-amber-300">
                    {completion
                      ? formatMessage(t.claimedXp, { xp: completion.xpEarned })
                      : `+${challenge.xpReward} XP${
                          streakBonusXp > 0
                            ? ` ${formatMessage(t.streakBonusPlus, { xp: streakBonusXp })}`
                            : ''
                        }`}
                  </span>
                </div>
                {attemptsToday > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-400">{t.todaysAttempts}</span>
                    <span className="font-mono-num text-zinc-300">{attemptsToday}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2D Felt Table Preview */}
            <div className="md:col-span-5 flex flex-col justify-center rounded-lg bg-[#141A17] border border-white/10 p-3">
              <div className="text-[11px] font-medium text-zinc-400 mb-2 flex items-center justify-between">
                <span>{t.tableLayoutLabel}</span>
                <span className="font-mono-num">
                  {formatMessage(t.objectBallsCount, {
                    count: challenge.balls.filter((b) => b.id > 0).length,
                  })}
                </span>
              </div>
              <svg
                viewBox={`-${HALF_LENGTH + 0.14} -${HALF_WIDTH + 0.14} ${(HALF_LENGTH + 0.14) * 2} ${(HALF_WIDTH + 0.14) * 2}`}
                className="w-full h-auto rounded-md overflow-hidden"
                aria-label={`${t.tableLayoutLabel}: ${challenge.title}`}
              >
                {/* Wood frame */}
                <rect
                  x={-HALF_LENGTH - 0.12}
                  y={-HALF_WIDTH - 0.12}
                  width={(HALF_LENGTH + 0.12) * 2}
                  height={(HALF_WIDTH + 0.12) * 2}
                  rx={0.07}
                  fill={cloth.woodColor}
                />
                {/* Felt bed */}
                <rect
                  x={-HALF_LENGTH}
                  y={-HALF_WIDTH}
                  width={HALF_LENGTH * 2}
                  height={HALF_WIDTH * 2}
                  rx={0.02}
                  fill={cloth.clothColor}
                />
                {/* Head string line */}
                <line
                  x1={-HALF_LENGTH / 2}
                  y1={-HALF_WIDTH}
                  x2={-HALF_LENGTH / 2}
                  y2={HALF_WIDTH}
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth={0.008}
                  strokeDasharray="0.03 0.03"
                />
                {/* 6 Pockets */}
                {POCKETS.map((p) => (
                  <circle
                    key={p.index}
                    cx={p.x}
                    cy={p.z}
                    r={p.radius * 0.88}
                    fill="#090B0A"
                    stroke="rgba(255,255,255,0.14)"
                    strokeWidth={0.008}
                  />
                ))}
                {/* Balls */}
                {challenge.balls.map((b) => {
                  const meta = BALL_COLORS[b.id];
                  const fill = b.id === 0 ? '#F7F3E8' : meta?.hex ?? '#FFFFFF';
                  const textColor = b.id === 0 || b.id === 1 || b.id === 9 ? '#111111' : '#FFFFFF';
                  return (
                    <g key={b.id}>
                      <circle
                        cx={b.x}
                        cy={b.z}
                        r={0.056}
                        fill={fill}
                        stroke={b.id === 0 ? '#10B981' : 'rgba(255,255,255,0.55)'}
                        strokeWidth={b.id === 0 ? 0.014 : 0.008}
                      />
                      {meta?.isStripe && (
                        <circle
                          cx={b.x}
                          cy={b.z}
                          r={0.038}
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth={0.011}
                        />
                      )}
                      <text
                        x={b.x}
                        y={b.z + 0.019}
                        textAnchor="middle"
                        fill={textColor}
                        fontSize={0.052}
                        fontWeight="700"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {b.id === 0 ? 'C' : b.id}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Optional Coach Tip */}
          <div className="rounded-lg bg-[#141A17] border border-white/10 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{t.coachTip}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowHint((v) => !v)}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                {showHint ? t.hideTip : t.revealTip}
              </button>
            </div>
            {showHint && (
              <p className="text-xs text-zinc-300 leading-relaxed mt-2">{challenge.hint}</p>
            )}
          </div>

          {/* Completion Banner (if already completed today) */}
          {completion && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    {t.todaysChallengeDone}
                  </div>
                  <div className="text-xs text-emerald-200 font-mono-num">
                    {formatMessage(t.clearedInShots, {
                      count: completion.shotsUsed,
                      shotLabel: completion.shotsUsed === 1 ? t.shotSingle : t.shotPlural,
                      xp: completion.xpEarned,
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LocalStorage Streak & Reward Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-[#141A17] border border-white/10">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{t.dailyStreak}</span>
              </div>
              <div className="font-mono-num text-lg font-bold text-white mt-1">
                {activeStreak} {activeStreak === 1 ? t.dayWord : t.daysWord}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#141A17] border border-white/10">
              <div className="text-xs text-zinc-400">{t.bestStreakLabel}</div>
              <div className="font-mono-num text-lg font-bold text-amber-400 mt-1">
                {saveData.dailyChallenge.bestStreak}{' '}
                {saveData.dailyChallenge.bestStreak === 1 ? t.dayWord : t.daysWord}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#141A17] border border-white/10">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Trophy className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{t.clearedLabel}</span>
              </div>
              <div className="font-mono-num text-lg font-bold text-emerald-400 mt-1">
                {saveData.dailyChallenge.totalCompleted}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#141A17] border border-white/10">
              <div className="text-xs text-zinc-400">{t.rewardXpLabel}</div>
              <div className="font-mono-num text-lg font-bold text-white mt-1">
                {saveData.dailyChallenge.totalXpEarned}
              </div>
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-t border-white/10 bg-[#0B0F0E]">
          <span className="text-xs text-zinc-400 font-mono-num hidden sm:inline">
            {completion
              ? t.alreadyClaimed
              : `+${totalPotentialXp} XP`}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg bg-[#141A17] hover:bg-white/10 border border-white/10 text-sm font-medium text-zinc-300 min-h-[44px]"
            >
              {t.close}
            </button>
            <button
              type="button"
              onClick={() => onStartChallenge(dateKey, challenge)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#080B0A] text-sm font-display font-bold min-h-[44px] whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{completion ? t.retryChallenge : t.startChallenge}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
