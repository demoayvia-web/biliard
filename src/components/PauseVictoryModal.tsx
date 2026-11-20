import React from 'react';
import { Award, BarChart3, Film, Flame, Home, Play, RotateCcw, Settings, XCircle } from 'lucide-react';
import type { MatchState } from '../game/types.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

export interface DailyRewardSummary {
  xpEarned: number;
  streakBonus: number;
  alreadyCompletedToday: boolean;
  currentStreak: number;
}

interface PauseVictoryModalProps {
  mode: 'pause' | 'game_over';
  matchState: MatchState;
  newlyUnlockedAchievements?: string[];
  dailyRewardSummary?: DailyRewardSummary | null;
  hasReplay?: boolean;
  onStartReplay?: () => void;
  onEndPracticeSession?: () => void;
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onExitToMenu: () => void;
}

export const PauseVictoryModal: React.FC<PauseVictoryModalProps> = ({
  mode,
  matchState,
  newlyUnlockedAchievements = [],
  dailyRewardSummary = null,
  hasReplay = false,
  onStartReplay,
  onEndPracticeSession,
  onResume,
  onRestart,
  onOpenSettings,
  onExitToMenu,
}) => {
  const { t } = useI18n();
  const isVictory = mode === 'game_over';
  const isDaily = matchState.gameMode === 'daily_challenge';
  const isDailyFail = isVictory && isDaily && Boolean(matchState.dailyChallenge?.failed);
  const isDailyWin = isVictory && isDaily && Boolean(matchState.dailyChallenge?.completed);
  const winner =
    matchState.winnerIndex !== null ? matchState.players[matchState.winnerIndex] : null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-black/75">
      <div className="w-full max-w-md rounded-xl bg-[#0E1311] border border-white/15 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        <div className="p-5 sm:p-6 text-center space-y-2.5 sm:space-y-3 border-b border-white/10">
          {isVictory ? (
            <>
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto border ${
                  isDailyFail
                    ? 'bg-red-950/40 border-red-500/40'
                    : isDailyWin
                      ? 'bg-amber-500/20 border-amber-400/50'
                      : 'bg-emerald-600/20 border-emerald-500/40'
                }`}
              >
                {isDailyFail ? (
                  <XCircle className="w-6 h-6 text-red-400" />
                ) : (
                  <Award className={`w-6 h-6 ${isDailyWin ? 'text-amber-400' : 'text-emerald-400'}`} />
                )}
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                {isDailyFail
                  ? t.challengeFailed
                  : isDailyWin
                    ? t.dailyComplete
                    : winner
                      ? `${winner.name} ${t.winsTitle}`
                      : t.matchComplete}
              </h2>
              <p className="text-sm text-zinc-300">{matchState.winReason}</p>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                {isDaily ? t.dailyPaused : t.matchPaused}
              </h2>
              <p className="text-xs text-zinc-400 font-mono-num">
                {isDaily && matchState.dailyChallenge
                  ? `${matchState.dailyChallenge.title} · ${t.shotsLeft}: ${
                      matchState.dailyChallenge.maxShots - matchState.dailyChallenge.shotsTaken
                    }`
                  : `${matchState.gameMode.toUpperCase()} · ${t.shotWord} #${matchState.shotNumber}`}
              </p>
            </>
          )}
        </div>

        <div className="p-4 sm:p-6 space-y-2.5 sm:space-y-3 overflow-y-auto custom-scroll">
          {isVictory && !isDaily && (
            <div className="grid grid-cols-2 gap-3 mb-2">
              {matchState.players.map((p, idx) => (
                <div
                  key={p.id}
                  className={`p-3 rounded-lg border text-center ${
                    matchState.winnerIndex === idx
                      ? 'bg-emerald-950/30 border-emerald-500/40'
                      : 'bg-[#141A17] border-white/10'
                  }`}
                >
                  <div className="text-xs font-semibold text-white truncate">{p.name}</div>
                  <div className="font-mono-num text-lg font-bold text-emerald-400 mt-1">
                    {p.ballsPocketed} {t.sunk}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isDailyWin && dailyRewardSummary && (
            <div className="p-3.5 rounded-lg bg-[#141A17] border border-amber-400/35 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">{t.dailyReward}</span>
                <span className="font-mono-num font-bold text-amber-300">
                  {dailyRewardSummary.alreadyCompletedToday
                    ? t.alreadyClaimed
                    : `+${dailyRewardSummary.xpEarned} XP`}
                </span>
              </div>
              {!dailyRewardSummary.alreadyCompletedToday && dailyRewardSummary.streakBonus > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">{t.streakBonus}</span>
                  <span className="font-mono-num text-emerald-400">
                    +{dailyRewardSummary.streakBonus} XP
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-white/10">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t.dailyStreak}</span>
                </span>
                <span className="font-mono-num font-semibold text-white">
                  {dailyRewardSummary.currentStreak}{' '}
                  {dailyRewardSummary.currentStreak === 1 ? t.dayWord : t.daysWord}
                </span>
              </div>
            </div>
          )}

          {newlyUnlockedAchievements.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 text-center">
              {t.achievementUnlocked}: {newlyUnlockedAchievements.join(', ')}
            </div>
          )}

          {!isVictory && (
            <button
              type="button"
              onClick={onResume}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold min-h-[46px]"
            >
              <Play className="w-4 h-4 fill-current" />
              {t.resume}
            </button>
          )}

          {hasReplay && onStartReplay && (
            <button
              type="button"
              onClick={onStartReplay}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 text-sm font-semibold min-h-[46px]"
            >
              <Film className="w-4 h-4" />
              {isVictory ? t.replayFinalShot : t.replayLastShot}
            </button>
          )}

          {!isVictory && matchState.gameMode === 'practice' && onEndPracticeSession && (
            <button
              type="button"
              onClick={onEndPracticeSession}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/45 text-amber-200 text-sm font-semibold min-h-[46px]"
            >
              <BarChart3 className="w-4 h-4" />
              {t.endSessionHeatmap}
            </button>
          )}

          <button
            type="button"
            onClick={onRestart}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold min-h-[46px] ${
              isDailyFail
                ? 'bg-amber-500 hover:bg-amber-400 text-[#080B0A]'
                : 'bg-[#141A17] hover:bg-white/10 border border-white/15 text-white'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            {matchState.playMode === 'online'
              ? t.requestRematch
              : isDaily
                ? t.retryChallenge
                : t.restartRack}
          </button>

          {!isVictory && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[#141A17] hover:bg-white/10 border border-white/15 text-zinc-200 text-sm font-semibold min-h-[46px]"
            >
              <Settings className="w-4 h-4" />
              {t.settings}
            </button>
          )}

          <button
            type="button"
            onClick={onExitToMenu}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[#141A17] hover:bg-white/10 border border-white/10 text-zinc-300 text-sm font-medium min-h-[46px]"
          >
            <Home className="w-4 h-4" />
            {t.mainMenu}
          </button>
        </div>
      </div>
    </div>
  );
};

