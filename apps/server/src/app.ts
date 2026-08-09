import { createServer, type Server as HttpServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type Express } from "express";
import { Server, type Socket } from "socket.io";
import {
  actionIdSchema,
  clientActionSchema,
  sessionTokenSchema,
  type ClientToServerEvents,
  type InterServerEvents,
  type ProtocolError,
  type ServerToClientEvents,
  type SocketData,
} from "@grandstand/shared";
import type { GameEngine } from "./game-engine-adapter.js";
import { InMemoryRoomRepository, type Room } from "./room-repository.js";
import { RoomService, ServiceError } from "./room-service.js";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export interface ServerAppOptions {
  engine: GameEngine;
  nodeEnv?: string;
  allowedOrigins?: readonly string[];
  reconnectGraceMs?: number;
  allowDevLanOrigins?: boolean;
  socketRateLimit?: number;
  sessionRateLimit?: number;
  staticDir?: string | false;
}

export interface ServerApp {
  app: Express;
  httpServer: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  service: RoomService;
  close(): Promise<void>;
}

export function createServerApp(options: ServerAppOptions): ServerApp {
  const app = express();
  app.disable("x-powered-by");
  const httpServer = createServer(app);
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const originAllowed = createOriginChecker(
    options.allowedOrigins ?? [],
    nodeEnv === "development",
    options.allowDevLanOrigins === true,
  );
  app.use((request, response, next) => {
    if (!originAllowed(request.headers.origin, request.headers.host)) {
      response.status(403).json({ error: "Origin not allowed" });
      return;
    }
    next();
  });
  app.use(
    cors((request, callback) => {
      callback(null, {
        origin: (origin, originCallback) =>
          originCallback(null, originAllowed(origin, request.headers.host)),
        methods: ["GET", "POST"],
        credentials: false,
      });
    }),
  );
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
      // The request-aware allowRequest check below is the security boundary.
      // Reflecting here lets an approved same-origin request receive CORS headers.
      origin: true,
      methods: ["GET", "POST"],
      credentials: false,
    },
    allowRequest: (request, callback) => {
      callback(null, originAllowed(request.headers.origin, request.headers.host));
    },
    maxHttpBufferSize: 64 * 1024,
    serveClient: false,
  });
  const repository = new InMemoryRoomRepository();
  const service = new RoomService(repository, options.engine, {
    ...(options.reconnectGraceMs === undefined ? {} : { reconnectGraceMs: options.reconnectGraceMs }),
  });
  const activeSessions = new Map<string, GameSocket>();
  const expirationTimers = new Map<string, NodeJS.Timeout>();
  const socketRates = new Map<string, number[]>();
  const sessionRates = new Map<string, number[]>();
  const socketRateLimit = options.socketRateLimit ?? 30;
  const sessionRateLimit = options.sessionRateLimit ?? 60;

  app.get("/health", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  if ((options.nodeEnv ?? process.env.NODE_ENV) === "development") {
    app.get("/debug/rooms", (_request, response) => {
      response.status(200).json({ rooms: service.debugRooms() });
    });
  } else {
    app.get("/debug/{*path}", (_request, response) => {
      response.sendStatus(404);
    });
  }

  const staticDir =
    nodeEnv === "production" || options.staticDir !== undefined
      ? resolveStaticDir(options.staticDir)
      : undefined;
  if (staticDir) {
    app.use(express.static(staticDir, { index: false }));
    app.get("/{*path}", (request, response, next) => {
      if (path.extname(request.path) !== "" || !request.accepts("html")) {
        next();
        return;
      }
      response.sendFile(path.join(staticDir, "index.html"));
    });
  } else if (nodeEnv === "production") {
    throw new Error(
      "Production web assets were not found. Build apps/web before starting the server.",
    );
  }

  const emitRoom = (room: Room): void => {
    for (const [playerId, state] of service.statesForConnectedPlayers(room)) {
      const player = room.players.get(playerId);
      const socket = player ? activeSessions.get(player.token) : undefined;
      socket?.emit("game:state", state);
    }
  };

  const replaceSession = (token: string, socket: GameSocket): void => {
    const previous = activeSessions.get(token);
    activeSessions.set(token, socket);
    if (previous && previous.id !== socket.id) {
      previous.emit("game:error", {
        code: "SESSION_REPLACED",
        message: "This session was opened in another tab. Continue there.",
      });
      previous.emit("session:replaced");
      previous.disconnect(true);
    }
    const timer = expirationTimers.get(token);
    if (timer) {
      clearTimeout(timer);
      expirationTimers.delete(token);
    }
  };

  io.on("connection", (socket) => {
    const authToken = sessionTokenSchema.safeParse(socket.handshake.auth.sessionToken);
    if (authToken.success) {
      try {
        const resumed = service.resume(authToken.data);
        if (resumed) {
          socket.data.sessionToken = authToken.data;
          socket.data.playerId = resumed.player.id;
          socket.data.roomCode = resumed.room.code;
          replaceSession(authToken.data, socket);
          socket.emit("session:token", authToken.data);
          emitRoom(resumed.room);
        } else {
          socket.emit("game:error", {
            code: "UNAUTHENTICATED",
            message: "This session is no longer valid. Create or join a room.",
          });
        }
      } catch (error: unknown) {
        socket.emit(
          "game:error",
          error instanceof ServiceError
            ? { code: error.code, message: error.message }
            : { code: "INTERNAL_ERROR", message: "The session could not be restored" },
        );
      }
    } else if (socket.handshake.auth.sessionToken !== undefined) {
      socket.emit("game:error", {
        code: "UNAUTHENTICATED",
        message: "The saved session token is malformed. Create or join a room.",
      });
    }

    socket.on("game:action", (payload: unknown) => {
      const now = Date.now();
      if (
        !consumeRate(socketRates, socket.id, socketRateLimit, now) ||
        (socket.data.sessionToken !== undefined &&
          !consumeRate(sessionRates, socket.data.sessionToken, sessionRateLimit, now))
      ) {
        socket.emit("game:error", {
          ...extractActionId(payload),
          code: "RATE_LIMITED",
          message: "Too many actions. Wait a moment and retry.",
        });
        return;
      }
      const parsed = clientActionSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("game:error", {
          ...extractActionId(payload),
          code: "BAD_PAYLOAD",
          message: "The message did not match the protocol",
        });
        return;
      }

      try {
        const result = service.perform(socket.data.sessionToken, parsed.data);
        if (result.sessionToken && result.player && result.room) {
          socket.data.sessionToken = result.sessionToken;
          socket.data.playerId = result.player.id;
          socket.data.roomCode = result.room.code;
          replaceSession(result.sessionToken, socket);
          socket.emit("session:token", result.sessionToken);
        }
        socket.emit("action:ack", result.ack);
        if (parsed.data.type === "room:leave") {
          const token = socket.data.sessionToken;
          if (token) activeSessions.delete(token);
          delete socket.data.sessionToken;
          delete socket.data.playerId;
          delete socket.data.roomCode;
        }
        if (result.room) emitRoom(result.room);
      } catch (error: unknown) {
        const publicError: ProtocolError =
          error instanceof ServiceError
            ? { actionId: parsed.data.actionId, code: error.code, message: error.message }
            : { actionId: parsed.data.actionId, code: "INTERNAL_ERROR", message: "The action could not be completed" };
        if (!(error instanceof ServiceError)) console.error("Unhandled game action error", error);
        socket.emit("game:error", publicError);
      }
    });

    socket.on("disconnect", () => {
      socketRates.delete(socket.id);
      const token = socket.data.sessionToken;
      if (!token || activeSessions.get(token)?.id !== socket.id) return;
      activeSessions.delete(token);
      const room = service.disconnect(token);
      if (room) emitRoom(room);
      const timer = setTimeout(() => {
        expirationTimers.delete(token);
        const changedRoom = service.expireDisconnected(token);
        if (changedRoom) emitRoom(changedRoom);
      }, service.reconnectGraceMs);
      timer.unref();
      expirationTimers.set(token, timer);
    });
  });

  return {
    app,
    httpServer,
    io,
    service,
    close: async () => {
      for (const timer of expirationTimers.values()) clearTimeout(timer);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (httpServer.listening) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

function extractActionId(payload: unknown): { actionId?: string } {
  if (typeof payload !== "object" || payload === null || !("actionId" in payload)) return {};
  const parsed = actionIdSchema.safeParse((payload as { actionId: unknown }).actionId);
  return parsed.success ? { actionId: parsed.data } : {};
}

function createOriginChecker(
  configuredOrigins: readonly string[],
  development: boolean,
  allowDevLanOrigins: boolean,
): (origin: string | undefined, requestHost?: string) => boolean {
  const configured = new Set(configuredOrigins.map((origin) => origin.replace(/\/$/u, "")));
  return (origin, requestHost) => {
    if (origin === undefined) return true;
    const normalized = origin.replace(/\/$/u, "");
    if (configured.has(normalized)) return true;
    try {
      const url = new URL(origin);
      const hostname = url.hostname;
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      if (requestHost !== undefined && url.host.toLowerCase() === requestHost.toLowerCase()) return true;
      if (development && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")) return true;
      return (
        development &&
        allowDevLanOrigins &&
        (/^10\./u.test(hostname) ||
          /^192\.168\./u.test(hostname) ||
          /^172\.(1[6-9]|2\d|3[01])\./u.test(hostname))
      );
    } catch {
      return false;
    }
  };
}

function resolveStaticDir(configured: string | false | undefined): string | undefined {
  if (configured === false) return undefined;
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates =
    configured === undefined
      ? [
          path.resolve(moduleDir, "../../web/dist"),
          path.resolve(moduleDir, "../../../web/dist"),
          path.resolve(process.cwd(), "apps/web/dist"),
          path.resolve(process.cwd(), "../web/dist"),
        ]
      : [path.resolve(configured)];
  return candidates.find((candidate) => existsSync(path.join(candidate, "index.html")));
}

function consumeRate(
  buckets: Map<string, number[]>,
  key: string,
  limit: number,
  now: number,
): boolean {
  const recent = (buckets.get(key) ?? []).filter((timestamp) => timestamp > now - 10_000);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}
