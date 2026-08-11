import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGameEngine } from "../src/game-engine-adapter.js";
import { InMemoryRoomRepository } from "../src/room-repository.js";
import { RoomService, ServiceError } from "../src/room-service.js";

describe("game-engine adapter", () => {
  it("projects dual VOSU hints and broadcasts the stored table mode", () => {
    const engine = createGameEngine({ chooseStartingPlayer: (ids) => ids[0]! });
    const first = randomUUID();
    const second = randomUUID();
    let state = engine.createGame([first, second], "vosu");
    for (const playerId of [first, second]) {
      state = engine.applyAction(state, playerId, {
        actionId: randomUUID(),
        type: "game:choose-orientation",
        flipped: false,
      });
    }

    const view = engine.getPlayerView(state, first);
    const firstCardId = view.hand[0]!.id;
    const singleModes = view.availableActions.show.ranges
      .filter(
        (range) =>
          range.cardIds.length === 1 && range.cardIds[0] === firstCardId,
      )
      .map((range) => range.valueMode);
    expect(singleModes).toEqual(["active", "opposite"]);

    state = engine.applyAction(state, first, {
      actionId: randomUUID(),
      type: "game:show",
      cardIds: [firstCardId],
      valueMode: "opposite",
    });
    expect(engine.getPlayerView(state, first).table[0]?.valueMode).toBe(
      "opposite",
    );
    expect(engine.getPlayerView(state, second).table[0]?.valueMode).toBe(
      "opposite",
    );
  });

  it("maps engine orientation and private views onto the shared protocol", () => {
    const engine = createGameEngine();
    const first = randomUUID();
    const second = randomUUID();
    let state = engine.createGame([first, second]);
    const firstView = engine.getPlayerView(state, first);
    const secondView = engine.getPlayerView(state, second);
    expect(firstView.phase).toBe("orientation");
    expect(firstView.rulesMode).toBe("official");
    expect(firstView.hand).not.toEqual(secondView.hand);
    expect(
      engine.getPlayerView(engine.createGame([first, second], "vosu"), first)
        .rulesMode,
    ).toBe("vosu");

    state = engine.applyAction(state, first, {
      actionId: randomUUID(),
      type: "game:choose-orientation",
      flipped: false,
    });
    expect(engine.getPlayerView(state, first).phase).toBe("orientation");
    state = engine.applyAction(state, second, {
      actionId: randomUUID(),
      type: "game:choose-orientation",
      flipped: true,
    });
    const projected = engine.getPlayerView(state, first);
    const starter = projected.startingPlayerId!;
    const opponent = starter === first ? second : first;
    const playingView = engine.getPlayerView(state, starter);
    expect(playingView.phase).toBe("playing");
    expect(playingView.availableActions.show.enabled).toBe(true);
    const ownIds = new Set(playingView.hand.map((card) => card.id));
    for (const range of playingView.availableActions.show.ranges) {
      expect(range.cardIds.every((id) => ownIds.has(id))).toBe(true);
    }
    for (const hidden of engine.getPlayerView(state, opponent).hand) {
      expect(JSON.stringify(playingView.availableActions)).not.toContain(
        hidden.id,
      );
    }
  });

  it("rejects out-of-turn and forged-card actions through the authoritative service", () => {
    const service = new RoomService(
      new InMemoryRoomRepository(),
      createGameEngine(),
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
    for (const session of [host, guest]) {
      service.perform(session.sessionToken, {
        actionId: randomUUID(),
        type: "game:choose-orientation",
        flipped: false,
      });
    }

    const hostView = service.stateFor(host.room!, host.player!.id);
    const active = hostView.activePlayerId === host.player!.id ? host : guest;
    const inactive = active === host ? guest : host;
    const inactiveCard = service.stateFor(host.room!, inactive.player!.id)
      .hand[0]!;
    expect(() =>
      service.perform(inactive.sessionToken, {
        actionId: randomUUID(),
        type: "game:show",
        cardIds: [inactiveCard.id],
        valueMode: "active",
      }),
    ).toThrowError(ServiceError);
    expect(() =>
      service.perform(active.sessionToken, {
        actionId: randomUUID(),
        type: "game:show",
        cardIds: ["forged-card"],
        valueMode: "active",
      }),
    ).toThrowError(ServiceError);
  });

  it("serializes projections without opponent cards, orientations, tokens, or deck state", () => {
    const service = new RoomService(
      new InMemoryRoomRepository(),
      createGameEngine(),
    );
    const seats = ["Alpha", "Bravo", "Charlie"].map((name, index) =>
      index === 0
        ? service.perform(undefined, {
            actionId: randomUUID(),
            type: "room:create",
            name,
          })
        : undefined,
    );
    const host = seats[0]!;
    const bravo = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:join",
      roomCode: host.room!.code,
      name: "Bravo",
    });
    const charlie = service.perform(undefined, {
      actionId: randomUUID(),
      type: "room:join",
      roomCode: host.room!.code,
      name: "Charlie",
    });
    for (const seat of [bravo, charlie]) {
      service.perform(seat.sessionToken, {
        actionId: randomUUID(),
        type: "player:set-ready",
        ready: true,
      });
    }
    service.perform(host.sessionToken, {
      actionId: randomUUID(),
      type: "game:start",
    });

    const views = [host, bravo, charlie].map((seat) =>
      service.stateFor(host.room!, seat.player!.id),
    );
    for (let viewer = 0; viewer < views.length; viewer += 1) {
      const serialized = JSON.stringify(views[viewer]);
      const projectedStrings = collectStrings(views[viewer]);
      expect(serialized).not.toContain("sessionToken");
      expect(serialized).not.toContain("token");
      expect(serialized).not.toContain("initialCardIds");
      expect(serialized).not.toContain("twoPlayerRoundDecks");
      expect(views[viewer]!.hand.every((card) => !("flipped" in card))).toBe(
        true,
      );
      for (let opponent = 0; opponent < views.length; opponent += 1) {
        if (opponent === viewer) continue;
        for (const card of views[opponent]!.hand) {
          expect(projectedStrings).not.toContain(card.id);
        }
      }
    }
    expect(views.every((view) => view.startingPlayerId !== undefined)).toBe(
      true,
    );

    const sessions = [host, bravo, charlie];
    for (const seat of sessions) {
      service.perform(seat.sessionToken, {
        actionId: randomUUID(),
        type: "game:choose-orientation",
        flipped: false,
      });
    }
    const activeId = service.stateFor(
      host.room!,
      host.player!.id,
    ).activePlayerId!;
    const activeSeat = sessions.find((seat) => seat.player!.id === activeId)!;
    const activeView = service.stateFor(host.room!, activeId);
    const activeRange = activeView.availableActions.show.ranges.find(
      (range) => range.legal && range.cardIds.length === 1,
    )!;
    service.perform(activeSeat.sessionToken, {
      actionId: randomUUID(),
      type: "game:show",
      cardIds: activeRange.cardIds,
      valueMode: activeRange.valueMode,
    });
    const afterShow = service.stateFor(host.room!, host.player!.id);
    const scoutedCardId = afterShow.table[0]!.cards[0]!.id;
    const scoutSeat = sessions.find(
      (seat) => seat.player!.id === afterShow.activePlayerId,
    )!;
    const scoutView = service.stateFor(host.room!, scoutSeat.player!.id);
    service.perform(scoutSeat.sessionToken, {
      actionId: randomUUID(),
      type: "game:scout",
      playId: scoutView.availableActions.scout.playId!,
      position: scoutView.availableActions.scout.endpoints[0]!,
      insertAt: 0,
      flipped: false,
    });
    const observer = sessions.find(
      (seat) => seat.player!.id !== scoutSeat.player!.id,
    )!;
    expect(
      collectStrings(service.stateFor(host.room!, observer.player!.id)),
    ).not.toContain(scoutedCardId);
  });
});

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(collectStrings);
}
