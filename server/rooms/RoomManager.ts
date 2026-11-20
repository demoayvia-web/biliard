import crypto from 'crypto';
import type { Server, Socket } from 'socket.io';
import { BALL_REST_Y } from '../../src/game/constants.ts';
import { createInitialMatchState } from '../../src/game/rules.ts';
import type {
  GameMode,
  MatchState,
  OnlinePlayerSummary,
  PhysicsEvent,
  RoomInfo,
  ShotParams,
} from '../../src/game/types.ts';
import { dbService } from '../database/pgClient.ts';
import { ServerSimulation } from '../physics/ServerSimulation.ts';

interface ConnectedPlayer {
  socketId: string;
  playerId: string;
  nickname: string;
  elo: number;
  roomId: string | null;
  status: 'lobby' | 'in_match' | 'queuing';
}

interface ActiveRoom {
  roomId: string;
  code: string;
  gameMode: GameMode;
  isPrivate: boolean;
  createdAt: number;
  player1Id: string;
  player1Name: string;
  player2Id: string | null;
  player2Name: string | null;
  status: 'waiting' | 'playing' | 'finished';
  matchState: MatchState | null;
  rematchVotes: Set<string>;
}

function makeRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export class RoomManager {
  private io: Server;
  private playersBySocket: Map<string, ConnectedPlayer> = new Map();
  private playersById: Map<string, ConnectedPlayer> = new Map();
  private rooms: Map<string, ActiveRoom> = new Map();
  private roomsByCode: Map<string, ActiveRoom> = new Map();
  private queue8Ball: string[] = [];
  private queue9Ball: string[] = [];

  constructor(io: Server) {
    this.io = io;
    this.registerHandlers();
  }

  private broadcastLobbyPresence(): void {
    const list: OnlinePlayerSummary[] = Array.from(this.playersById.values()).map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      status: p.status,
      elo: p.elo,
    }));
    this.io.emit('lobby:players', list);
    this.io.emit('lobby:rooms', this.getPublicRooms());
  }

  public getPublicRooms(): RoomInfo[] {
    return Array.from(this.rooms.values())
      .filter((r) => !r.isPrivate && r.status !== 'finished')
      .map((r) => this.toRoomInfo(r));
  }

  private toRoomInfo(r: ActiveRoom): RoomInfo {
    return {
      roomId: r.roomId,
      code: r.code,
      gameMode: r.gameMode,
      hostName: r.player1Name,
      guestName: r.player2Name,
      status: r.status,
      isPrivate: r.isPrivate,
      createdAt: r.createdAt,
    };
  }

  private registerHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      socket.on(
        'auth:hello',
        async (payload: { playerId: string; nickname: string; roomCode?: string }) => {
          const playerId = payload.playerId || crypto.randomUUID();
          const nickname = (payload.nickname || 'Cueist').trim().slice(0, 20);
          const elo = await dbService.upsertPlayer(playerId, nickname);

          const existing = this.playersById.get(playerId);
          const player: ConnectedPlayer = {
            socketId: socket.id,
            playerId,
            nickname,
            elo,
            roomId: existing?.roomId ?? null,
            status: existing?.roomId ? 'in_match' : 'lobby',
          };

          this.playersBySocket.set(socket.id, player);
          this.playersById.set(playerId, player);

          // Reconnect to active room if still running
          if (player.roomId) {
            const room = this.rooms.get(player.roomId);
            if (room && room.status !== 'finished') {
              socket.join(room.roomId);
              const seatIndex = room.player1Id === playerId ? 0 : 1;
              socket.emit('room:reconnected', {
                room: this.toRoomInfo(room),
                seatIndex,
                matchState: room.matchState,
              });
            } else {
              player.roomId = null;
              player.status = 'lobby';
            }
          }

          socket.emit('auth:ack', { playerId, nickname, elo });
          this.broadcastLobbyPresence();
        },
      );

      socket.on(
        'queue:join',
        (payload: { gameMode: '8-ball' | '9-ball' }) => {
          const player = this.playersBySocket.get(socket.id);
          if (!player) return;
          this.leaveQueues(player.playerId);

          const mode = payload.gameMode === '9-ball' ? '9-ball' : '8-ball';
          const queue = mode === '9-ball' ? this.queue9Ball : this.queue8Ball;

          // Match with waiting opponent
          while (queue.length > 0) {
            const oppId = queue.shift()!;
            if (oppId === player.playerId) continue;
            const opp = this.playersById.get(oppId);
            if (!opp || opp.roomId) continue;

            const room = this.createRoomInternal(opp, mode, false);
            this.joinRoomInternal(room, player);
            return;
          }

          queue.push(player.playerId);
          player.status = 'queuing';
          socket.emit('queue:status', { queuing: true, gameMode: mode });
          this.broadcastLobbyPresence();
        },
      );

      socket.on('queue:leave', () => {
        const player = this.playersBySocket.get(socket.id);
        if (!player) return;
        this.leaveQueues(player.playerId);
        if (!player.roomId) player.status = 'lobby';
        socket.emit('queue:status', { queuing: false });
        this.broadcastLobbyPresence();
      });

      socket.on(
        'room:create',
        (payload: { gameMode: '8-ball' | '9-ball'; isPrivate: boolean }) => {
          const player = this.playersBySocket.get(socket.id);
          if (!player) return;
          this.leaveQueues(player.playerId);
          if (player.roomId) this.leaveRoomInternal(player);

          const mode = payload.gameMode === '9-ball' ? '9-ball' : '8-ball';
          const room = this.createRoomInternal(player, mode, Boolean(payload.isPrivate));
          socket.emit('room:created', {
            room: this.toRoomInfo(room),
            seatIndex: 0,
          });
          this.broadcastLobbyPresence();
        },
      );

      socket.on('room:join', (payload: { code: string }) => {
        const player = this.playersBySocket.get(socket.id);
        if (!player) return;
        const code = (payload.code || '').trim().toUpperCase();
        const room = this.roomsByCode.get(code);

        if (!room) {
          socket.emit('room:error', { message: `Room "${code}" not found.` });
          return;
        }
        if (room.player2Id && room.player2Id !== player.playerId && room.player1Id !== player.playerId) {
          socket.emit('room:error', { message: `Room "${code}" is already full.` });
          return;
        }

        this.leaveQueues(player.playerId);
        this.joinRoomInternal(room, player);
      });

      socket.on('room:leave', () => {
        const player = this.playersBySocket.get(socket.id);
        if (!player) return;
        this.leaveRoomInternal(player);
        this.broadcastLobbyPresence();
      });

      socket.on('invite:send', (payload: { targetPlayerId: string; roomCode: string }) => {
        const sender = this.playersBySocket.get(socket.id);
        const target = this.playersById.get(payload.targetPlayerId);
        if (!sender || !target) return;
        this.io.to(target.socketId).emit('invite:received', {
          fromPlayerId: sender.playerId,
          fromNickname: sender.nickname,
          roomCode: payload.roomCode,
        });
      });

      socket.on('ball_in_hand:move', (payload: { x: number; z: number }) => {
        const player = this.playersBySocket.get(socket.id);
        if (!player || !player.roomId) return;
        const room = this.rooms.get(player.roomId);
        if (!room || !room.matchState || room.status !== 'playing') return;

        const seatIndex = room.player1Id === player.playerId ? 0 : 1;
        if (room.matchState.turnIndex !== seatIndex || room.matchState.phase !== 'ball_in_hand') {
          return;
        }

        const check = ServerSimulation.validateBallPlacement(room.matchState, payload.x, payload.z);
        if (!check.valid) return;

        room.matchState = {
          ...room.matchState,
          balls: check.balls,
        };
        this.io.to(room.roomId).emit('ball_in_hand:updated', {
          x: payload.x,
          y: BALL_REST_Y,
          z: payload.z,
        });
      });

      socket.on('ball_in_hand:confirm', () => {
        const player = this.playersBySocket.get(socket.id);
        if (!player || !player.roomId) return;
        const room = this.rooms.get(player.roomId);
        if (!room || !room.matchState || room.status !== 'playing') return;
        const seatIndex = room.player1Id === player.playerId ? 0 : 1;
        if (room.matchState.turnIndex !== seatIndex || room.matchState.phase !== 'ball_in_hand') {
          return;
        }
        room.matchState = {
          ...room.matchState,
          phase: 'aiming',
          statusMessage: `${room.matchState.players[seatIndex].name} aiming`,
        };
        this.io.to(room.roomId).emit('match:state', room.matchState);
      });

      socket.on('aim:preview', (payload: { angle: number }) => {
        const player = this.playersBySocket.get(socket.id);
        if (!player || !player.roomId) return;
        socket.to(player.roomId).emit('aim:remote', { angle: payload.angle });
      });

      socket.on('shot:submit', async (shot: ShotParams) => {
        const player = this.playersBySocket.get(socket.id);
        if (!player || !player.roomId) return;
        const room = this.rooms.get(player.roomId);
        if (!room || !room.matchState || room.status !== 'playing') return;

        const seatIndex = room.player1Id === player.playerId ? 0 : 1;
        if (room.matchState.turnIndex !== seatIndex) {
          socket.emit('room:error', { message: 'Not your turn.' });
          return;
        }
        if (room.matchState.phase !== 'aiming' && room.matchState.phase !== 'ball_in_hand') {
          return;
        }

        // Execute authoritative physics & rule evaluation on the server!
        const { nextState, events } = ServerSimulation.executeAuthoritativeShot(room.matchState, shot);
        room.matchState = nextState;

        this.io.to(room.roomId).emit('shot:executed', {
          shooterIndex: seatIndex,
          shot,
          finalMatchState: nextState,
          events: events as PhysicsEvent[],
        });

        if (nextState.phase === 'game_over' && nextState.winnerIndex !== null) {
          room.status = 'finished';
          const winnerId = nextState.winnerIndex === 0 ? room.player1Id : room.player2Id!;
          await dbService.recordMatchResult({
            matchId: crypto.randomUUID(),
            roomCode: room.code,
            gameMode: room.gameMode,
            player1Id: room.player1Id,
            player2Id: room.player2Id!,
            winnerId,
            winReason: nextState.winReason ?? 'Match complete',
            totalShots: nextState.shotNumber,
          });
          this.broadcastLobbyPresence();
        }
      });

      socket.on('rematch:request', () => {
        const player = this.playersBySocket.get(socket.id);
        if (!player || !player.roomId) return;
        const room = this.rooms.get(player.roomId);
        if (!room || !room.player2Id) return;

        room.rematchVotes.add(player.playerId);
        if (room.rematchVotes.size >= 2) {
          room.rematchVotes.clear();
          room.status = 'playing';
          room.matchState = createInitialMatchState({
            gameMode: room.gameMode,
            playMode: 'online',
            player1Name: room.player1Name,
            player2Name: room.player2Name ?? 'Opponent',
          });
          this.io.to(room.roomId).emit('match:started', {
            room: this.toRoomInfo(room),
            matchState: room.matchState,
          });
        } else {
          socket.to(room.roomId).emit('rematch:offered', { by: player.nickname });
        }
      });

      socket.on('disconnect', () => {
        const player = this.playersBySocket.get(socket.id);
        if (!player) return;
        this.playersBySocket.delete(socket.id);
        this.leaveQueues(player.playerId);

        // Keep playerId mapped for 30s reconnection window if in active match
        if (!player.roomId) {
          this.playersById.delete(player.playerId);
        } else {
          const room = this.rooms.get(player.roomId);
          if (room) {
            socket.to(room.roomId).emit('opponent:connection', { connected: false, nickname: player.nickname });
          }
        }
        this.broadcastLobbyPresence();
      });
    });
  }

  private leaveQueues(playerId: string): void {
    this.queue8Ball = this.queue8Ball.filter((id) => id !== playerId);
    this.queue9Ball = this.queue9Ball.filter((id) => id !== playerId);
  }

  private createRoomInternal(
    host: ConnectedPlayer,
    gameMode: '8-ball' | '9-ball',
    isPrivate: boolean,
  ): ActiveRoom {
    const roomId = crypto.randomUUID();
    let code = makeRoomCode();
    while (this.roomsByCode.has(code)) {
      code = makeRoomCode();
    }

    const room: ActiveRoom = {
      roomId,
      code,
      gameMode,
      isPrivate,
      createdAt: Date.now(),
      player1Id: host.playerId,
      player1Name: host.nickname,
      player2Id: null,
      player2Name: null,
      status: 'waiting',
      matchState: null,
      rematchVotes: new Set(),
    };

    this.rooms.set(roomId, room);
    this.roomsByCode.set(code, room);

    host.roomId = roomId;
    host.status = 'in_match';
    this.io.sockets.sockets.get(host.socketId)?.join(roomId);
    return room;
  }

  private joinRoomInternal(room: ActiveRoom, guest: ConnectedPlayer): void {
    room.player2Id = guest.playerId;
    room.player2Name = guest.nickname;
    room.status = 'playing';

    guest.roomId = room.roomId;
    guest.status = 'in_match';
    this.io.sockets.sockets.get(guest.socketId)?.join(room.roomId);

    room.matchState = createInitialMatchState({
      gameMode: room.gameMode,
      playMode: 'online',
      player1Name: room.player1Name,
      player2Name: room.player2Name,
    });

    const host = this.playersById.get(room.player1Id);
    if (host) {
      this.io.to(host.socketId).emit('match:started', {
        room: this.toRoomInfo(room),
        seatIndex: 0,
        matchState: room.matchState,
      });
    }
    this.io.to(guest.socketId).emit('match:started', {
      room: this.toRoomInfo(room),
      seatIndex: 1,
      matchState: room.matchState,
    });

    this.broadcastLobbyPresence();
  }

  private leaveRoomInternal(player: ConnectedPlayer): void {
    const roomId = player.roomId;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    player.roomId = null;
    player.status = 'lobby';
    this.io.sockets.sockets.get(player.socketId)?.leave(roomId);

    if (!room) return;
    if (room.status === 'playing') {
      room.status = 'finished';
      this.io.to(roomId).emit('opponent:left', { nickname: player.nickname });
    }
    this.rooms.delete(roomId);
    this.roomsByCode.delete(room.code);
  }
}
