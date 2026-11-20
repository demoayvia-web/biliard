import React, { useEffect, useState } from 'react';
import { Copy, Globe, RefreshCw, Trophy, UserPlus, Users, X } from 'lucide-react';
import type {
  OnlinePlayerSummary,
  RankingEntry,
  RoomInfo,
  SaveData,
} from '../game/types.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import {
  multiplayerClient,
  type OnlineInvitePayload,
} from '../multiplayer/socketClient.ts';

interface OnlineLobbyModalProps {
  saveData: SaveData;
  connected: boolean;
  players: OnlinePlayerSummary[];
  publicRooms: RoomInfo[];
  activeRoom: RoomInfo | null;
  isQueuing: boolean;
  pendingInvite: OnlineInvitePayload | null;
  errorMsg: string | null;
  onConnect: () => void;
  onAcceptInvite: (roomCode: string) => void;
  onDismissInvite: () => void;
  onClose: () => void;
}

export const OnlineLobbyModal: React.FC<OnlineLobbyModalProps> = ({
  saveData,
  connected,
  players,
  publicRooms,
  activeRoom,
  isQueuing,
  pendingInvite,
  errorMsg,
  onConnect,
  onAcceptInvite,
  onDismissInvite,
  onClose,
}) => {
  const { t, formatMessage } = useI18n();
  const [tab, setTab] = useState<'play' | 'players' | 'rankings'>('play');
  const [gameMode, setGameMode] = useState<'8-ball' | '9-ball'>('8-ball');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);

  useEffect(() => {
    onConnect();
    fetch('/api/rankings')
      .then((r) => (r.ok ? r.json() : { rankings: [] }))
      .then((d) => setRankings(d.rankings ?? []))
      .catch(() => {});
  }, []);

  const handleCopyCode = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-black/75">
      <div className="w-full max-w-2xl rounded-xl bg-[#0E1311] border border-white/15 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <Globe className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-bold text-white leading-tight truncate">
                {t.onlineTitle}
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                {connected
                  ? formatMessage(t.authoritativePhysics, { name: saveData.nickname })
                  : t.connectingOfflineHint}
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

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 sm:px-6 pt-2.5 sm:pt-3 border-b border-white/10 overflow-x-auto">
          {(
            [
              ['play', t.tabRooms],
              ['players', `${t.tabPlayers} (${players.length})`],
              ['rankings', t.tabRankings],
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
          {errorMsg && (
            <div className="px-4 py-3 rounded-lg bg-red-950/60 border border-red-500/40 text-sm text-red-200">
              {errorMsg}
            </div>
          )}

          {pendingInvite && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40">
              <div className="text-sm text-emerald-100">
                {formatMessage(t.invitedToRoom, { name: pendingInvite.fromNickname })}{' '}
                <span className="font-mono-num font-bold">{pendingInvite.roomCode}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onAcceptInvite(pendingInvite.roomCode)}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                >
                  {t.acceptBtn}
                </button>
                <button
                  type="button"
                  onClick={onDismissInvite}
                  className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-200"
                >
                  {t.dismissBtn}
                </button>
              </div>
            </div>
          )}

          {!connected && (
            <div className="p-5 rounded-lg bg-[#141A17] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">
                  {t.onlineServerUnavailable}
                </h3>
                <p className="text-xs text-zinc-400">
                  {t.onlineServerDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={onConnect}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t.retryBtn}
              </button>
            </div>
          )}

          {tab === 'play' && (
            <>
              {/* Ruleset Switch */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2">
                  {t.selectRuleset}
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['8-ball', '9-ball'] as const).map((rm) => (
                    <button
                      key={rm}
                      type="button"
                      onClick={() => setGameMode(rm)}
                      className={`px-4 py-2.5 rounded-lg border text-sm font-semibold min-h-[44px] ${
                        gameMode === rm
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                          : 'bg-[#141A17] border-white/10 text-zinc-300'
                      }`}
                    >
                      {rm === '8-ball' ? t.eightBallPool : t.nineBallPool}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Waiting Room Banner */}
              {activeRoom && activeRoom.status === 'waiting' && (
                <div className="p-4 rounded-lg bg-emerald-950/40 border border-emerald-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-emerald-400">
                      {t.roomOpenWaiting}
                    </div>
                    <div className="text-lg font-mono-num font-bold text-white tracking-wider mt-0.5">
                      {t.codeLabel}: {activeRoom.code}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyCode(activeRoom.code)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white min-h-[40px]"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copied ? t.copiedBtn : t.copyCodeBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => multiplayerClient.leaveRoom()}
                      className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-200 min-h-[40px]"
                    >
                      {t.cancel}
                    </button>
                  </div>
                </div>
              )}

              {/* Public Matchmaking & Private Room Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-lg bg-[#141A17] border border-white/10 flex flex-col justify-between gap-3">
                  <div>
                    <h3 className="font-display font-bold text-base text-white">
                      {t.publicMatchmaking}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      {formatMessage(t.publicMatchmakingDesc, { mode: gameMode.toUpperCase() })}
                    </p>
                  </div>
                  {isQueuing ? (
                    <button
                      type="button"
                      onClick={() => multiplayerClient.leaveQueue()}
                      className="w-full py-2.5 rounded-lg bg-amber-600/20 border border-amber-500/50 text-amber-300 text-sm font-semibold min-h-[44px]"
                    >
                      {t.searchingCancelQueue}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!connected}
                      onClick={() => multiplayerClient.joinQueue(gameMode)}
                      className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold min-h-[44px]"
                    >
                      {t.findMatch}
                    </button>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-[#141A17] border border-white/10 flex flex-col justify-between gap-3">
                  <div>
                    <h3 className="font-display font-bold text-base text-white">
                      {t.privateRoom}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      {t.privateRoomDesc}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!connected}
                      onClick={() => multiplayerClient.createRoom(gameMode, true)}
                      className="flex-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white text-xs font-semibold min-h-[44px]"
                    >
                      {t.createPrivate}
                    </button>
                    <button
                      type="button"
                      disabled={!connected}
                      onClick={() => multiplayerClient.createRoom(gameMode, false)}
                      className="flex-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white text-xs font-semibold min-h-[44px]"
                    >
                      {t.createPublic}
                    </button>
                  </div>
                </div>
              </div>

              {/* Join by Room Code */}
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={8}
                  placeholder={t.enterRoomCodePlaceholder}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-[#141A17] border border-white/15 text-sm font-mono-num text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  disabled={!connected || joinCode.trim().length < 4}
                  onClick={() => multiplayerClient.joinRoom(joinCode.trim())}
                  className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold min-h-[44px]"
                >
                  {t.joinRoom}
                </button>
              </div>

              {/* Open Public Rooms */}
              <div>
                <h4 className="text-xs font-semibold text-zinc-400 mb-2">
                  {formatMessage(t.openPublicTables, { count: publicRooms.length })}
                </h4>
                {publicRooms.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-3">
                    {t.noOpenTables}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {publicRooms.map((r) => (
                      <div
                        key={r.roomId}
                        className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-[#141A17] border border-white/10"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {formatMessage(t.playersTable, { name: r.hostName })}
                          </div>
                          <div className="text-xs text-zinc-400 font-mono-num">
                            {r.gameMode.toUpperCase()} · {t.codeLabel} {r.code} · {r.status}
                          </div>
                        </div>
                        {r.status === 'waiting' && (
                          <button
                            type="button"
                            onClick={() => multiplayerClient.joinRoom(r.code)}
                            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                          >
                            {t.joinBtn}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'players' && (
            <div className="space-y-2">
              {players.length === 0 ? (
                <div className="text-center py-8 text-sm text-zinc-500">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  {t.noPlayersConnected}
                </div>
              ) : (
                players.map((pl) => (
                  <div
                    key={pl.playerId}
                    className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#141A17] border border-white/10"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {pl.nickname}{' '}
                        {pl.playerId === saveData.playerId && (
                          <span className="text-xs text-emerald-400 font-normal">({t.youTag})</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 font-mono-num">
                        ELO {pl.elo} ·{' '}
                        {pl.status === 'in_match'
                          ? t.inMatch
                          : pl.status === 'queuing'
                            ? t.inQueue
                            : t.inLobby}
                      </div>
                    </div>
                    {pl.playerId !== saveData.playerId && activeRoom && activeRoom.status === 'waiting' && (
                      <button
                        type="button"
                        onClick={() => multiplayerClient.sendInvite(pl.playerId, activeRoom.code)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {t.inviteBtn}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'rankings' && (
            <div className="space-y-2">
              {rankings.length === 0 ? (
                <div className="text-center py-8 text-sm text-zinc-500">
                  <Trophy className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  {t.noRankingsYet}
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-zinc-400">
                      <th className="py-2 font-medium">#</th>
                      <th className="py-2 font-medium">{t.playerCol}</th>
                      <th className="py-2 font-medium text-right">ELO</th>
                      <th className="py-2 font-medium text-right">{t.wlCol}</th>
                      <th className="py-2 font-medium text-right">{t.winPctCol}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rankings.map((r, i) => (
                      <tr key={`${r.nickname}-${i}`}>
                        <td className="py-2.5 font-mono-num text-zinc-400">{i + 1}</td>
                        <td className="py-2.5 font-semibold text-white">{r.nickname}</td>
                        <td className="py-2.5 font-mono-num text-right text-emerald-400 font-semibold">
                          {r.elo}
                        </td>
                        <td className="py-2.5 font-mono-num text-right text-zinc-300">
                          {r.wins} / {r.losses}
                        </td>
                        <td className="py-2.5 font-mono-num text-right text-zinc-300">
                          {r.winRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
