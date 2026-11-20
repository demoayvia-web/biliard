import React, { useState } from 'react';
import {
  Bot,
  Calendar,
  Globe,
  Languages,
  Play,
  Settings,
  Sparkles,
  Target,
  User,
  Users,
} from 'lucide-react';
import { getDailyChallengeForDate } from '../game/dailyChallenges.ts';
import type { SaveData } from '../game/types.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import { getEffectiveDailyStreak, getLevelFromXp } from '../storage/saveManager.ts';

interface TitleScreenProps {
  saveData: SaveData;
  onQuickPlay: () => void;
  onOpenDailyChallenge: () => void;
  onOpenOnline: () => void;
  onOpenVsAI: () => void;
  onOpenLocal2P: () => void;
  onOpenPractice: () => void;
  onOpenTrickShot: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  saveData,
  onQuickPlay,
  onOpenDailyChallenge,
  onOpenOnline,
  onOpenVsAI,
  onOpenLocal2P,
  onOpenPractice,
  onOpenTrickShot,
  onOpenProfile,
  onOpenSettings,
}) => {
  const { language, languages, t, setLanguage } = useI18n();
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const { level } = getLevelFromXp(saveData.xp);
  const { dateKey, challenge } = getDailyChallengeForDate();
  const dailyDone = Boolean(saveData.dailyChallenge.completedDates[dateKey]);
  const dailyStreak = getEffectiveDailyStreak(saveData.dailyChallenge, dateKey);
  const currentLangOption =
    languages.find((opt) => opt.code === language) ?? languages[0];
  const challengeDifficultyLabel =
    challenge.difficulty === 'Hard'
      ? t.diffHard
      : challenge.difficulty === 'Expert'
        ? t.diffExpert
        : t.diffMaster;

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between safe-area-inset pointer-events-none">
      {/* Responsive gradient scrim: stronger on narrow mobile viewports, open 3D table on desktop */}
      <div
        className="absolute inset-0 pointer-events-none hidden sm:block"
        style={{
          background:
            'linear-gradient(90deg, rgba(8,11,10,0.92) 0%, rgba(8,11,10,0.74) 38%, rgba(8,11,10,0.18) 72%, rgba(8,11,10,0.08) 100%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none sm:hidden"
        style={{
          background:
            'linear-gradient(180deg, rgba(8,11,10,0.86) 0%, rgba(8,11,10,0.72) 50%, rgba(8,11,10,0.88) 100%)',
        }}
      />

      {/* Top minimal identity, language switcher & settings trigger */}
      <div className="relative z-20 flex items-center justify-between gap-2 px-4 sm:px-10 pt-3 sm:pt-7 shrink-0 pointer-events-auto">
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-3.5 py-2 rounded-lg bg-[#0E1311]/90 border border-white/10 hover:border-emerald-500/40 transition-colors text-left min-h-[44px] min-w-0"
        >
          <span
            className="w-8 h-8 rounded-md flex items-center justify-center font-display font-bold text-sm text-[#080B0A] shrink-0"
            style={{ backgroundColor: saveData.avatarColor }}
          >
            {saveData.nickname.slice(0, 2).toUpperCase()}
          </span>
          <span className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-white leading-tight truncate max-w-[120px] sm:max-w-none">
              {saveData.nickname}
            </span>
            <span className="text-xs text-zinc-400 font-mono-num whitespace-nowrap">
              {t.levelShort} {level} · {saveData.wins}
              {t.winsShort} - {saveData.losses}
              {t.lossesShort}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {/* Quick Language Switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setLangMenuOpen((v) => !v)}
              aria-label={t.languageLabel}
              aria-expanded={langMenuOpen}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0E1311]/90 border border-white/10 hover:border-emerald-500/40 text-zinc-200 hover:text-white transition-colors min-h-[44px] whitespace-nowrap"
            >
              <Languages className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-mono-num font-semibold">{currentLangOption.short}</span>
            </button>

            {langMenuOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-xl bg-[#0E1311]/98 border border-white/15 shadow-2xl p-1.5 z-30">
                {languages.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => {
                      setLanguage(opt.code);
                      setLangMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium min-h-[38px] transition-colors ${
                      language === opt.code
                        ? 'bg-emerald-600/25 text-emerald-300'
                        : 'text-zinc-200 hover:bg-white/10'
                    }`}
                  >
                    <span>{opt.nativeName}</span>
                    <span className="font-mono-num text-[11px] text-zinc-400">{opt.short}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t.settings}
            className="flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-lg bg-[#0E1311]/90 border border-white/10 hover:border-emerald-500/40 text-zinc-200 hover:text-white transition-colors min-h-[44px] whitespace-nowrap"
          >
            <Settings className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium hidden sm:inline">{t.settings}</span>
          </button>
        </div>
      </div>

      {/* Main Left-Aligned Brand Lockup & Scrollable Menu on Mobile / Short Viewports */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto custom-scroll px-4 sm:px-10 py-2 sm:py-4 flex flex-col justify-start sm:justify-center pointer-events-auto">
        <div className="max-w-md w-full my-auto">
          {/* Bespoke SVG Title Lockup */}
          <div className="mb-4 sm:mb-7">
            <svg
              viewBox="0 0 380 86"
              className="w-full max-w-[260px] sm:max-w-[340px] h-auto mb-2 sm:mb-3"
              aria-label="NEXORUM BILLIARDS 3D"
            >
              <defs>
                <linearGradient id="nexGold" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="55%" stopColor="#34D399" />
                  <stop offset="100%" stopColor="#D4AF37" />
                </linearGradient>
              </defs>
              <circle cx="20" cy="24" r="14" fill="#10B981" opacity="0.16" />
              <circle cx="20" cy="24" r="9" fill="none" stroke="url(#nexGold)" strokeWidth="2.5" />
              <circle cx="20" cy="24" r="3" fill="#F2F5F3" />
              <text
                x="44"
                y="33"
                fill="#F2F5F3"
                fontFamily="Outfit, sans-serif"
                fontWeight="800"
                fontSize="30"
                letterSpacing="2.5"
              >
                NEXORUM
              </text>
              <line x1="44" y1="45" x2="345" y2="45" stroke="url(#nexGold)" strokeWidth="1.5" opacity="0.65" />
              <text
                x="44"
                y="69"
                fill="#A1B0AA"
                fontFamily="Outfit, sans-serif"
                fontWeight="600"
                fontSize="16"
                letterSpacing="5.2"
              >
                BILLIARDS 3D
              </text>
            </svg>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-sm">
              {t.tagline}
            </p>
          </div>

          {/* Primary CTA */}
          <button
            type="button"
            onClick={onQuickPlay}
            className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 py-3 sm:py-3.5 mb-2.5 sm:mb-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-display font-bold text-base tracking-wide transition-colors shadow-lg shadow-emerald-950/50 min-h-[48px]"
          >
            <span className="flex items-center gap-2.5 sm:gap-3">
              <Play className="w-5 h-5 fill-current shrink-0" />
              <span>{t.play}</span>
            </span>
            <span className="text-xs font-mono-num font-medium text-emerald-100 truncate">
              {t.quickMatch}
            </span>
          </button>

          {/* Secondary Mode Navigation Grid */}
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={onOpenOnline}
              className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg bg-[#111715]/95 hover:bg-[#17201D] border border-white/10 hover:border-emerald-500/40 text-zinc-100 text-xs sm:text-sm font-semibold transition-colors min-h-[46px] min-w-0"
            >
              <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">{t.online}</span>
            </button>

            <button
              type="button"
              onClick={onOpenVsAI}
              className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg bg-[#111715]/95 hover:bg-[#17201D] border border-white/10 hover:border-emerald-500/40 text-zinc-100 text-xs sm:text-sm font-semibold transition-colors min-h-[46px] min-w-0"
            >
              <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">{t.vsAi}</span>
            </button>

            <button
              type="button"
              onClick={onOpenLocal2P}
              className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg bg-[#111715]/95 hover:bg-[#17201D] border border-white/10 hover:border-emerald-500/40 text-zinc-100 text-xs sm:text-sm font-semibold transition-colors min-h-[46px] min-w-0"
            >
              <Users className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="truncate">{t.local2p}</span>
            </button>

            <button
              type="button"
              onClick={onOpenPractice}
              className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg bg-[#111715]/95 hover:bg-[#17201D] border border-white/10 hover:border-emerald-500/40 text-zinc-100 text-xs sm:text-sm font-semibold transition-colors min-h-[46px] min-w-0"
            >
              <Target className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="truncate">{t.practice}</span>
            </button>

            <button
              type="button"
              onClick={onOpenDailyChallenge}
              className="col-span-2 flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg bg-[#111715]/95 hover:bg-[#17201D] border border-amber-400/35 hover:border-amber-400/65 text-zinc-100 text-xs sm:text-sm font-semibold transition-colors min-h-[46px]"
            >
              <span className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">{t.dailyChallenge}</span>
              </span>
              <span className="text-[11px] sm:text-xs font-mono-num font-medium text-amber-300 truncate">
                {dailyDone
                  ? `${t.completed} · ${dailyStreak} ${t.streakShort}`
                  : `${challengeDifficultyLabel} · +${challenge.xpReward} XP`}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenTrickShot}
              className="col-span-2 flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg bg-[#111715]/95 hover:bg-[#17201D] border border-emerald-500/25 hover:border-emerald-500/55 text-zinc-100 text-xs sm:text-sm font-semibold transition-colors min-h-[46px]"
            >
              <span className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">{t.trickShot}</span>
              </span>
              <span className="text-[11px] sm:text-xs font-medium text-zinc-400 truncate">
                {t.trickShotSub}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenProfile}
              className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg bg-[#111715]/95 hover:bg-[#17201D] border border-white/10 hover:border-emerald-500/40 text-zinc-200 text-xs sm:text-sm font-medium transition-colors min-h-[46px] min-w-0"
            >
              <User className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="truncate">{t.profile}</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg bg-[#111715]/95 hover:bg-[#17201D] border border-white/10 hover:border-emerald-500/40 text-zinc-200 text-xs sm:text-sm font-medium transition-colors min-h-[46px] min-w-0"
            >
              <Settings className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="truncate">{t.settings}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Single flat control hint line (Desktop vs Touch) */}
      <div className="relative z-10 px-4 sm:px-10 pb-3 sm:pb-5 shrink-0 pointer-events-none">
        <p className="text-[11px] sm:text-xs text-zinc-400 font-mono-num hidden sm:block">
          {t.hintDesktop}
        </p>
        <p className="text-[11px] text-zinc-400 font-mono-num sm:hidden leading-snug">
          {t.hintTouch}
        </p>
      </div>
    </div>
  );
};

