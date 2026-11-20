import React from 'react';
import { Languages, Volume2, VolumeX, X } from 'lucide-react';
import {
  CUE_STYLES,
  ENVIRONMENTS,
  TABLE_CLOTHS,
  TABLE_SURFACE_STYLES,
} from '../game/constants.ts';
import type {
  CueStyleId,
  EnvironmentId,
  GameSettings,
  GraphicsQuality,
  TableClothId,
  TableSurfaceStyleId,
} from '../game/types.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import { LanguageDropdown } from './LanguageDropdown.tsx';

interface SettingsModalProps {
  settings: GameSettings;
  selectedCue: CueStyleId;
  selectedTable: TableClothId;
  selectedEnvironment: EnvironmentId;
  onUpdateSettings: (next: GameSettings) => void;
  onChangeCue: (cue: CueStyleId) => void;
  onChangeTable: (cloth: TableClothId) => void;
  onChangeEnvironment: (env: EnvironmentId) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  selectedCue,
  selectedTable,
  selectedEnvironment,
  onUpdateSettings,
  onChangeCue,
  onChangeTable,
  onChangeEnvironment,
  onClose,
}) => {
  const { t } = useI18n();

  const updateField = <K extends keyof GameSettings>(key: K, val: GameSettings[K]) => {
    onUpdateSettings({ ...settings, [key]: val });
  };

  const qualityLabels: Record<GraphicsQuality, string> = {
    auto: t.qualityAuto,
    low: t.qualityLow,
    medium: t.qualityMedium,
    high: t.qualityHigh,
    ultra: t.qualityUltra,
  };

  const assistLabels: Record<'full' | 'short' | 'off', string> = {
    full: t.assistFull,
    short: t.assistShort,
    off: t.assistOff,
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-black/75">
      <div className="w-full max-w-2xl rounded-xl bg-[#0E1311] border border-white/15 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/10">
          <h2 className="font-display text-lg sm:text-xl font-bold text-white">
            {t.settingsTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 overflow-y-auto custom-scroll flex-1">
          {/* Language Selector Dropdown */}
          <section className="space-y-2.5">
            <label
              htmlFor="settings-language-select"
              className="flex items-center gap-2 text-sm font-semibold text-white"
            >
              <Languages className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{t.languageLabel}</span>
            </label>
            <div className="p-3.5 sm:p-4 rounded-lg bg-[#141A17] border border-white/10 space-y-2.5">
              <p className="text-xs text-zinc-400">{t.languageDesc}</p>
              <LanguageDropdown
                id="settings-language-select"
                value={settings.language}
                onChangeLanguage={(nextLang) => updateField('language', nextLang)}
              />
            </div>
          </section>

          {/* Audio Controls */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{t.audio}</h3>
              <button
                type="button"
                onClick={() => updateField('muted', !settings.muted)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border min-h-[36px] ${
                  settings.muted
                    ? 'bg-red-950/50 border-red-500/40 text-red-300'
                    : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                }`}
              >
                {settings.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                {settings.muted ? t.muted : t.audioActive}
              </button>
            </div>

            <div className="p-3.5 sm:p-4 rounded-lg bg-[#141A17] border border-white/10 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(
                  [
                    ['masterVolume', t.masterVolume],
                    ['sfxVolume', t.sfxVolume],
                    ['ambientVolume', t.ambientVolume],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs text-zinc-300 mb-1.5">
                      <span>{label}</span>
                      <span className="font-mono-num text-emerald-400">
                        {Math.round(settings[key] * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings[key]}
                      onChange={(e) => updateField(key, Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                ))}
              </div>

              {/* Room Ambiance Mix Slider (Music vs Crowd Chatter & Venue Acoustics) */}
              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-200 mb-1">
                  <label htmlFor="settings-room-ambiance" className="font-medium">
                    {t.roomAmbiance}
                  </label>
                  <span className="font-mono-num text-emerald-400">
                    {Math.round((1 - settings.roomAmbiance) * 100)}% {t.mixMusicLabel} /{' '}
                    {Math.round(settings.roomAmbiance * 100)}% {t.mixAtmosphereLabel}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mb-2">{t.roomAmbianceDesc}</p>
                <input
                  id="settings-room-ambiance"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.roomAmbiance}
                  onChange={(e) => updateField('roomAmbiance', Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                  <span>{t.mixMusicLabel}</span>
                  <span>{t.mixBalancedLabel}</span>
                  <span>{t.mixAtmosphereLabel}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Graphics Quality & Aiming */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-white">{t.graphicsGameplay}</h3>
            <div className="p-3.5 sm:p-4 rounded-lg bg-[#141A17] border border-white/10 space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-2">{t.graphicsQuality}</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {(['auto', 'low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => updateField('graphicsQuality', q)}
                      className={`py-2 rounded-lg border text-xs font-semibold capitalize min-h-[40px] ${
                        settings.graphicsQuality === q
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                          : 'bg-[#0E1311] border-white/10 text-zinc-300'
                      }`}
                    >
                      {qualityLabels[q]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-2">{t.aimTrajectoryGuide}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['full', 'short', 'off'] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => updateField('aimAssist', a)}
                        className={`py-2 rounded-lg border text-xs font-semibold capitalize min-h-[40px] ${
                          settings.aimAssist === a
                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                            : 'bg-[#0E1311] border-white/10 text-zinc-300'
                        }`}
                      >
                        {assistLabels[a]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-2">
                    <span>{t.aimSensitivity}</span>
                    <span className="font-mono-num text-emerald-400">
                      {settings.cameraSensitivity.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={2.0}
                    step={0.1}
                    value={settings.cameraSensitivity}
                    onChange={(e) => updateField('cameraSensitivity', Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/10">
                <div>
                  <div className="text-xs font-semibold text-white">{t.ghostBallGuide}</div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{t.ghostBallGuideDesc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.ghostBallGuide}
                  onClick={() => updateField('ghostBallGuide', !settings.ghostBallGuide)}
                  className={`flex items-center gap-2.5 px-3.5 py-2 rounded-lg border text-xs font-semibold shrink-0 min-h-[40px] transition-colors ${
                    settings.ghostBallGuide
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                      : 'bg-[#0E1311] border-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span
                    className={`w-7 h-4 rounded-full relative transition-colors ${
                      settings.ghostBallGuide ? 'bg-emerald-500' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                        settings.ghostBallGuide ? 'left-3.5' : 'left-0.5'
                      }`}
                    />
                  </span>
                  <span>{settings.ghostBallGuide ? t.on : t.off}</span>
                </button>
              </div>
            </div>
          </section>

          {/* Cue Stick, Cloth & Environment */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-white">{t.equipmentVenue}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">{t.cueStick}</label>
                <div className="space-y-1.5">
                  {(Object.keys(CUE_STYLES) as CueStyleId[]).map((cid) => (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => onChangeCue(cid)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left text-xs min-h-[42px] ${
                        selectedCue === cid
                          ? 'bg-emerald-600/20 border-emerald-500 text-white'
                          : 'bg-[#141A17] border-white/10 text-zinc-300'
                      }`}
                    >
                      <span className="font-semibold">{CUE_STYLES[cid].name}</span>
                      <span className="text-zinc-400">{CUE_STYLES[cid].controlLabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">{t.tableCloth}</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(TABLE_CLOTHS) as TableClothId[]).map((tid) => (
                      <button
                        key={tid}
                        type="button"
                        onClick={() => onChangeTable(tid)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium min-h-[42px] ${
                          selectedTable === tid
                            ? 'bg-emerald-600/20 border-emerald-500 text-white'
                            : 'bg-[#141A17] border-white/10 text-zinc-300'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-sm border border-white/20 shrink-0"
                          style={{ backgroundColor: TABLE_CLOTHS[tid].clothColor }}
                        />
                        <span className="truncate">{TABLE_CLOTHS[tid].name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">{t.roomEnvironment}</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {(Object.keys(ENVIRONMENTS) as EnvironmentId[]).map((eid) => (
                      <button
                        key={eid}
                        type="button"
                        onClick={() => onChangeEnvironment(eid)}
                        className={`px-3 py-2 rounded-lg border text-left text-xs font-medium min-h-[40px] ${
                          selectedEnvironment === eid
                            ? 'bg-emerald-600/20 border-emerald-500 text-white'
                            : 'bg-[#141A17] border-white/10 text-zinc-300'
                        }`}
                      >
                        {ENVIRONMENTS[eid].name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Playing Surface Physics Style */}
            <div className="p-3.5 sm:p-4 rounded-lg bg-[#141A17] border border-white/10 space-y-2.5">
              <div>
                <div className="text-xs font-semibold text-white">{t.surfaceStyleLabel}</div>
                <p className="text-[11px] text-zinc-400 mt-0.5">{t.surfaceStyleDesc}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(Object.keys(TABLE_SURFACE_STYLES) as TableSurfaceStyleId[]).map((sid) => {
                  const cfg = TABLE_SURFACE_STYLES[sid];
                  const label =
                    sid === 'tournament'
                      ? t.surfaceTournament
                      : sid === 'club'
                        ? t.surfaceClub
                        : t.surfaceVintage;
                  const desc =
                    sid === 'tournament'
                      ? t.surfaceTournamentDesc
                      : sid === 'club'
                        ? t.surfaceClubDesc
                        : t.surfaceVintageDesc;
                  const active = settings.surfaceStyle === sid;
                  return (
                    <button
                      key={sid}
                      type="button"
                      onClick={() => updateField('surfaceStyle', sid)}
                      className={`flex flex-col justify-between p-2.5 rounded-lg border text-left transition-colors min-h-[74px] ${
                        active
                          ? 'bg-emerald-600/20 border-emerald-500 text-white'
                          : 'bg-[#0E1311] border-white/10 text-zinc-300 hover:border-white/25'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold leading-tight">{label}</div>
                        <div className="text-[10px] text-zinc-400 mt-1 leading-snug">{desc}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-[10px] font-mono-num text-emerald-300/90">
                        <span>
                          {t.clothFrictionShort} {cfg.clothFrictionMultiplier.toFixed(2)}x
                        </span>
                        <span className="text-zinc-600">·</span>
                        <span>
                          {t.cushionBounceShort} {cfg.cushionElasticityMultiplier.toFixed(2)}x
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-white/10 flex justify-end bg-[#0A0E0C]">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold min-h-[44px]"
          >
            {t.done}
          </button>
        </div>
      </div>
    </div>
  );
};

