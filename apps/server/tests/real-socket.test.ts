import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { SeededRandomSource } from "@grandstand/game-engine";
import type {
  ActionAck,
  ClientAction,
  ClientToServerEvents,
  PlayerState,
  ProtocolError,
  RulesMode,
  ServerToClientEvents,
} from "@grandstand/shared";
import {
  io as createClient,
  type Socket as ClientSocket,
} from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { createServerApp, type ServerApp } from "../src/app.js";
import { createGameEngine } from "../src/game-engine-adapter.js";

type GameClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

interface Seat {
  socket: GameClient;
  token: string;
  state?: PlayerState;
}

interface Table {
  server: ServerApp;
  seats: Seat[];
}

const openTables: Table[] = [];

afterEach(async () => {
  for (const table of openTables.splice(0)) {
    for (const seat of table.seats) seat.socket.disconnect();
    await table.server.close();
  }
});

describe("real Socket.IO transport with the real game engine", () => {
  it("projects secrets per recipient and applies Show, Scout, and Scout & Show", async () => {
    const table = await startTable(3, 71);
    const [host, bravo, charlie] = table.seats as [Seat, Seat, Seat];

    for (const viewer of table.seats) {
      const serialized = JSON.stringify(viewer.state);
      const projectedStrings = collectStrings(viewer.state);
      expect(serialized).not.toMatch(
        /sessionToken|twoPlayerRoundDecks|initialCardIds/u,
      );
      for (const opponent of table.seats) {
        if (opponent === viewer) continue;
        for (const card of opponent.state!.hand)
          expect(projectedStrings).not.toContain(card.id);
      }
    }

    const actor = seatForActive(table);
    const show = legalShows(actor).sort(
      (left, right) => right.cardIds.length - left.cardIds.length,
    )[0]!;
    expect(show.cardIds.length).toBeGreaterThan(1);
    const stateBeforeForgedMode = structuredClone(actor.state);
    await expect(
      send(actor, {
        actionId: randomUUID(),
        type: "game:show",
        cardIds: show.cardIds,
        valueMode: "opposite",
      }),
    ).rejects.toThrow(/Official rules only allow active/i);
    expect(actor.state).toEqual(stateBeforeForgedMode);

    await send(actor, {
      actionId: randomUUID(),
      type: "game:show",
      cardIds: show.cardIds,
      valueMode: show.valueMode,
    });
    await waitForAll(
      table,
      (state) => state.table[0]?.cards.length === show.cardIds.length,
    );
    expect(
      table.seats.every(
        (seat) => seat.state!.table[0]?.valueMode === show.valueMode,
      ),
    ).toBe(true);

    const scout = seatForActive(table);
    const scoutCardId = scout.state!.table[0]!.cards[0]!.id;
    await send(scout, {
      actionId: randomUUID(),
      type: "game:scout",
      playId: scout.state!.availableActions.scout.playId!,
      position: scout.state!.availableActions.scout.endpoints[0]!,
      insertAt: 0,
      flipped: false,
    });
    await waitForAll(
      table,
      (state) => state.table[0]?.cards.length === show.cardIds.length - 1,
    );
    const observer = scout === bravo ? charlie : bravo;
    expect(collectStrings(observer.state)).not.toContain(scoutCardId);

    const combinedActor = seatForActive(table);
    expect(
      combinedActor.state!.availableActions.scoutAndShow.options.every(
        (candidate) => candidate.showRanges.some((range) => range.legal),
      ),
    ).toBe(true);
    const option =
      combinedActor.state!.availableActions.scoutAndShow.options.find(
        (candidate) => candidate.showRanges.some((range) => range.legal),
      );
    expect(option).toBeDefined();
    const combinedShow = option!.showRanges.find((range) => range.legal)!;
    const stateBeforeForgedCombined = structuredClone(combinedActor.state);
    await expect(
      send(combinedActor, {
        actionId: randomUUID(),
        type: "game:scout-and-show",
        playId: combinedActor.state!.availableActions.scoutAndShow.playId!,
        position: option!.position,
        insertAt: option!.insertAt,
        flipped: option!.flipped,
        cardIds: ["forged-card"],
        valueMode: combinedShow.valueMode,
      }),
    ).rejects.toThrow(/selected card is not in the hand/i);
    expect(combinedActor.state).toEqual(stateBeforeForgedCombined);

    await send(combinedActor, {
      actionId: randomUUID(),
      type: "game:scout-and-show",
      playId: combinedActor.state!.availableActions.scoutAndShow.playId!,
      position: option!.position,
      insertAt: option!.insertAt,
      flipped: option!.flipped,
      cardIds: combinedShow.cardIds,
      valueMode: combinedShow.valueMode,
    });
    await waitForAll(
      table,
      (state) => state.table[0]?.playerId === combinedActor.state!.selfId,
    );
    expect(
      combinedActor.state!.players.find(
        (player) => player.id === combinedActor.state!.selfId,
      )?.scoutAndShowAvailable,
    ).toBe(false);
  });

  it("keeps the turn for repeated two-player Scouts and completes rounds/rematch", async () => {
    const table = await startTable(2, 9);
    const host = table.seats[0]!;
    const firstActor = seatForActive(table);
    const opening = legalShows(firstActor).sort(
      (left, right) => right.cardIds.length - left.cardIds.length,
    )[0]!;
    expect(opening.cardIds.length).toBeGreaterThan(1);
    await send(firstActor, {
      actionId: randomUUID(),
      type: "game:show",
      cardIds: opening.cardIds,
      valueMode: opening.valueMode,
    });
    await waitForAll(
      table,
      (state) => state.table[0]?.playerId === firstActor.state!.selfId,
    );

    const scout = seatForActive(table);
    const scoutId = scout.state!.selfId;
    for (const chips of [2, 1]) {
      await send(scout, {
        actionId: randomUUID(),
        type: "game:scout",
        playId: scout.state!.availableActions.scout.playId!,
        position: scout.state!.availableActions.scout.endpoints[0]!,
        insertAt: 0,
        flipped: false,
      });
      await waitForAll(
        table,
        (state) =>
          state.activePlayerId === scoutId &&
          state.players.find((player) => player.id === scoutId)?.scoutChips ===
            chips,
      );
    }

    await playToResults(table);
    expect(host.state!.phase).toBe("round-results");
    expect(host.state!.roundScores).toHaveLength(2);
    await send(host, { actionId: randomUUID(), type: "game:next-round" });
    await orientAll(table);
    await playToResults(table);
    expect(host.state!.phase).toBe("final");
    expect(host.state!.round).toBe(2);

    await send(host, { actionId: randomUUID(), type: "game:rematch" });
    await waitForState(host, (state) => state.phase === "lobby");
    expect(host.state!.players.every((player) => player.ready === false)).toBe(
      true,
    );
    expect(host.state!.players.every((player) => player.score === 0)).toBe(
      true,
    );
  }, 30_000);

  it("restores the public VOSU table mode without leaking private state", async () => {
    const table = await startTable(2, 23, "vosu");
    const actor = seatForActive(table);
    const observer = table.seats.find((seat) => seat !== actor)!;
    const opposite = legalShows(actor).find(
      (range) => range.valueMode === "opposite" && range.cardIds.length === 1,
    )!;
    await send(actor, {
      actionId: randomUUID(),
      type: "game:show",
      cardIds: opposite.cardIds,
      valueMode: opposite.valueMode,
    });
    await waitForState(
      observer,
      (state) => state.table[0]?.valueMode === "opposite",
    );
    expect(observer.state!.activity.at(-1)?.message).toMatch(
      /using OPPOSITE values/u,
    );
    const privateHand = observer.state!.hand;

    observer.socket.disconnect();
    const resumed = await connectSeat(table, observer.token);
    await waitForState(
      resumed,
      (state) => state.table[0]?.valueMode === "opposite",
    );
    expect(resumed.state!.hand).toEqual(privateHand);
    expect(collectStrings(resumed.state)).not.toContain(
      actor.state!.hand[0]!.id,
    );
  });

  it("restores a disconnected seat, replaces duplicate sessions, and deduplicates actions", async () => {
    const table = await startTable(2, 31);
    const original = seatForActive(table);
    const other = table.seats.find((seat) => seat !== original)!;
    const originalHand = original.state!.hand;

    original.socket.disconnect();
    await waitForState(
      other,
      (state) =>
        state.players.find((player) => player.id === original.state!.selfId)
          ?.connected === false,
    );

    const resumed = await connectSeat(table, original.token);
    await waitForState(resumed, (state) => state.phase === "playing");
    expect(resumed.state!.hand).toEqual(originalHand);
    await waitForState(
      other,
      (state) =>
        state.players.find((player) => player.id === original.state!.selfId)
          ?.connected === true,
    );

    const replaced = once<void>(resumed.socket, "session:replaced");
    const replacementError = once<ProtocolError>(resumed.socket, "game:error");
    const duplicateSession = await connectSeat(table, original.token);
    await replaced;
    expect((await replacementError).code).toBe("SESSION_REPLACED");
    expect(resumed.socket.connected).toBe(false);

    const actionId = randomUUID();
    const action: ClientAction = {
      actionId,
      type: "game:show",
      cardIds: legalShows(duplicateSession)[0]!.cardIds,
      valueMode: legalShows(duplicateSession)[0]!.valueMode,
    };
    expect((await send(duplicateSession, action)).duplicate).toBe(false);
    await waitForState(
      duplicateSession,
      (state) => state.table[0]?.playerId === duplicateSession.state!.selfId,
    );
    const stateAfterFirst = duplicateSession.state;
    expect((await send(duplicateSession, action)).duplicate).toBe(true);
    expect(duplicateSession.state).toEqual(stateAfterFirst);
  });

  it("turns an active leaver into a bot and transfers hosting to a human", async () => {
    const table = await startTable(2, 17);
    const host = table.seats[0]!;
    const guest = table.seats[1]!;
    expect(host.state!.activePlayerId).toBe(host.state!.selfId);

    await send(host, { actionId: randomUUID(), type: "room:leave" });
    await waitForState(
      guest,
      (state) =>
        state.hostId === guest.state!.selfId &&
        state.players.some(
          (player) => player.id === host.state!.selfId && player.isBot,
        ),
    );
    expect(guest.state!.hostId).toBe(guest.state!.selfId);
    expect(
      guest.state!.players.find((player) => player.id === host.state!.selfId)
        ?.isBot,
    ).toBe(true);
    expect(
      guest.state!.phase !== "playing" ||
        guest.state!.activePlayerId === guest.state!.selfId,
    ).toBe(true);
  });
});

async function startTable(
  playerCount: 2 | 3,
  seed: number,
  rulesMode: RulesMode = "official",
): Promise<Table> {
  const server = createServerApp({
    engine: createGameEngine({
      rng: new SeededRandomSource(seed),
      chooseStartingPlayer: (players) => players[0]!,
    }),
    nodeEnv: "test",
    reconnectGraceMs: 2_000,
  });
  await new Promise<void>((resolve) =>
    server.httpServer.listen(0, "127.0.0.1", resolve),
  );
  const table: Table = { server, seats: [] };
  openTables.push(table);

  const host = await connectSeat(table);
  const hostToken = once<string>(host.socket, "session:token");
  await send(host, {
    actionId: randomUUID(),
    type: "room:create",
    name: "Host",
  });
  host.token = await hostToken;
  await waitForState(host, (state) => state.phase === "lobby");
  const roomCode = host.state!.roomCode;
  if (rulesMode !== "official") {
    await send(host, {
      actionId: randomUUID(),
      type: "host:set-rules-mode",
      rulesMode,
    });
    await waitForState(host, (state) => state.rulesMode === rulesMode);
  }

  for (let index = 1; index < playerCount; index += 1) {
    const seat = await connectSeat(table);
    const token = once<string>(seat.socket, "session:token");
    await send(seat, {
      actionId: randomUUID(),
      type: "room:join",
      roomCode,
      name: `Player ${index + 1}`,
    });
    seat.token = await token;
    await waitForState(seat, (state) => state.phase === "lobby");
    await send(seat, {
      actionId: randomUUID(),
      type: "player:set-ready",
      ready: true,
    });
  }

  await send(host, { actionId: randomUUID(), type: "game:start" });
  await orientAll(table);
  return table;
}

async function orientAll(table: Table): Promise<void> {
  await Promise.all(
    table.seats.map(async (seat) => {
      await waitForState(seat, (state) => state.phase === "orientation");
      await send(seat, {
        actionId: randomUUID(),
        type: "game:choose-orientation",
        flipped: false,
      });
    }),
  );
  await Promise.all(
    table.seats.map((seat) =>
      waitForState(seat, (state) => state.phase === "playing"),
    ),
  );
}

async function playToResults(table: Table): Promise<void> {
  for (let actions = 0; actions < 500; actions += 1) {
    const state = table.seats[0]!.state!;
    if (state.phase === "round-results" || state.phase === "final") return;
    const actor = seatForActive(table);
    const show = legalShows(actor).sort(
      (left, right) => right.cardIds.length - left.cardIds.length,
    )[0];
    if (show) {
      await send(actor, {
        actionId: randomUUID(),
        type: "game:show",
        cardIds: show.cardIds,
        valueMode: show.valueMode,
      });
    } else {
      expect(actor.state!.availableActions.scout.enabled).toBe(true);
      await send(actor, {
        actionId: randomUUID(),
        type: "game:scout",
        playId: actor.state!.availableActions.scout.playId!,
        position: actor.state!.availableActions.scout.endpoints[0]!,
        insertAt: 0,
        flipped: false,
      });
    }
    await waitForAll(
      table,
      (next) =>
        next.phase !== state.phase ||
        next.activePlayerId !== state.activePlayerId ||
        next.table[0]?.id !== state.table[0]?.id,
    );
  }
  throw new Error("Real-socket game exceeded the 500-action guard");
}

function legalShows(seat: Seat) {
  return seat.state!.availableActions.show.ranges.filter(
    (range) => range.legal,
  );
}

function seatForActive(table: Table): Seat {
  const activeId = table.seats[0]!.state!.activePlayerId;
  const seat = table.seats.find(
    (candidate) => candidate.state?.selfId === activeId,
  );
  if (!seat) throw new Error(`No connected seat for active player ${activeId}`);
  return seat;
}

async function connectSeat(table: Table, token?: string): Promise<Seat> {
  const address = table.server.httpServer.address() as AddressInfo;
  const socket: GameClient = createClient(`http://127.0.0.1:${address.port}`, {
    ...(token ? { auth: { sessionToken: token } } : {}),
    transports: ["websocket"],
    reconnection: false,
  });
  const seat: Seat = { socket, token: token ?? "" };
  socket.on("game:state", (state) => {
    seat.state = state;
  });
  table.seats.push(seat);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out connecting socket")),
      5_000,
    );
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  return seat;
}

function send(seat: Seat, action: ClientAction): Promise<ActionAck> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${action.type}`)),
      5_000,
    );
    const onAck = (ack: ActionAck) => {
      if (ack.actionId !== action.actionId) return;
      cleanup();
      resolve(ack);
    };
    const onError = (error: ProtocolError) => {
      if (error.actionId !== action.actionId) return;
      cleanup();
      reject(new Error(`${error.code}: ${error.message}`));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      seat.socket.off("action:ack", onAck);
      seat.socket.off("game:error", onError);
    };
    seat.socket.on("action:ack", onAck);
    seat.socket.on("game:error", onError);
    seat.socket.emit("game:action", action);
  });
}

function waitForState(
  seat: Seat,
  predicate: (state: PlayerState) => boolean,
): Promise<PlayerState> {
  if (seat.state && predicate(seat.state)) return Promise.resolve(seat.state);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      seat.socket.off("game:state", onState);
      reject(new Error("Timed out waiting for projected state"));
    }, 5_000);
    const onState = (state: PlayerState) => {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      seat.socket.off("game:state", onState);
      resolve(state);
    };
    seat.socket.on("game:state", onState);
  });
}

function waitForAll(
  table: Table,
  predicate: (state: PlayerState) => boolean,
): Promise<PlayerState[]> {
  return Promise.all(
    table.seats
      .filter((seat) => seat.socket.connected)
      .map((seat) => waitForState(seat, predicate)),
  );
}

function once<T>(
  socket: GameClient,
  event: keyof ServerToClientEvents,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      5_000,
    );
    socket.once(event, ((value?: T) => {
      clearTimeout(timeout);
      resolve(value as T);
    }) as never);
  });
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(collectStrings);
}
