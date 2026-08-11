import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Card, GameAction, RulesMode } from "@grandstand/shared";
import type {
  EnginePlayerView,
  GameEngine,
} from "../src/game-engine-adapter.js";
import { InMemoryRoomRepository } from "../src/room-repository.js";
import { RoomService, ServiceError } from "../src/room-service.js";

interface FakeState {
  playerIds: readonly string[];
  hands: Readonly<Record<string, Card[]>>;
  activePlayerId: string;
  phase: "orientation" | "playing" | "round-results" | "final";
  rulesMode: RulesMode;
}

const fakeEngine: GameEngine = {
  createGame(playerIds, rulesMode = "official") {
    const hands = Object.fromEntries(
      playerIds.map((playerId, index) => [
        playerId,
        [
          {
            id: randomUUID(),
            top: index + 1,
            bottom: 10 - index,
            suit: "coral" as const,
          },
        ],
      ]),
    );
    const activePlayerId = playerIds[0];
    if (!activePlayerId) throw new Error("Players required");
    return {
      playerIds,
      hands,
      activePlayerId,
      phase: "orientation",
      rulesMode,
    } satisfies FakeState;
  },
  applyAction(state, _playerId, action) {
    const current = asFakeState(state);
    if (action.type === "game:choose-orientation")
      return { ...current, phase: "playing" };
    return current;
  },
  getPlayerView(state, playerId): EnginePlayerView {
    const current = asFakeState(state);
    return {
      phase: current.phase,
      round: 1,
      totalRounds: current.playerIds.length,
      rulesMode: current.rulesMode,
      variant: current.playerIds.length === 2 ? "two-player" : "standard",
      hand: current.hands[playerId] ?? [],
      table: [],
      activePlayerId: current.activePlayerId,
      players: Object.fromEntries(
        current.playerIds.map((id) => [
          id,
          {
            score: 0,
            handCount: current.hands[id]?.length ?? 0,
            capturedCount: 0,
            scoutPoints: 0,
            scoutAndShowAvailable: current.playerIds.length > 2,
            scoutChips: current.playerIds.length === 2 ? 3 : 0,
          },
        ]),
      ),
      availableActions: {
        show: {
          enabled: false,
          disabledReason: "not-active-player",
          ranges: [],
        },
        scout: {
          enabled: false,
          disabledReason: "no-active-show",
          endpoints: [],
          insertionCount: 0,
          flipped: [],
        },
        scoutAndShow: {
          enabled: false,
          disabledReason: "no-active-show",
          options: [],
        },
      },
      activity: [],
    };
  },
  chooseBotAction(_state, _playerId): GameAction | undefined {
    return undefined;
  },
};

describe("RoomService", () => {
  it("defaults rooms and Quick Play games to official rules", () => {
    const service = new RoomService(new InMemoryRoomRepository(), fakeEngine);
    const created = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:create",
      name: "Host",
    });
    const quickPlay = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:quick-play",
      name: "Quick Host",
    });

    expect(created.room!.rulesMode).toBe("official");
    expect(service.stateFor(created.room!, created.player!.id).rulesMode).toBe(
      "official",
    );
    expect(quickPlay.room!.rulesMode).toBe("official");
    expect((quickPlay.room!.engineState as FakeState).rulesMode).toBe(
      "official",
    );
  });

  it("allows only the host to update rules mode in the lobby and projects it", () => {
    const service = new RoomService(new InMemoryRoomRepository(), fakeEngine);
    const host = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:create",
      name: "Host",
    });
    const guest = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:join",
      roomCode: host.room!.code,
      name: "Guest",
    });

    expect(() =>
      service.perform(guest.sessionToken, {
        actionId: randomUUID(),
        type: "host:set-rules-mode",
        rulesMode: "vosu",
      }),
    ).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));

    service.perform(host.sessionToken, {
      actionId: randomUUID(),
      type: "host:set-rules-mode",
      rulesMode: "vosu",
    });
    expect(host.room!.rulesMode).toBe("vosu");
    expect(service.stateFor(host.room!, guest.player!.id).rulesMode).toBe(
      "vosu",
    );
    expect(host.room!.activity.at(-1)?.message).toMatch(/Võsu/u);
  });

  it("locks rules mode after start and preserves it through rematch", () => {
    const service = new RoomService(new InMemoryRoomRepository(), fakeEngine);
    const host = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:create",
      name: "Host",
    });
    const guest = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:join",
      roomCode: host.room!.code,
      name: "Guest",
    });
    service.perform(guest.sessionToken, {
      actionId: randomUUID(),
      type: "player:set-ready",
      ready: true,
    });
    service.perform(host.sessionToken, {
      actionId: randomUUID(),
      type: "host:set-rules-mode",
      rulesMode: "vosu",
    });
    service.perform(host.sessionToken, {
      actionId: randomUUID(),
      type: "game:start",
    });

    expect((host.room!.engineState as FakeState).rulesMode).toBe("vosu");
    expect(service.stateFor(host.room!, host.player!.id).rulesMode).toBe(
      "vosu",
    );
    expect(() =>
      service.perform(host.sessionToken, {
        actionId: randomUUID(),
        type: "host:set-rules-mode",
        rulesMode: "official",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_STATE" }));

    host.room!.engineState = {
      ...(host.room!.engineState as FakeState),
      phase: "final",
    };
    service.perform(host.sessionToken, {
      actionId: randomUUID(),
      type: "game:rematch",
    });
    expect(host.room!.rulesMode).toBe("vosu");
    expect(service.stateFor(host.room!, host.player!.id).rulesMode).toBe(
      "vosu",
    );

    for (const sessionToken of [host.sessionToken, guest.sessionToken]) {
      service.perform(sessionToken, {
        actionId: randomUUID(),
        type: "player:set-ready",
        ready: true,
      });
    }
    service.perform(host.sessionToken, {
      actionId: randomUUID(),
      type: "game:start",
    });
    expect((host.room!.engineState as FakeState).rulesMode).toBe("vosu");
  });

  it("creates secure sessions and emits only the viewer's private hand", () => {
    const repository = new InMemoryRoomRepository();
    const service = new RoomService(repository, fakeEngine);
    const created = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:create",
      name: "Host",
    });
    const joined = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:join",
      roomCode: created.room!.code,
      name: "Guest",
    });
    expect(created.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(created.room!.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/u);

    service.perform(created.sessionToken, {
      actionId: randomUUID(),
      type: "player:set-ready",
      ready: true,
    });
    service.perform(joined.sessionToken, {
      actionId: randomUUID(),
      type: "player:set-ready",
      ready: true,
    });
    service.perform(created.sessionToken, {
      actionId: randomUUID(),
      type: "game:start",
    });

    const hostState = service.stateFor(created.room!, created.player!.id);
    const guestState = service.stateFor(created.room!, joined.player!.id);
    expect(hostState.hand).toHaveLength(1);
    expect(guestState.hand).toHaveLength(1);
    expect(hostState.hand[0]?.id).not.toBe(guestState.hand[0]?.id);
    expect(JSON.stringify(hostState)).not.toContain(guestState.hand[0]?.id);
    expect(JSON.stringify(guestState)).not.toContain(hostState.hand[0]?.id);
    expect(JSON.stringify(hostState)).not.toContain(created.sessionToken);
    expect(JSON.stringify(hostState)).not.toContain(joined.sessionToken);
  });

  it("deduplicates repeated action IDs and rejects conflicting reuse", () => {
    const service = new RoomService(new InMemoryRoomRepository(), fakeEngine);
    const created = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:create",
      name: "Host",
    });
    const actionId = randomUUID();
    const action = {
      actionId,
      type: "host:add-bot" as const,
      name: "Scout Bot",
      difficulty: "easy" as const,
    };
    expect(service.perform(created.sessionToken, action).ack.duplicate).toBe(
      false,
    );
    expect(service.perform(created.sessionToken, action).ack.duplicate).toBe(
      true,
    );
    expect(created.room!.players.size).toBe(2);
    expect(() =>
      service.perform(created.sessionToken, {
        actionId,
        type: "host:add-bot",
        name: "Different Bot",
        difficulty: "standard",
      }),
    ).toThrowError(ServiceError);
  });

  it("retains replay protection well beyond the former tiny cache window", () => {
    const service = new RoomService(new InMemoryRoomRepository(), fakeEngine);
    const created = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:create",
      name: "Host",
    });
    const first = {
      actionId: randomUUID(),
      type: "player:set-ready" as const,
      ready: false,
    };
    service.perform(created.sessionToken, first);
    for (let index = 0; index < 1_100; index += 1) {
      service.perform(created.sessionToken, {
        actionId: randomUUID(),
        type: "player:set-ready",
        ready: index % 2 === 0,
      });
    }
    expect(service.perform(created.sessionToken, first).ack.duplicate).toBe(
      true,
    );
  });

  it("keeps disconnected players through grace and then expires them", () => {
    let now = 1_000;
    const service = new RoomService(new InMemoryRoomRepository(), fakeEngine, {
      reconnectGraceMs: 500,
      now: () => now,
    });
    const created = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:create",
      name: "Host",
    });
    service.disconnect(created.sessionToken!);
    now += 499;
    expect(service.expireDisconnected(created.sessionToken!)).toBeUndefined();
    expect(service.resume(created.sessionToken!)).toBeDefined();
    service.disconnect(created.sessionToken!);
    now += 501;
    expect(service.expireDisconnected(created.sessionToken!)).toBeUndefined();
    expect(() => service.resume(created.sessionToken!)).toThrowError(
      expect.objectContaining({ code: "SEAT_LOST" }),
    );
  });

  it("deletes an empty lobby after its last player leaves", () => {
    const repository = new InMemoryRoomRepository();
    const service = new RoomService(repository, fakeEngine);
    const created = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:create",
      name: "Host",
    });
    const result = service.perform(created.sessionToken, {
      actionId: randomUUID(),
      type: "room:leave",
    });
    expect(result.room).toBeUndefined();
    expect(repository.get(created.room!.code)).toBeUndefined();
    expect(repository.getBySessionToken(created.sessionToken!)).toBeUndefined();
  });

  it("keeps leave idempotent after the session and room are retired", () => {
    const service = new RoomService(new InMemoryRoomRepository(), fakeEngine);
    const created = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:create",
      name: "Host",
    });
    const action = { actionId: randomUUID(), type: "room:leave" as const };
    expect(service.perform(created.sessionToken, action).ack.duplicate).toBe(
      false,
    );
    expect(service.perform(created.sessionToken, action).ack.duplicate).toBe(
      true,
    );
  });

  it("converts an active leaver to a bot and drains through its turn", () => {
    let botActions = 0;
    const drainingEngine: GameEngine = {
      ...fakeEngine,
      applyAction(state, _playerId, action) {
        const current = asFakeState(state);
        if (action.type === "game:show") {
          botActions += 1;
          return { ...current, activePlayerId: current.playerIds[1]! };
        }
        return { ...current, phase: "playing" };
      },
      chooseBotAction() {
        return {
          actionId: randomUUID(),
          type: "game:show",
          cardIds: [randomUUID()],
          valueMode: "active",
        };
      },
    };
    const service = new RoomService(
      new InMemoryRoomRepository(),
      drainingEngine,
    );
    const host = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:create",
      name: "Host",
    });
    const guest = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:join",
      roomCode: host.room!.code,
      name: "Guest",
    });
    service.perform(guest.sessionToken, {
      actionId: randomUUID(),
      type: "player:set-ready",
      ready: true,
    });
    service.perform(host.sessionToken, {
      actionId: randomUUID(),
      type: "game:start",
    });
    host.room!.engineState = {
      ...(host.room!.engineState as FakeState),
      phase: "playing",
    };

    service.perform(host.sessionToken, {
      actionId: randomUUID(),
      type: "room:leave",
    });
    expect(host.player!.isBot).toBe(true);
    expect(botActions).toBe(1);
    expect((host.room!.engineState as FakeState).activePlayerId).toBe(
      guest.player!.id,
    );
  });

  it("returns an actionable seat-lost error after active-game grace expiry", () => {
    let now = 1_000;
    const service = new RoomService(new InMemoryRoomRepository(), fakeEngine, {
      reconnectGraceMs: 10,
      now: () => now,
    });
    const host = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:create",
      name: "Host",
    });
    const guest = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:join",
      roomCode: host.room!.code,
      name: "Guest",
    });
    service.perform(guest.sessionToken, {
      actionId: randomUUID(),
      type: "player:set-ready",
      ready: true,
    });
    service.perform(host.sessionToken, {
      actionId: randomUUID(),
      type: "game:start",
    });
    service.disconnect(guest.sessionToken!);
    now += 11;
    service.expireDisconnected(guest.sessionToken!);
    expect(() => service.resume(guest.sessionToken!)).toThrowError(
      expect.objectContaining({ code: "SEAT_LOST" }),
    );
  });
});

function asFakeState(state: unknown): FakeState {
  if (typeof state !== "object" || state === null || !("playerIds" in state))
    throw new Error("Bad fake state");
  return state as FakeState;
}
