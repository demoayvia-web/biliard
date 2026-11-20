import React, { useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Copy,
  Download,
  Play,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { BUILTIN_TRICK_SHOTS } from '../game/rules.ts';
import type { BallState, ShotParams, TrickShotLayout } from '../game/types.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import { exportTrickShotJson, importTrickShotJson } from '../storage/saveManager.ts';

interface TrickShotModalProps {
  currentBalls: BallState[];
  currentShot: ShotParams;
  savedLayouts: TrickShotLayout[];
  onSaveLayout: (name: string, description?: string) => void;
  onLoadLayout: (layout: TrickShotLayout) => void;
  onDeleteLayout: (layoutId: string) => void;
  onImportLayout: (layout: TrickShotLayout) => void;
  onClose: () => void;
}

export const TrickShotModal: React.FC<TrickShotModalProps> = ({
  currentBalls,
  currentShot,
  savedLayouts,
  onSaveLayout,
  onLoadLayout,
  onDeleteLayout,
  onImportLayout,
  onClose,
}) => {
  const { t, formatMessage } = useI18n();
  const [layoutName, setLayoutName] = useState('');
  const [layoutNote, setLayoutNote] = useState('');
  const [importText, setImportText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shareFallbackJson, setShareFallbackJson] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<{
    type: 'ok' | 'err';
    msg: string;
  } | null>(null);

  const activeBallCount = currentBalls.filter((b) => !b.pocketed).length;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = layoutName.trim();
    if (!trimmed) {
      setStatusNotice({ type: 'err', msg: t.enterLayoutNameErr });
      return;
    }
    onSaveLayout(trimmed, layoutNote.trim() || undefined);
    setLayoutName('');
    setLayoutNote('');
    setStatusNotice({ type: 'ok', msg: formatMessage(t.savedLayoutMsg, { name: trimmed }) });
  };

  const handleCopyLayout = async (layout: TrickShotLayout) => {
    const code = exportTrickShotJson(layout);
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(layout.id);
      setShareFallbackJson(null);
      setStatusNotice({
        type: 'ok',
        msg: formatMessage(t.copiedShareCodeMsg, { name: layout.name }),
      });
      window.setTimeout(() => setCopiedId((prev) => (prev === layout.id ? null : prev)), 2200);
    } catch {
      setShareFallbackJson(code);
      setStatusNotice({
        type: 'ok',
        msg: t.clipboardUnavailableMsg,
      });
    }
  };

  const handleCopyCurrentSetup = () => {
    const tempLayout: TrickShotLayout = {
      id: 'current_setup',
      name: layoutName.trim() || t.trickShot,
      description: layoutNote.trim() || undefined,
      balls: currentBalls
        .filter((b) => !b.pocketed)
        .map((b) => ({
          id: b.id,
          x: Number(b.x.toFixed(4)),
          z: Number(b.z.toFixed(4)),
        })),
      suggestedShot: { ...currentShot },
      createdAt: new Date().toISOString(),
    };
    handleCopyLayout(tempLayout);
  };

  const handleImport = () => {
    const res = importTrickShotJson(importText);
    if (!res.ok) {
      setStatusNotice({ type: 'err', msg: res.error });
      return;
    }
    onImportLayout(res.layout);
    setImportText('');
    setStatusNotice({
      type: 'ok',
      msg: formatMessage(t.importedLayoutMsg, { name: res.layout.name }),
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-black/75">
      <div className="w-full max-w-2xl rounded-xl bg-[#0E1311] border border-white/15 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate">
                {t.trickShotTitle}
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                {t.trickShotSub}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto custom-scroll">
          {statusNotice && (
            <div
              className={`px-3.5 py-2.5 rounded-lg text-xs font-medium border ${
                statusNotice.type === 'ok'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                  : 'bg-red-950/50 border-red-500/40 text-red-200'
              }`}
            >
              {statusNotice.msg}
            </div>
          )}

          {/* Save Current Layout */}
          <form
            onSubmit={handleSave}
            className="p-4 rounded-xl bg-[#141A17] border border-white/10 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-zinc-300">
                {t.saveCurrentSetup}
              </div>
              <span className="font-mono-num text-xs text-emerald-400">
                {formatMessage(t.ballsOnTable, { count: activeBallCount })}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                maxLength={40}
                value={layoutName}
                onChange={(e) => setLayoutName(e.target.value)}
                placeholder={t.layoutNamePlaceholder}
                className="px-3.5 py-2.5 rounded-lg bg-[#0B0F0E] border border-white/15 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                maxLength={120}
                value={layoutNote}
                onChange={(e) => setLayoutNote(e.target.value)}
                placeholder={t.layoutNotePlaceholder}
                className="px-3.5 py-2.5 rounded-lg bg-[#0B0F0E] border border-white/15 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold min-h-[40px]"
              >
                <BookmarkPlus className="w-4 h-4" />
                {t.saveLayoutBtn}
              </button>
              <button
                type="button"
                onClick={handleCopyCurrentSetup}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 text-xs font-semibold min-h-[40px]"
              >
                {copiedId === 'current_setup' ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Share2 className="w-4 h-4 text-emerald-400" />
                )}
                {t.copyCurrentShareCode}
              </button>
            </div>
          </form>

          {shareFallbackJson && (
            <div className="p-3 rounded-lg bg-[#141A17] border border-emerald-500/35 space-y-1.5">
              <div className="text-xs font-semibold text-emerald-300">
                {t.shareableLayoutCode}
              </div>
              <textarea
                readOnly
                rows={2}
                value={shareFallbackJson}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full px-3 py-2 rounded bg-[#0B0F0E] border border-white/10 text-[11px] font-mono-num text-zinc-200"
              />
            </div>
          )}

          {/* Saved Custom Layouts */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-400">
                {formatMessage(t.yourSavedLayouts, { count: savedLayouts.length })}
              </h3>
            </div>

            {savedLayouts.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#141A17]/60 border border-white/10 text-xs text-zinc-400 text-center">
                {t.noSavedLayouts}
              </div>
            ) : (
              <div className="space-y-2">
                {savedLayouts.map((layout) => (
                  <div
                    key={layout.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#141A17] border border-white/10"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate">
                          {layout.name}
                        </span>
                        <span className="font-mono-num text-[11px] text-emerald-400 shrink-0">
                          {layout.balls.length} {t.ballsLabel}
                        </span>
                      </div>
                      {layout.description && (
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          {layout.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onLoadLayout(layout);
                          onClose();
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold min-h-[36px]"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        {t.loadBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyLayout(layout)}
                        className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 text-xs font-medium min-h-[36px]"
                        title={t.copyCurrentShareCode}
                      >
                        {copiedId === layout.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">{t.shareBtn}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteLayout(layout.id);
                          setStatusNotice({
                            type: 'ok',
                            msg: formatMessage(t.deletedLayoutMsg, { name: layout.name }),
                          });
                        }}
                        aria-label={layout.name}
                        className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-300 min-h-[36px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Built-In Starter Trick Shots */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-zinc-400">
              {t.starterPresets}
            </h3>
            <div className="space-y-2">
              {BUILTIN_TRICK_SHOTS.map((preset) => (
                <div
                  key={preset.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#141A17] border border-white/10"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white truncate">
                        {preset.name}
                      </span>
                      <span className="font-mono-num text-[11px] text-zinc-400 shrink-0">
                        {preset.balls.length} {t.ballsLabel}
                      </span>
                    </div>
                    {preset.description && (
                      <p className="text-xs text-zinc-400 truncate mt-0.5">
                        {preset.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onLoadLayout(preset);
                        onClose();
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1D2722] hover:bg-emerald-600 border border-emerald-500/35 text-emerald-200 hover:text-white text-xs font-semibold min-h-[36px]"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      {t.loadBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyLayout(preset)}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-300 min-h-[36px]"
                      title={t.copyCurrentShareCode}
                    >
                      {copiedId === preset.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Import Shared Layout JSON */}
          <div className="p-4 rounded-xl bg-[#141A17] border border-white/10 space-y-2.5">
            <div className="text-xs font-semibold text-zinc-300">
              {t.importSharedCode}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={t.pasteTrickShotPlaceholder}
                className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#0B0F0E] border border-white/15 text-xs font-mono-num text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleImport}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-white/10 hover:bg-emerald-600 text-white text-xs font-semibold min-h-[40px] shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                {t.importAndLoad}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
