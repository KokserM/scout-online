import type { Activity, ClientAction, RulesMode } from "@grandstand/shared";

export interface RoomPlayer {
  readonly id: string;
  readonly token: string;
  name: string;
  isBot: boolean;
  botDifficulty?: "easy" | "standard";
  ready: boolean;
  connected: boolean;
  disconnectedAt?: number;
}

export interface ProcessedAction {
  readonly playerId: string;
  readonly fingerprint: string;
}

export interface Room {
  readonly code: string;
  hostId: string;
  rulesMode: RulesMode;
  readonly players: Map<string, RoomPlayer>;
  engineState?: unknown;
  readonly processedActions: Map<string, ProcessedAction>;
  readonly activity: Activity[];
  createdAt: number;
  updatedAt: number;
}

export interface RoomRepository {
  get(code: string): Room | undefined;
  getBySessionToken(token: string): { room: Room; player: RoomPlayer } | undefined;
  save(room: Room): void;
  delete(code: string): void;
  list(): readonly Room[];
}

export class InMemoryRoomRepository implements RoomRepository {
  private readonly rooms = new Map<string, Room>();
  private readonly sessions = new Map<string, { roomCode: string; playerId: string }>();

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  getBySessionToken(token: string): { room: Room; player: RoomPlayer } | undefined {
    const entry = this.sessions.get(token);
    if (!entry) return undefined;
    const room = this.rooms.get(entry.roomCode);
    const player = room?.players.get(entry.playerId);
    if (!room || !player) {
      this.sessions.delete(token);
      return undefined;
    }
    return { room, player };
  }

  save(room: Room): void {
    this.rooms.set(room.code, room);
    for (const [token, session] of this.sessions) {
      const player = room.players.get(session.playerId);
      if (session.roomCode === room.code && (!player || player.isBot)) this.sessions.delete(token);
    }
    for (const player of room.players.values()) {
      if (!player.isBot) this.sessions.set(player.token, { roomCode: room.code, playerId: player.id });
    }
  }

  delete(code: string): void {
    const room = this.rooms.get(code);
    if (room) {
      for (const player of room.players.values()) this.sessions.delete(player.token);
    }
    this.rooms.delete(code);
  }

  list(): readonly Room[] {
    return [...this.rooms.values()];
  }
}

export function actionFingerprint(action: ClientAction): string {
  const entries = Object.entries(action).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(Object.fromEntries(entries));
}
