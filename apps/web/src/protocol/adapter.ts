import { io, type Socket } from "socket.io-client";
import {
  actionAckSchema,
  playerStateSchema,
  protocolErrorSchema,
  type ClientAction as WireAction,
} from "@grandstand/shared";
import type { ClientAction, GameState, ServerError } from "./types";

export interface ProtocolEvents {
  state: (state: GameState) => void;
  error: (error: ServerError) => void;
  connection: (connected: boolean) => void;
}

export type CreateSocket = (
  uri: string,
  opts?: Parameters<typeof io>[1],
) => Socket;

export interface ClientProtocol {
  connect(token?: string): void;
  disconnect(): void;
  ensureConnected(): void;
  dispatch(action: ClientAction): void;
  on<K extends keyof ProtocolEvents>(
    event: K,
    listener: ProtocolEvents[K],
  ): () => void;
}

export function bindConnectionLifecycle(ensureConnected: () => void): () => void {
  const onVisible = () => {
    if (document.visibilityState === "visible") ensureConnected();
  };
  const onPageShow = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) ensureConnected();
  };
  const onOnline = () => ensureConnected();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("online", onOnline);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("online", onOnline);
  };
}

/**
 * Deliberately isolates wire event names and payloads. When @grandstand/shared
 * becomes available, only this adapter should need to change.
 */
export class SocketProtocol implements ClientProtocol {
  private socket: Socket | undefined;
  private inFlightActionId: string | undefined;
  private readonly outbox: WireAction[] = [];
  private readonly listeners = new Map<
    keyof ProtocolEvents,
    Set<(payload: unknown) => void>
  >();

  constructor(private readonly createSocket: CreateSocket = io) {}

  connect(token?: string) {
    if (this.socket) return;
    this.socket = this.createSocket(import.meta.env.VITE_SOCKET_URL || "/", {
      ...(token ? { auth: { sessionToken: token } } : {}),
      reconnectionDelayMax: 5_000,
    });
    this.socket.on("connect", () => {
      this.emit("connection", true);
      this.inFlightActionId = undefined;
      this.flush();
    });
    this.socket.on("disconnect", () => {
      this.inFlightActionId = undefined;
      this.emit("connection", false);
    });
    this.socket.on("action:ack", (payload: unknown) => {
      const ack = actionAckSchema.safeParse(payload);
      if (!ack.success) {
        this.emit("error", {
          code: "BAD_SERVER_STATE",
          message: "The server sent a malformed action acknowledgement.",
        });
        return;
      }
      this.removeFromOutbox(ack.data.actionId);
      this.flush();
    });
    this.socket.on("game:state", (payload: unknown) => {
      const state = playerStateSchema.safeParse(payload);
      if (state.success) this.emit("state", state.data);
      else {
        this.emit("error", {
          code: "BAD_SERVER_STATE",
          message:
            "The server sent an invalid game state. Reconnect before continuing.",
        });
      }
    });
    this.socket.on("game:error", (payload: unknown) => {
      const error = protocolErrorSchema.safeParse(payload);
      if (error.success) {
        if (
          error.data.code === "UNAUTHENTICATED" ||
          error.data.code === "SEAT_LOST" ||
          error.data.code === "SESSION_REPLACED"
        ) {
          if (this.socket) this.socket.auth = {};
        }
        if (error.data.code === "RATE_LIMITED" && error.data.actionId) {
          if (this.inFlightActionId === error.data.actionId)
            this.inFlightActionId = undefined;
          window.setTimeout(() => this.flush(), 1_000);
        } else if (error.data.actionId) {
          this.removeFromOutbox(error.data.actionId);
        }
        this.emit("error", error.data);
        if (error.data.code !== "RATE_LIMITED") this.flush();
      } else {
        this.emit("error", {
          code: "BAD_SERVER_STATE",
          message: "The server sent a malformed error response.",
        });
      }
    });
    this.socket.on("session:token", (nextToken: string) => {
      localStorage.setItem("grandstand.session", nextToken);
      // Socket.IO reuses this auth object on automatic reconnects. Keep it in
      // sync with the newly-issued room session, not only localStorage.
      if (this.socket) this.socket.auth = { sessionToken: nextToken };
    });
    this.socket.on("session:replaced", () => {
      if (this.socket) this.socket.auth = {};
      this.outbox.length = 0;
      this.inFlightActionId = undefined;
      this.emit("error", {
        code: "SESSION_REPLACED",
        message: "This session is active in another tab. Continue there.",
      });
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = undefined;
  }

  ensureConnected() {
    if (this.socket && !this.socket.connected) this.socket.connect();
  }

  dispatch(action: ClientAction) {
    if (this.outbox.length >= 64) {
      this.emit("error", {
        code: "RATE_LIMITED",
        message:
          "Too many actions are waiting to send. Reconnect and try again.",
      });
      return;
    }
    this.outbox.push(toWireAction(action));
    this.flush();
  }

  on<K extends keyof ProtocolEvents>(event: K, listener: ProtocolEvents[K]) {
    const bucket = this.listeners.get(event) ?? new Set();
    bucket.add(listener as (payload: unknown) => void);
    this.listeners.set(event, bucket);
    return () => bucket.delete(listener as (payload: unknown) => void);
  }

  private emit<K extends keyof ProtocolEvents>(
    event: K,
    ...args: Parameters<ProtocolEvents[K]>
  ) {
    this.listeners.get(event)?.forEach((listener) => listener(args[0]));
  }

  private flush(): void {
    const action = this.outbox[0];
    if (!action || !this.socket?.connected || this.inFlightActionId) return;
    this.inFlightActionId = action.actionId;
    this.socket.emit("game:action", action);
  }

  private removeFromOutbox(actionId: string): void {
    const index = this.outbox.findIndex(
      (action) => action.actionId === actionId,
    );
    if (index >= 0) this.outbox.splice(index, 1);
    if (this.inFlightActionId === actionId) this.inFlightActionId = undefined;
  }
}

function toWireAction(action: ClientAction): WireAction {
  const actionId = crypto.randomUUID();
  switch (action.type) {
    case "create-room":
      return { actionId, type: "room:create", name: action.name };
    case "join-room":
      return {
        actionId,
        type: "room:join",
        name: action.name,
        roomCode: action.roomCode,
      };
    case "quick-play":
      return { actionId, type: "room:quick-play", name: action.name };
    case "set-ready":
      return { actionId, type: "player:set-ready", ready: action.ready };
    case "add-bot":
      return {
        actionId,
        type: "host:add-bot",
        difficulty: action.difficulty,
      };
    case "remove-bot":
      return { actionId, type: "host:remove-bot", playerId: action.playerId };
    case "set-rules-mode":
      return {
        actionId,
        type: "host:set-rules-mode",
        rulesMode: action.rulesMode,
      };
    case "start-game":
      return { actionId, type: "game:start" };
    case "next-round":
      return { actionId, type: "game:next-round" };
    case "rematch":
      return { actionId, type: "game:rematch" };
    case "choose-orientation":
      return {
        actionId,
        type: "game:choose-orientation",
        flipped: action.flipped,
      };
    case "show":
      return {
        actionId,
        type: "game:show",
        cardIds: action.cardIds,
        valueMode: action.valueMode,
      };
    case "scout":
      return {
        actionId,
        type: "game:scout",
        playId: action.playId,
        position: action.position,
        insertAt: action.insertionIndex,
        flipped: action.flipped,
      };
    case "scout-and-show":
      return {
        actionId,
        type: "game:scout-and-show",
        playId: action.playId,
        position: action.position,
        insertAt: action.insertionIndex,
        flipped: action.flipped,
        cardIds: action.cardIds,
        valueMode: action.valueMode,
      };
    case "leave-room":
      return { actionId, type: "room:leave" };
  }
}
