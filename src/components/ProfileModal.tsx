import React, { useRef, useState } from 'react';
import { Award, Calendar, Download, RotateCcw, Upload, X } from 'lucide-react';
import { ACHIEVEMENTS } from '../game/constants.ts';
import { getTodayDateKey } from '../game/dailyChallenges.ts';
import type { SaveData } from '../game/types.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import {
  exportSaveJson,
  getEffectiveDailyStreak,
  getLevelFromXp,
  importSaveJson,
} from '../storage/saveManager.ts';

interface ProfileModalProps {
  saveData: SaveData;
  onUpdateProfile: (nickname: string, avatarColor: string) => void;
  onImportSave: (nextData: SaveData) => void;
  onResetSave: () => void;
  onClose: () => void;
}

const AVATAR_COLORS = ['#10B981', '#D4AF37', '#38BDF8', '#F43F5E', '#A855F7', '#F97316'];

export const ProfileModal: React.FC<ProfileModalProps> = ({
  saveData,
  onUpdateProfile,
  onImportSave,
  onResetSave,
  onClose,
}) => {
  const { t, formatMessage, formatDate } = useI18n();
  const [nickname, setNickname] = useState(saveData.nickname);
  const [avatarColor, setAvatarColor] = useState(saveData.avatarColor);
  const [tab, setTab] = useState<'overview' | 'achievements' | 'history' | 'data'>('overview');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { level, currentLevelXp, nextLevelXp } = getLevelFromXp(saveData.xp);
  const totalMatches = saveData.wins + saveData.losses;
  const winRate = totalMatches > 0 ? Math.round((saveData.wins / totalMatches) * 100) : 0;
  const practiceAcc =
    saveData.practiceStats.shotsTaken > 0
      ? Math.round((saveData.practiceStats.ballsPocketed / saveData.practiceStats.shotsTaken) * 100)
      : 0;

  const handleSaveIdentity = () => {
    onUpdateProfile(nickname.trim() || 'Cueist', avatarColor);
    setStatusMsg(t.profileUpdated);
    setTimeout(() => setStatusMsg(null), 2000);
  };

  const handleExport = () => {
    const json = exportSaveJson(saveData);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexorum-billiards-save-${saveData.nickname.toLowerCase().replace(/\W+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg(t.saveExported);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = importSaveJson(String(reader.result ?? ''));
      if (res.ok) {
        onImportSave(res.data);
        setNickname(res.data.nickname);
        setAvatarColor(res.data.avatarColor);
        setStatusMsg(t.saveImported);
      } else {
        setStatusMsg(res.error);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-black/75">
      <div className="w-full max-w-2xl rounded-xl bg-[#0E1311] border border-white/15 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/10">
          <h2 className="font-display text-lg sm:text-xl font-bold text-white">{t.profileTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 sm:px-6 pt-2.5 sm:pt-3 border-b border-white/10 overflow-x-auto">
          {(
            [
              ['overview', t.tabOverview],
              ['achievements', t.tabAchievements],
              ['history', t.tabHistory],
              ['data', t.tabSaveData],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === id
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto custom-scroll space-y-5 flex-1">
          {statusMsg && (
            <div className="px-4 py-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-sm text-emerald-200">
              {statusMsg}
            </div>
          )}

          {tab === 'overview' && (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-lg bg-[#141A17] border border-white/10">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center font-display font-bold text-xl text-[#080B0A] shrink-0"
                  style={{ backgroundColor: avatarColor }}
                >
                  {(nickname || 'CU').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 w-full space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={20}
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      className="flex-1 px-3.5 py-2 rounded-lg bg-[#0B0F0E] border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                      <button
                      type="button"
                      onClick={handleSaveIdentity}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                    >
                      {t.saveBtn}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {AVATAR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`${t.avatarColorLabel} ${c}`}
                        onClick={() => setAvatarColor(c)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          avatarColor === c ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* XP Bar */}
              <div className="p-4 rounded-lg bg-[#141A17] border border-white/10">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-display font-bold text-white">
                    {formatMessage(t.levelLabel, { level })}
                  </span>
                  <span className="font-mono-num text-xs text-zinc-400">
                    {currentLevelXp} / {nextLevelXp} XP
                  </span>
                </div>
                <div className="h-2 rounded-full bg-black/50 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.min(100, (currentLevelXp / nextLevelXp) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Career & Practice Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-lg bg-[#141A17] border border-white/10">
                  <div className="text-xs text-zinc-400">{t.matchesWon}</div>
                  <div className="font-mono-num text-xl font-bold text-emerald-400 mt-1">
                    {saveData.wins}
                  </div>
                </div>
                <div className="p-3.5 rounded-lg bg-[#141A17] border border-white/10">
                  <div className="text-xs text-zinc-400">{t.winRateLabel}</div>
                  <div className="font-mono-num text-xl font-bold text-white mt-1">{winRate}%</div>
                </div>
                <div className="p-3.5 rounded-lg bg-[#141A17] border border-white/10">
                  <div className="text-xs text-zinc-400">{t.practicePots}</div>
                  <div className="font-mono-num text-xl font-bold text-white mt-1">
                    {saveData.practiceStats.ballsPocketed}
                  </div>
                </div>
                <div className="p-3.5 rounded-lg bg-[#141A17] border border-white/10">
                  <div className="text-xs text-zinc-400">{t.bestStreakLabel}</div>
                  <div className="font-mono-num text-xl font-bold text-amber-400 mt-1">
                    {saveData.practiceStats.bestStreak} · {practiceAcc}%
                  </div>
                </div>
              </div>

              {/* Daily Challenge Career Summary */}
              <div className="p-4 rounded-lg bg-[#141A17] border border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-white">{t.dailyChallengesTitle}</div>
                    <div className="text-xs text-zinc-400">
                      {saveData.dailyChallenge.completedDates[getTodayDateKey()]
                        ? t.todaysChallengeDone
                        : t.todaysChallengeAvail}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono-num">
                  <div>
                    <span className="text-zinc-400">{t.streakWord} </span>
                    <span className="font-bold text-amber-300">
                      {getEffectiveDailyStreak(saveData.dailyChallenge, getTodayDateKey())}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400">{t.bestWord} </span>
                    <span className="font-bold text-white">{saveData.dailyChallenge.bestStreak}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400">{t.clearedLabel} </span>
                    <span className="font-bold text-emerald-400">
                      {saveData.dailyChallenge.totalCompleted}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'achievements' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ACHIEVEMENTS.map((ach) => {
                const unlockedAt = saveData.achievements[ach.id];
                return (
                  <div
                    key={ach.id}
                    className={`p-3.5 rounded-lg border ${
                      unlockedAt
                        ? 'bg-emerald-950/30 border-emerald-500/40'
                        : 'bg-[#141A17] border-white/10 opacity-65'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Award
                          className={`w-4 h-4 shrink-0 ${
                            unlockedAt ? 'text-amber-400' : 'text-zinc-500'
                          }`}
                        />
                        <span className="text-sm font-semibold text-white">{ach.title}</span>
                      </div>
                      <span className="font-mono-num text-xs text-emerald-400 shrink-0">
                        +{ach.xpReward} XP
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1.5">{ach.description}</p>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-2">
              {saveData.matchHistory.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-8">
                  {t.noMatchesRecorded}
                </p>
              ) : (
                saveData.matchHistory.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#141A17] border border-white/10"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {m.won ? t.victoryWord : t.defeatWord} {t.vsWord} {m.opponentName}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {m.gameMode.toUpperCase()} · {m.reason}
                      </div>
                    </div>
                    <div className="text-right font-mono-num text-xs text-zinc-400">
                      <div>{formatMessage(t.pottedCount, { count: m.ballsPocketed })}</div>
                      <div>{formatDate(m.date)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'data' && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-300">
                {formatMessage(t.saveDataStorageDesc, { version: saveData.version })}
              </p>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleExport}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white min-h-[44px]"
                >
                  <Download className="w-4 h-4" />
                  {t.exportSaveJson}
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#141A17] hover:bg-white/10 border border-white/15 text-sm font-semibold text-white min-h-[44px]"
                >
                  <Upload className="w-4 h-4" />
                  {t.importSaveJson}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </div>

              <div className="pt-4 border-t border-white/10">
                {!confirmReset ? (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-950/50 hover:bg-red-900/60 border border-red-500/30 text-sm font-semibold text-red-300 min-h-[44px]"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t.resetAllProgress}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-red-950/60 border border-red-500/40">
                    <span className="text-xs text-red-200 flex-1">
                      {t.confirmResetPrompt}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onResetSave();
                        setConfirmReset(false);
                        setStatusMsg(t.progressReset);
                      }}
                      className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-xs font-semibold text-white"
                    >
                      {t.confirmResetBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="px-3 py-1.5 rounded bg-white/10 text-xs font-semibold text-zinc-200"
                    >
                      {t.cancel}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
