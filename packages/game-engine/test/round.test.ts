import { describe, expect, it } from "vitest";
import {
  RulesError,
  SeededRandomSource,
  applyRoundAction,
  assertRoundInvariants,
  chooseHandOrientation,
  createRoundFromDeck,
  createRoundFromHands,
  createScoutDeck,
  orientCard,
  visibleValues,
  type OrientedCard,
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

describe("round setup and immutable hands", () => {
  it("deals evenly and permits exactly one whole-hand orientation choice", () => {
    const deck = createScoutDeck().slice(0, 9);
    let state = createRoundFromDeck(
      ["a", "b", "c"],
      deck,
      new SeededRandomSource(1),
    );
    expect(state.players.a?.hand).toHaveLength(3);
    const before = state.players.a?.hand ?? [];
    state = chooseHandOrientation(state, "a", true);
    expect(state.players.a?.hand.map((card) => card.card.id)).toEqual(
      [...before].reverse().map((card) => card.card.id),
    );
    expect(() => chooseHandOrientation(state, "a", false)).toThrow(RulesError);
    assertRoundInvariants(state);
  });

  it("requires orientation before a player's first action", () => {
    const state = createRoundFromDeck(
      ["a", "b", "c"],
      createScoutDeck().slice(0, 9),
      new SeededRandomSource(2),
    );
    expect(() =>
      applyRoundAction(state, "a", { type: "show", start: 0, end: 0 }),
    ).toThrow(/orientation/i);
  });
});

describe("standard actions and scoring", () => {
  function standardRound(): RoundState {
    return createRoundFromHands(
      {
        a: [c(1, 7), c(2, 8), c(3, 9), c(8, 10)],
        b: [c(4, 7), c(5, 8)],
        c: [c(6, 9), c(7, 10)],
      },
      ["a", "b", "c"],
      "a",
    );
  }

  it("shows contiguous cards, scouts only an edge, and inserts orientation", () => {
    let state = standardRound();
    state = applyRoundAction(state, "a", {
      type: "show",
      start: 0,
      end: 2,
    });
    expect(state.activeShow?.classification).toEqual({
      kind: "run",
      size: 3,
      rank: 3,
    });
    state = applyRoundAction(state, "b", {
      type: "scout",
      side: "right",
      insertAt: 1,
      flipped: true,
    });
    expect(visibleValues(state.players.b?.hand ?? [])).toEqual([4, 9, 5]);
    expect(state.players.a?.scoutTokens).toBe(1);
    expect(state.activeShow?.classification.size).toBe(2);
    assertRoundInvariants(state);
  });

  it("ends when every opponent scouts and protects the show owner", () => {
    let state = standardRound();
    state = applyRoundAction(state, "a", {
      type: "show",
      start: 0,
      end: 2,
    });
    state = applyRoundAction(state, "b", {
      type: "scout",
      side: "left",
      insertAt: 0,
      flipped: false,
    });
    state = applyRoundAction(state, "c", {
      type: "scout",
      side: "left",
      insertAt: 0,
      flipped: false,
    });
    expect(state.status.kind).toBe("ended");
    if (state.status.kind === "ended") {
      expect(state.status.result.reason).toBe("all-scouted");
      expect(state.status.result.winnerId).toBe("a");
      expect(state.status.result.scores).toEqual({ a: 2, b: -3, c: -3 });
    }
    assertRoundInvariants(state);
  });

  it("ends for an unbeaten Show even when the final Scout clears the table", () => {
    let state = createRoundFromHands(
      {
        a: [c(1, 7), c(2, 8), c(9, 10)],
        b: [c(4, 7)],
        c: [c(5, 8)],
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
    state = applyRoundAction(state, "c", {
      type: "scout",
      side: "left",
      insertAt: 0,
      flipped: false,
    });
    expect(state.activeShow).toBeNull();
    expect(state.status.kind).toBe("ended");
    if (state.status.kind === "ended") {
      expect(state.status.result.reason).toBe("all-scouted");
      expect(state.status.result.protectedPlayerId).toBe("a");
    }
  });

  it("captures the previous show and ends immediately on an empty hand", () => {
    let state = createRoundFromHands(
      {
        a: [c(1, 7), c(2, 8), c(6, 10)],
        b: [c(4, 8), c(4, 9)],
        c: [c(3, 7)],
      },
      ["a", "b", "c"],
      "a",
    );
    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 1 });
    state = applyRoundAction(state, "b", { type: "show", start: 0, end: 1 });
    expect(state.status.kind).toBe("ended");
    expect(state.players.b?.captured.map((card) => card.id)).toEqual([
      "1-7",
      "2-8",
    ]);
    if (state.status.kind === "ended") {
      expect(state.status.result.scores.b).toBe(2);
      expect(state.status.result.scores.a).toBe(-1);
    }
  });

  it("makes Scout & Show transactional and consumes it only on success", () => {
    let state = createRoundFromHands(
      {
        a: [c(1, 7), c(2, 8), c(9, 10)],
        b: [c(3, 7), c(4, 8), c(5, 9)],
        c: [c(6, 10)],
      },
      ["a", "b", "c"],
      "a",
    );
    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 1 });
    const snapshot = structuredClone(state);
    expect(() =>
      applyRoundAction(state, "b", {
        type: "scout-and-show",
        side: "left",
        insertAt: 0,
        flipped: false,
        showStart: 99,
        showEnd: 99,
      }),
    ).toThrow(RulesError);
    expect(state).toEqual(snapshot);

    state = applyRoundAction(state, "b", {
      type: "scout-and-show",
      side: "left",
      insertAt: 0,
      flipped: false,
      showStart: 1,
      showEnd: 2,
    });
    expect(state.players.b?.scoutAndShowAvailable).toBe(false);
    expect(state.players.a?.scoutTokens).toBe(1);
    expect(state.players.b?.captured).toHaveLength(1);
    assertRoundInvariants(state);
  });
});

describe("official two-player turn rules", () => {
  it("spends a chip, awards no opponent token, and keeps the same turn", () => {
    let state = createRoundFromHands(
      {
        a: [c(8, 10), c(1, 5)],
        b: [c(1, 4), c(2, 6)],
      },
      ["a", "b"],
      "a",
      "two-player",
    );
    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 0 });
    state = applyRoundAction(state, "b", {
      type: "scout",
      side: "left",
      insertAt: 1,
      flipped: false,
    });
    expect(state.activePlayerId).toBe("b");
    expect(state.players.b?.twoPlayerScoutChips).toBe(2);
    expect(state.players.a?.scoutTokens).toBe(0);
    expect(state.activeShow).toBeNull();
  });

  it("allows one player to spend all three chips on consecutive Scout turns", () => {
    let state = createRoundFromHands(
      {
        a: [c(7, 8), c(8, 9), c(9, 10), c(1, 10)],
        b: [c(1, 4), c(2, 6)],
      },
      ["a", "b"],
      "a",
      "two-player",
    );
    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 2 });

    for (const chips of [2, 1, 0]) {
      state = applyRoundAction(state, "b", {
        type: "scout",
        side: "left",
        insertAt: 0,
        flipped: false,
      });
      expect(state.activePlayerId).toBe("b");
      expect(state.players.b?.twoPlayerScoutChips).toBe(chips);
      expect(state.players.a?.scoutTokens).toBe(0);
    }
    expect(state.activeShow).toBeNull();
    expect(state.status.kind).toBe("active");
  });

  it("ends when the next player cannot show and has no chips", () => {
    let state = createRoundFromHands(
      {
        a: [c(8, 9), c(9, 10), c(1, 10)],
        b: [c(1, 4), c(2, 6)],
      },
      ["a", "b"],
      "a",
      "two-player",
    );
    const b = state.players.b;
    expect(b).toBeDefined();
    if (b === undefined) {
      return;
    }
    state = {
      ...state,
      players: { ...state.players, b: { ...b, twoPlayerScoutChips: 0 } },
    };
    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 1 });
    expect(state.status.kind).toBe("ended");
    if (state.status.kind === "ended") {
      expect(state.status.result.reason).toBe("two-player-stuck");
      expect(state.status.result.winnerId).toBe("a");
      expect(state.status.result.scores.a).toBe(2);
      expect(state.status.result.scores.b).toBe(-2);
      expect(state.status.result.protectedPlayerId).toBeUndefined();
    }
  });

  it("forbids Scout & Show in the two-player variant", () => {
    let state = createRoundFromHands(
      { a: [c(1, 7), c(3, 9)], b: [c(2, 8), c(4, 10)] },
      ["a", "b"],
      "a",
      "two-player",
    );
    state = applyRoundAction(state, "a", { type: "show", start: 0, end: 0 });
    expect(() =>
      applyRoundAction(state, "b", {
        type: "scout-and-show",
        side: "left",
        insertAt: 0,
        flipped: false,
        showStart: 0,
        showEnd: 0,
      }),
    ).toThrow(/not used/i);
  });
});
