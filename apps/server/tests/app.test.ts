import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  ActionAck,
  ClientToServerEvents,
  ProtocolError,
  ServerToClientEvents,
} from "@grandstand/shared";
import type { GameEngine } from "../src/game-engine-adapter.js";
import { createServerApp } from "../src/app.js";

const unusedEngine: GameEngine = {
  createGame: () => {
    throw new Error("not used");
  },
  applyAction: () => {
    throw new Error("not used");
  },
  getPlayerView: () => {
    throw new Error("not used");
  },
  chooseBotAction: () => undefined,
};

describe("HTTP surface", () => {
  it("serves health without exposing debug data in production", async () => {
    const staticDir = await createStaticFixture();
    const server = createServerApp({
      engine: unusedEngine,
      nodeEnv: "production",
      staticDir,
    });
    await request(server.app).get("/health").expect(200, { ok: true });
    await request(server.app).get("/debug/rooms").expect(404);
    await server.close();
    await rm(staticDir, { recursive: true, force: true });
  });

  it("exposes token-free room diagnostics only in development", async () => {
    const server = createServerApp({ engine: unusedEngine, nodeEnv: "development" });
    const response = await request(server.app).get("/debug/rooms").expect(200);
    expect(response.body).toEqual({ rooms: [] });
    expect(JSON.stringify(response.body)).not.toContain("token");
    await server.close();
  });

  it("serves production assets and falls back to the SPA without shadowing health", async () => {
    const staticDir = await createStaticFixture();
    await writeFile(path.join(staticDir, "app.js"), "globalThis.grandstand = true;");
    const server = createServerApp({ engine: unusedEngine, nodeEnv: "production", staticDir });

    await request(server.app).get("/health").expect(200, { ok: true });
    await request(server.app).get("/app.js").expect(200, "globalThis.grandstand = true;");
    await request(server.app).get("/rooms/ABCD").set("Accept", "text/html").expect(200, /Grandstand app/u);
    await request(server.app).get("/missing.js").expect(404);

    await server.close();
    await rm(staticDir, { recursive: true, force: true });
  });

  it("allows same-origin and configured split deployments but rejects unrelated origins", async () => {
    const staticDir = await createStaticFixture();
    const server = createServerApp({
      engine: unusedEngine,
      nodeEnv: "production",
      staticDir,
      allowedOrigins: ["https://web.example.com"],
    });

    await request(server.app)
      .get("/health")
      .set("Host", "game.example.com")
      .set("Origin", "https://game.example.com")
      .expect("access-control-allow-origin", "https://game.example.com")
      .expect(200);
    await request(server.app)
      .get("/health")
      .set("Host", "game.example.com")
      .set("Origin", "https://web.example.com")
      .expect("access-control-allow-origin", "https://web.example.com")
      .expect(200);
    await request(server.app)
      .get("/health")
      .set("Host", "game.example.com")
      .set("Origin", "https://unrelated.example.com")
      .expect(403, { error: "Origin not allowed" });

    await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    const address = server.httpServer.address() as AddressInfo;
    const rejected = createClient(`http://127.0.0.1:${address.port}`, {
      transports: ["websocket"],
      reconnection: false,
      extraHeaders: { Origin: "https://unrelated.example.com" },
    });
    await expect(waitForConnectError(rejected)).resolves.toBeDefined();
    rejected.disconnect();

    await server.close();
    await rm(staticDir, { recursive: true, force: true });
  });

  it("fails clearly when production web assets are missing", () => {
    expect(() =>
      createServerApp({
        engine: unusedEngine,
        nodeEnv: "production",
        staticDir: path.join(tmpdir(), "grandstand-assets-do-not-exist"),
      }),
    ).toThrow(/production web assets were not found/i);
  });

  it("survives malformed socket messages and accepts the next valid action", async () => {
    const server = createServerApp({ engine: unusedEngine, nodeEnv: "test" });
    await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    const address = server.httpServer.address() as AddressInfo;
    const socket: ClientSocket<ServerToClientEvents, ClientToServerEvents> = createClient(
      `http://127.0.0.1:${address.port}`,
      { transports: ["websocket"] },
    );
    await waitForConnect(socket);

    const malformedError = waitForError(socket);
    socket.emit("game:action", { type: "room:create", name: 42 });
    expect((await malformedError).code).toBe("BAD_PAYLOAD");
    expect(socket.connected).toBe(true);

    const malformedMode = waitForError(socket);
    socket.emit("game:action", {
      actionId: randomUUID(),
      type: "game:show",
      cardIds: ["1-7"],
      valueMode: "mixed",
    });
    expect((await malformedMode).code).toBe("BAD_PAYLOAD");
    expect(socket.connected).toBe(true);

    const actionId = randomUUID();
    const acknowledged = waitForAck(socket);
    const issuedToken = waitForToken(socket);
    socket.emit("game:action", { actionId, type: "room:create", name: "Player" });
    expect(await acknowledged).toEqual({ actionId, ok: true, duplicate: false });
    const token = await issuedToken;

    const replaced = waitForReplacement(socket);
    const replacementError = waitForError(socket);
    const replacement: ClientSocket<ServerToClientEvents, ClientToServerEvents> = createClient(
      `http://127.0.0.1:${address.port}`,
      { auth: { sessionToken: token }, transports: ["websocket"] },
    );
    await waitForConnect(replacement);
    await replaced;
    expect((await replacementError).code).toBe("SESSION_REPLACED");
    expect(socket.connected).toBe(false);
    expect(replacement.connected).toBe(true);

    replacement.disconnect();
    await server.close();
  });

  it("rate limits abusive sockets with an actionable protocol error", async () => {
    const server = createServerApp({
      engine: unusedEngine,
      nodeEnv: "test",
      socketRateLimit: 1,
    });
    await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    const address = server.httpServer.address() as AddressInfo;
    const socket: ClientSocket<ServerToClientEvents, ClientToServerEvents> = createClient(
      `http://127.0.0.1:${address.port}`,
      { transports: ["websocket"] },
    );
    await waitForConnect(socket);
    const malformed = waitForError(socket);
    socket.emit("game:action", { broken: true });
    expect((await malformed).code).toBe("BAD_PAYLOAD");
    const limited = waitForError(socket);
    socket.emit("game:action", {
      actionId: randomUUID(),
      type: "room:create",
      name: "Flood",
    });
    expect((await limited).code).toBe("RATE_LIMITED");
    socket.disconnect();
    await server.close();
  });
});

async function createStaticFixture(): Promise<string> {
  const staticDir = await mkdtemp(path.join(tmpdir(), "grandstand-web-"));
  await writeFile(path.join(staticDir, "index.html"), "<main>Grandstand app</main>");
  return staticDir;
}

function waitForConnect(
  socket: ClientSocket<ServerToClientEvents, ClientToServerEvents>,
): Promise<void> {
  return new Promise((resolve) => socket.once("connect", resolve));
}

function waitForConnectError(socket: ClientSocket): Promise<Error> {
  return new Promise((resolve) => socket.once("connect_error", resolve));
}

function waitForError(
  socket: ClientSocket<ServerToClientEvents, ClientToServerEvents>,
): Promise<ProtocolError> {
  return new Promise((resolve) => socket.once("game:error", resolve));
}

function waitForAck(
  socket: ClientSocket<ServerToClientEvents, ClientToServerEvents>,
): Promise<ActionAck> {
  return new Promise((resolve) => socket.once("action:ack", resolve));
}

function waitForToken(
  socket: ClientSocket<ServerToClientEvents, ClientToServerEvents>,
): Promise<string> {
  return new Promise((resolve) => socket.once("session:token", resolve));
}

function waitForReplacement(
  socket: ClientSocket<ServerToClientEvents, ClientToServerEvents>,
): Promise<void> {
  return new Promise((resolve) => socket.once("session:replaced", resolve));
}
