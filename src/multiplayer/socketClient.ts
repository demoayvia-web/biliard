import { io, type Socket } from 'socket.io-client';
import type {
  MatchState,
  OnlinePlayerSummary,
  PhysicsEvent,
  RoomInfo,
  ShotParams,
} from '../game/types.ts';

export interface OnlineMatchStartedPayload {
  room: RoomInfo;
  seatIndex: 0 | 1;
  matchState: MatchState;
}

export interface OnlineShotExecutedPayload {
  shooterIndex: 0 | 1;
  shot: ShotParams;
  finalMatchState: MatchState;
  events: PhysicsEvent[];
}

export interface OnlineInvitePayload {
  fromPlayerId: string;
  fromNickname: string;
  roomCode: string;
}

class MultiplayerClient {
  private socket: Socket | null = null;
  public connected = false;

  public connect(playerId: string, nickname: string, customServerUrl?: string): Socket {
    const serverUrl =
      customServerUrl ||
      (import.meta.env.VITE_MULTIPLAYER_URL as string | undefined) ||
      window.location.origin;

    if (this.socket) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      this.socket.emit('auth:hello', { playerId, nickname });
      return this.socket;
    }

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      timeout: 6000,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this.socket?.emit('auth:hello', { playerId, nickname });
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
    });

    return this.socket;
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public joinQueue(gameMode: '8-ball' | '9-ball'): void {
    this.socket?.emit('queue:join', { gameMode });
  }

  public leaveQueue(): void {
    this.socket?.emit('queue:leave');
  }

  public createRoom(gameMode: '8-ball' | '9-ball', isPrivate: boolean): void {
    this.socket?.emit('room:create', { gameMode, isPrivate });
  }

  public joinRoom(code: string): void {
    this.socket?.emit('room:join', { code });
  }

  public leaveRoom(): void {
    this.socket?.emit('room:leave');
  }

  public sendInvite(targetPlayerId: string, roomCode: string): void {
    this.socket?.emit('invite:send', { targetPlayerId, roomCode });
  }

  public sendAimPreview(angle: number): void {
    this.socket?.emit('aim:preview', { angle });
  }

  public moveBallInHand(x: number, z: number): void {
    this.socket?.emit('ball_in_hand:move', { x, z });
  }

  public confirmBallInHand(): void {
    this.socket?.emit('ball_in_hand:confirm');
  }

  public submitShot(shot: ShotParams): void {
    this.socket?.emit('shot:submit', shot);
  }

  public requestRematch(): void {
    this.socket?.emit('rematch:request');
  }

  public disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
  }
}

export const multiplayerClient = new MultiplayerClient();

export type {
  MatchState,
  OnlinePlayerSummary,
  RoomInfo,
};
