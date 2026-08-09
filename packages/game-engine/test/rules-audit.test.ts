import { describe, expect, it } from "vitest";
import {
  RulesError,
  SeededRandomSource,
  applyGameAction,
  applyRoundAction,
  chooseHandOrientation,
  createGame,
  createRoundFromDeck,
  createRoundFromHands,
  createScoutDeck,
  orientCard,
  startNextRound,
  type GameState,
  type OrientedCard,
  type PlayerId,
  type RoundState,
} from "../src/index.js";

function c(low: number, high: number, flipped = false): OrientedCard {
  const card = createScoutDeck().find(
    (candidate) => candidate.low === low && candidate.high === high,
  );
  if (card === undefined) {
    throw new Error(`Missing ${low}-${high}`);
  }
  return orientCard(card, flipped);
}

describe("audited round construction", () => {
  it("rejects the standard variant for both low-level two-seat factories", () => {
    expect(() =>
      createRoundFromDeck(
        ["a", "b"],
        createScoutDeck().slice(0, 22),
        new SeededRandomSource(1),
      ),
    ).toThrow(/two-player variant/i);
    expect(() =>
      createRoundFromHands(
        { a: [c(1, 7)], b: [c(2, 8)] },
        ["a", "b"],
        "a",
      ),
    ).toThrow(/two-player variant/i);
  });

  it("preserves every dealt orientation when false is chosen", () => {
    const before = createRoundFromDeck(
      ["a", "b", "c"],
      createScoutDeck().slice(0, 9),
      new SeededRandomSource(7),
    );
    const hand = before.players.a?.hand;
    expect(hand).toBeDefined();

    const after = chooseHandOrientation(before, "a", false);
    expect(after.players.a?.hand).toEqual(hand);
    expect(after.players.a?.orientationChosen).toBe(true);
  });
});

describe("rulebook Show ladder at the action layer", () => {
  it("enforces length, kind, rank, and strict inequality in that order", () => {
    let state = createRoundFromHands(
      {
        a: [c(1, 7), c(2, 8), c(2, 6), c(2, 10), c(9, 10)],
        b: [
          c(1, 8),
          c(2, 9),
          c(2, 7),
          c(3, 8),
          c(4, 7),
          c(5, 8),
          c(6, 9),
        ],
        c: [c(1, 9), c(1, 10), c(3, 7)],
      },
      ["a", "b", "c"],
      "a",
    );

    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 1 });
    expect(() =>
      applyRoundAction(state, "b", { type: "show", start: 0, end: 1 }),
    ).toThrow(/does not beat/i);

    state = applyRoundAction(state, "b", { type: "show", start: 2, end: 3 });
    expect(state.activeShow?.classification).toEqual({
      kind: "run",
      size: 2,
      rank: 3,
    });

    state = applyRoundAction(state, "c", { type: "show", start: 0, end: 1 });
    expect(state.activeShow?.classification).toEqual({
      kind: "set",
      size: 2,
      rank: 1,
    });

    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 1 });
    expect(state.activeShow?.classification.rank).toBe(2);

    state = applyRoundAction(state, "b", { type: "show", start: 2, end: 4 });
    expect(state.activeShow?.classification).toEqual({
      kind: "run",
      size: 3,
      rank: 6,
    });
  });
});

describe("audited Scout and Scout & Show transitions", () => {
  it("resets opponent Scout tracking when a new player Shows", () => {
    let state = createRoundFromHands(
      {
        a: [c(1, 7), c(2, 8), c(9, 10)],
        b: [c(4, 7)],
        c: [c(3, 8), c(6, 9)],
      },
      ["a", "b", "c"],
      "a",
    );
    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 1 });
    state = applyRoundAction(state, "b", {
      type: "scout",
      side: "left",
      insertAt: 0,
      flipped: false,
    });
    expect(state.activeShow?.scoutedBy).toEqual(["b"]);

    state = applyRoundAction(state, "c", { type: "show", start: 0, end: 0 });
    expect(state.activeShow?.ownerId).toBe("c");
    expect(state.activeShow?.scoutedBy).toEqual([]);
  });

  it("allows Scout & Show after a partial Scout and excludes the scouted card", () => {
    let state = createRoundFromHands(
      {
        a: [c(1, 7), c(2, 8), c(3, 9), c(9, 10)],
        b: [c(5, 7)],
        c: [c(4, 7), c(4, 8), c(6, 9)],
        d: [c(5, 10)],
      },
      ["a", "b", "c", "d"],
      "a",
    );
    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 2 });
    state = applyRoundAction(state, "b", {
      type: "scout",
      side: "right",
      insertAt: 0,
      flipped: false,
    });
    state = applyRoundAction(state, "c", {
      type: "scout-and-show",
      side: "right",
      insertAt: 3,
      flipped: false,
      showStart: 0,
      showEnd: 1,
    });

    expect(state.activeShow?.cards.map((card) => card.card.id)).toEqual([
      "4-7",
      "4-8",
    ]);
    expect(state.activeShow?.scoutedBy).toEqual([]);
    expect(state.players.c?.hand.map((card) => card.card.id)).toContain("2-8");
    expect(state.players.c?.captured.map((card) => card.id)).toEqual(["1-7"]);
  });

  it("allows Scout & Show to establish any valid Show after clearing the table", () => {
    let state = createRoundFromHands(
      {
        a: [c(1, 7), c(9, 10)],
        b: [c(2, 7), c(8, 9)],
        c: [c(3, 8)],
      },
      ["a", "b", "c"],
      "a",
    );
    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 0 });
    state = applyRoundAction(state, "b", {
      type: "scout-and-show",
      side: "left",
      insertAt: 2,
      flipped: false,
      showStart: 0,
      showEnd: 0,
    });

    expect(state.activeShow?.cards[0]?.card.id).toBe("2-7");
    expect(state.players.b?.hand.map((card) => card.card.id)).toContain("1-7");
    expect(state.players.a?.scoutTokens).toBe(1);
  });

  it("rejects scouting one's own active Show", () => {
    let state = createRoundFromHands(
      {
        a: [c(1, 7), c(9, 10)],
        b: [c(2, 8)],
        c: [c(3, 9)],
      },
      ["a", "b", "c"],
      "a",
    );
    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 0 });
    const malformed: RoundState = { ...state, activePlayerId: "a" };
    expect(() =>
      applyRoundAction(malformed, "a", {
        type: "scout",
        side: "left",
        insertAt: 0,
        flipped: false,
      }),
    ).toThrow(/own active show/i);
  });

  it.each([4, 5] as const)(
    "ends a %i-player round after every opponent Scouts",
    (playerCount) => {
      const ids = Array.from({ length: playerCount }, (_, index) => `p${index}`);
      const showSize = playerCount - 1;
      const hands: Record<PlayerId, readonly OrientedCard[]> = {
        p0: [
          ...Array.from({ length: showSize }, (_, index) =>
            c(index + 1, index + 6),
          ),
          c(9, 10),
        ],
      };
      for (let index = 1; index < playerCount; index += 1) {
        hands[`p${index}`] = [c(index, 10)];
      }
      let state = createRoundFromHands(hands, ids, "p0");
      state = applyRoundAction(state, "p0", {
        type: "show",
        start: 0,
        end: showSize - 1,
      });
      for (let index = 1; index < playerCount; index += 1) {
        state = applyRoundAction(state, `p${index}`, {
          type: "scout",
          side: "left",
          insertAt: 0,
          flipped: false,
        });
      }

      expect(state.status.kind).toBe("ended");
      if (state.status.kind === "ended") {
        expect(state.status.result.reason).toBe("all-scouted");
        expect(state.status.result.protectedPlayerId).toBe("p0");
        expect(state.status.result.scores.p0).toBe(playerCount - 1);
        for (let index = 1; index < playerCount; index += 1) {
          expect(state.status.result.scores[`p${index}`]).toBe(-2);
        }
      }
    },
  );
});

describe("audited scoring and game rotation", () => {
  it("combines captures, Scout points, and remaining-card penalties", () => {
    let state = createRoundFromHands(
      {
        a: [c(1, 7), c(2, 8), c(4, 9), c(9, 10)],
        b: [c(5, 7), c(6, 8)],
        c: [c(3, 7), c(7, 8)],
      },
      ["a", "b", "c"],
      "a",
    );
    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 1 });
    state = applyRoundAction(state, "b", {
      type: "scout",
      side: "left",
      insertAt: 2,
      flipped: false,
    });
    state = applyRoundAction(state, "c", { type: "show", start: 0, end: 0 });
    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 0 });
    state = applyRoundAction(state, "b", { type: "show", start: 0, end: 0 });
    state = applyRoundAction(state, "c", { type: "show", start: 0, end: 0 });

    expect(state.status.kind).toBe("ended");
    if (state.status.kind === "ended") {
      expect(state.status.result.scores).toEqual({ a: 1, b: -1, c: 2 });
    }
  });

  it("accumulates round scores and returns every tied winner", () => {
    const rng = new SeededRandomSource(31);
    let game = createGame(["a", "b", "c"], rng);
    for (const winner of ["a", "b", "c"] as const) {
      game = {
        ...game,
        round: createRoundFromHands(
          { a: [c(1, 7)], b: [c(2, 8)], c: [c(3, 9)] },
          ["a", "b", "c"],
          winner,
        ),
      };
      game = applyGameAction(game, winner, {
        type: "show",
        start: 0,
        end: 0,
      });
      if (winner !== "c") {
        game = startNextRound(game, rng);
      }
    }

    expect(game.totals).toEqual({ a: -2, b: -2, c: -2 });
    expect(game.status).toEqual({
      kind: "ended",
      winners: ["a", "b", "c"],
      totals: { a: -2, b: -2, c: -2 },
    });
  });

  it("rotates clockwise from an explicitly chosen starting seat", () => {
    const rng = new SeededRandomSource(41);
    let game = createGame(["a", "b", "c", "d"], rng, "c");
    expect(game.round.startingPlayerId).toBe("c");

    const expected = ["d", "a", "b"];
    for (const startingPlayerId of expected) {
      game = readyForNextRound(game);
      game = startNextRound(game, rng);
      expect(game.round.startingPlayerId).toBe(startingPlayerId);
    }
    expect(() => createGame(["a", "b", "c"], rng, "missing")).toThrow(
      RulesError,
    );
  });

  it("swaps the chosen starting seat in two-player round two", () => {
    const rng = new SeededRandomSource(51);
    let game = createGame(["a", "b"], rng, "b");
    expect(game.round.startingPlayerId).toBe("b");
    game = startNextRound(readyForNextRound(game), rng);
    expect(game.round.startingPlayerId).toBe("a");
  });
});

function readyForNextRound(game: GameState): GameState {
  const scores = Object.fromEntries(game.playerOrder.map((id) => [id, 0]));
  return {
    ...game,
    scoredCurrentRound: true,
    round: {
      ...game.round,
      status: {
        kind: "ended",
        result: {
          reason: "empty-hand",
          winnerId: game.round.startingPlayerId,
          scores,
        },
      },
    },
  };
}
