import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  AI_DIFFICULTIES,
  ENVIRONMENTS,
  TABLE_CLOTHS,
  TABLE_SURFACE_STYLES,
} from '../game/constants.ts';
import type { PracticeDrillId } from '../game/rules.ts';
import { BUILTIN_TRICK_SHOTS } from '../game/rules.ts';
import type {
  AIDifficulty,
  EnvironmentId,
  GameMode,
  PlayMode,
  TableClothId,
  TableSurfaceStyleId,
  TrickShotLayout,
} from '../game/types.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

interface GameSetupModalProps {
  mode: 'ai' | 'local' | 'practice' | 'trick_shot';
  defaultNickname: string;
  selectedEnvironment: EnvironmentId;
  selectedTable: TableClothId;
  selectedSurfaceStyle: TableSurfaceStyleId;
  savedTrickShotLayouts?: TrickShotLayout[];
  onChangeEnvironment: (env: EnvironmentId) => void;
  onChangeTable: (cloth: TableClothId) => void;
  onChangeSurfaceStyle: (style: TableSurfaceStyleId) => void;
  onStart: (config: {
    gameMode: GameMode;
    playMode: PlayMode;
    player1Name: string;
    player2Name: string;
    aiDifficulty?: AIDifficulty;
    practiceDrill?: PracticeDrillId;
    trickShotLayout?: TrickShotLayout;
  }) => void;
  onClose: () => void;
}

export const GameSetupModal: React.FC<GameSetupModalProps> = ({
  mode,
  defaultNickname,
  selectedEnvironment,
  selectedTable,
  selectedSurfaceStyle,
  savedTrickShotLayouts = [],
  onChangeEnvironment,
  onChangeTable,
  onChangeSurfaceStyle,
  onStart,
  onClose,
}) => {
  const { t } = useI18n();
  const [gameMode, setGameMode] = useState<'8-ball' | '9-ball'>('8-ball');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('medium');
  const [p1Name, setP1Name] = useState(defaultNickname);
  const [p2Name, setP2Name] = useState(() => t.player2Default);
  const [practiceDrill, setPracticeDrill] = useState<PracticeDrillId>('full_rack');
  const allTrickShots = [...savedTrickShotLayouts, ...BUILTIN_TRICK_SHOTS];
  const [selectedTrickShotId, setSelectedTrickShotId] = useState<string>(
    allTrickShots[0]?.id ?? BUILTIN_TRICK_SHOTS[0].id,
  );

  const title =
    mode === 'ai'
      ? t.setupAiTitle
      : mode === 'local'
        ? t.setupLocalTitle
        : mode === 'trick_shot'
          ? t.setupTrickShotTitle
          : t.setupPracticeTitle;

  const diffLabels: Record<AIDifficulty, string> = {
    beginner: t.diffBeginner,
    easy: t.diffEasy,
    medium: t.diffMedium,
    hard: t.diffHard,
    professional: t.diffProfessional,
  };

  const handleLaunch = () => {
    if (mode === 'trick_shot') {
      const chosen =
        allTrickShots.find((l) => l.id === selectedTrickShotId) ?? BUILTIN_TRICK_SHOTS[0];
      onStart({
        gameMode: 'trick_shot',
        playMode: 'trick_shot',
        player1Name: p1Name.trim() || defaultNickname,
        player2Name: t.trickShot,
        trickShotLayout: chosen,
      });
    } else if (mode === 'practice') {
      onStart({
        gameMode: 'practice',
        playMode: 'practice',
        player1Name: p1Name.trim() || defaultNickname,
        player2Name: t.practice,
        practiceDrill,
      });
    } else if (mode === 'ai') {
      onStart({
        gameMode,
        playMode: 'ai',
        player1Name: p1Name.trim() || defaultNickname,
        player2Name: `${AI_DIFFICULTIES[aiDifficulty].label} AI`,
        aiDifficulty,
      });
    } else {
      onStart({
        gameMode,
        playMode: 'local',
        player1Name: p1Name.trim() || t.player1Default,
        player2Name: p2Name.trim() || t.player2Default,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-black/75">
      <div className="w-full max-w-lg rounded-xl bg-[#0E1311] border border-white/15 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/10">
          <h2 className="font-display text-lg sm:text-xl font-bold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto custom-scroll">
          {mode === 'trick_shot' ? (
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2">
                {t.startingLayout} ({allTrickShots.length} {t.availableCount})
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scroll pr-1">
                {allTrickShots.map((layout) => (
                  <button
                    key={layout.id}
                    type="button"
                    onClick={() => setSelectedTrickShotId(layout.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border text-left transition-colors min-h-[44px] ${
                      selectedTrickShotId === layout.id
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200'
                        : 'bg-[#141A17] border-white/10 text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{layout.name}</div>
                      {layout.description && (
                        <div className="text-[11px] text-zinc-400 truncate">
                          {layout.description}
                        </div>
                      )}
                    </div>
                    <span className="font-mono-num text-[11px] text-zinc-400 shrink-0">
                      {layout.isBuiltIn ? t.presetLabel : t.savedLabel} · {layout.balls.length}{' '}
                      {t.ballsLabel}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : mode !== 'practice' ? (
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2">
                {t.ruleset}
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {(['8-ball', '9-ball'] as const).map((rm) => (
                  <button
                    key={rm}
                    type="button"
                    onClick={() => setGameMode(rm)}
                    className={`px-4 py-3 rounded-lg border text-sm font-semibold transition-colors min-h-[44px] ${
                      gameMode === rm
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                        : 'bg-[#141A17] border-white/10 text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    {rm === '8-ball' ? t.eightBallPool : t.nineBallPool}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2">
                {t.practiceRackSetup}
              </label>
              <div className="grid grid-cols-2 gap-2.5">
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
                    onClick={() => setPracticeDrill(id)}
                    className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors min-h-[44px] ${
                      practiceDrill === id
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                        : 'bg-[#141A17] border-white/10 text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'ai' && (
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2">
                {t.aiDifficulty}
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {(Object.keys(AI_DIFFICULTIES) as AIDifficulty[]).map((diff) => (
                  <button
                    key={diff}
                    type="button"
                    onClick={() => setAiDifficulty(diff)}
                    className={`px-2 py-2.5 rounded-lg border text-xs font-semibold transition-colors min-h-[42px] ${
                      aiDifficulty === diff
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                        : 'bg-[#141A17] border-white/10 text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    {diffLabels[diff]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'local' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                  {t.player1Name}
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={p1Name}
                  onChange={(e) => setP1Name(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#141A17] border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                  {t.player2Name}
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={p2Name}
                  onChange={(e) => setP2Name(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#141A17] border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Arena & Cloth Quick Pick */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                {t.roomEnvironment}
              </label>
              <select
                value={selectedEnvironment}
                onChange={(e) => onChangeEnvironment(e.target.value as EnvironmentId)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#141A17] border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {(Object.keys(ENVIRONMENTS) as EnvironmentId[]).map((id) => (
                  <option key={id} value={id}>
                    {ENVIRONMENTS[id].name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                {t.tableCloth}
              </label>
              <select
                value={selectedTable}
                onChange={(e) => onChangeTable(e.target.value as TableClothId)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#141A17] border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {(Object.keys(TABLE_CLOTHS) as TableClothId[]).map((id) => (
                  <option key={id} value={id}>
                    {TABLE_CLOTHS[id].name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Playing Surface Physics */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
              {t.surfaceStyleLabel}
            </label>
            <div className="grid grid-cols-3 gap-2">
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
                    onClick={() => onChangeSurfaceStyle(sid)}
                    className={`p-2.5 rounded-lg border text-left transition-colors min-h-[54px] ${
                      selectedSurfaceStyle === sid
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                        : 'bg-[#141A17] border-white/10 text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    <div className="text-xs font-semibold leading-tight">{label}</div>
                    <div className="text-[10px] font-mono-num text-zinc-400 mt-1">
                      {cfg.clothFrictionMultiplier.toFixed(2)}x · {cfg.cushionElasticityMultiplier.toFixed(2)}x
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0E0C]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg bg-[#141A17] hover:bg-white/10 text-zinc-300 text-sm font-semibold min-h-[44px]"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={handleLaunch}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold min-h-[44px]"
          >
            {mode === 'trick_shot' ? t.openSandbox : t.startMatch}
          </button>
        </div>
      </div>
    </div>
  );
};

