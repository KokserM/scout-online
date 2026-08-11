import { describe, expect, it } from "vitest";
import {
  RulesError,
  applyRoundAction,
  assertRoundInvariants,
  classifyShow,
  createRoundFromHands,
  createScoutDeck,
  orientCard,
  resolveShowValue,
  selectLegalActions,
  toPrivatePlayerView,
  toPublicRoundView,
  type GameAction,
} from "../src/index.js";

function card(low: number, high: number, flipped = false) {
  const physical = createScoutDeck().find(
    (candidate) => candidate.low === low && candidate.high === high,
  );
  if (!physical) throw new Error(`Missing ${low}-${high}`);
  return orientCard(physical, flipped);
}

function round(rulesMode: "official" | "vosu") {
  return createRoundFromHands(
    {
      a: [card(1, 7), card(2, 7), card(3, 7), card(4, 6)],
      b: [card(4, 8), card(5, 9)],
      c: [card(6, 10)],
    },
    ["a", "b", "c"],
    "a",
    "standard",
    rulesMode,
  );
}

describe("VOSU Show values", () => {
  it("resolves and classifies every card with one uniform value mode", () => {
    const first = card(1, 7);
    expect(resolveShowValue(first, "active")).toBe(1);
    expect(resolveShowValue(first, "opposite")).toBe(7);
    expect(classifyShow([first, card(2, 7)], "active")).toEqual({
      kind: "run",
      size: 2,
      rank: 2,
    });
    expect(classifyShow([first, card(2, 7)], "opposite")).toEqual({
      kind: "set",
      size: 2,
      rank: 7,
    });

    // Active values are 1,7 and opposite values are 5,2. A mixed 1,2 run
    // must not be accepted because a Show has one mode for the whole range.
    expect(classifyShow([card(1, 5), card(2, 7, true)], "active")).toBeNull();
    expect(classifyShow([card(1, 5), card(2, 7, true)], "opposite")).toBeNull();
  });

  it("enumerates the same VOSU range in both classifications", () => {
    const ranges = selectLegalActions(round("vosu"), "a").show.ranges.filter(
      (range) => range.action.start === 0 && range.action.end === 1,
    );
    expect(ranges).toEqual([
      {
        action: { type: "show", start: 0, end: 1, valueMode: "active" },
        valueMode: "active",
        classification: { kind: "run", size: 2, rank: 2 },
        legal: true,
      },
      {
        action: { type: "show", start: 0, end: 1, valueMode: "opposite" },
        valueMode: "opposite",
        classification: { kind: "set", size: 2, rank: 7 },
        legal: true,
      },
    ]);
  });

  it("accepts only active mode in official and requires a valid mode in VOSU", () => {
    expect(() =>
      applyRoundAction(round("official"), "a", {
        type: "show",
        start: 0,
        end: 1,
        valueMode: "opposite",
      }),
    ).toThrow(/official rules only allow active/i);

    const missing = { type: "show", start: 0, end: 1 } as GameAction;
    const forged = {
      type: "show",
      start: 0,
      end: 1,
      valueMode: "mixed",
    } as unknown as GameAction;
    expect(() => applyRoundAction(round("vosu"), "a", missing)).toThrow(
      RulesError,
    );
    expect(() => applyRoundAction(round("vosu"), "a", forged)).toThrow(
      /value mode/i,
    );
  });

  it("stores, projects, and preserves the active mode while scouting", () => {
    let state = applyRoundAction(round("vosu"), "a", {
      type: "show",
      start: 0,
      end: 2,
      valueMode: "opposite",
    });
    expect(state.activeShow?.valueMode).toBe("opposite");
    expect(toPublicRoundView(state).activeShow?.valueMode).toBe("opposite");
    expect(toPrivatePlayerView(state, "b").activeShow?.valueMode).toBe(
      "opposite",
    );

    state = applyRoundAction(state, "b", {
      type: "scout",
      side: "left",
      insertAt: 0,
      flipped: false,
    });
    expect(state.activeShow?.valueMode).toBe("opposite");
    expect(state.activeShow?.classification).toEqual({
      kind: "set",
      size: 2,
      rank: 7,
    });
    assertRoundInvariants(state);
  });
});

describe("VOSU Scout & Show", () => {
  it("keeps Scout & Show unlimited in standard rounds", () => {
    let state = createRoundFromHands(
      {
        a: [card(8, 9), card(8, 10), card(1, 6)],
        b: [card(1, 4), card(2, 5)],
        c: [card(3, 6), card(4, 7)],
        d: [card(5, 7)],
      },
      ["a", "b", "c", "d"],
      "a",
      "standard",
      "vosu",
    );
    state = applyRoundAction(state, "a", {
      type: "show",
      start: 0,
      end: 1,
      valueMode: "active",
    });
    state = applyRoundAction(state, "b", {
      type: "scout",
      side: "left",
      insertAt: 0,
      flipped: false,
    });
    expect(state.activeShow?.scoutedBy).toEqual(["b"]);

    const action = selectLegalActions(state, "c").scoutAndShow.actions[0];
    expect(action).toBeDefined();
    if (!action) return;

    state = applyRoundAction(state, "c", action);
    expect(state.status.kind).toBe("active");
    expect(state.players.c?.scoutAndShowAvailable).toBe(true);
    expect(state.players.a?.scoutTokens).toBe(2);
    expect(state.activeShow?.scoutedBy).toEqual([]);
    assertRoundInvariants(state);

    const repeated = selectLegalActions(state, "d").scoutAndShow.actions[0];
    expect(repeated).toBeDefined();
    if (!repeated) return;
    state = applyRoundAction(state, "d", repeated);
    expect(state.status.kind).toBe("active");
    expect(state.players.d?.scoutAndShowAvailable).toBe(true);
    expect(state.activeShow?.ownerId).toBe("d");
    assertRoundInvariants(state);
  });

  it("ends all-Scouted with the Show owner protected and exact Võsu scores", () => {
    const playerCount = 5;
    const ids = Array.from({ length: playerCount }, (_, index) => `p${index}`);
    const hands = {
      p0: [card(1, 6), card(2, 7), card(3, 8), card(4, 9), card(9, 10)],
      p1: [card(1, 10)],
      p2: [card(2, 10)],
      p3: [card(3, 10)],
      p4: [card(4, 10)],
    };
    let state = createRoundFromHands(
      hands,
      ids,
      "p0",
      "standard",
      "vosu",
    );
    state = applyRoundAction(state, "p0", {
      type: "show",
      start: 0,
      end: 3,
      valueMode: "opposite",
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
      expect(state.status.result.scores).toEqual({
        p0: 4,
        p1: -2,
        p2: -2,
        p3: -2,
        p4: -2,
      });
    }
    assertRoundInvariants(state);
  });

  it("spends one two-player chip, awards no Scout point, and passes turn", () => {
    let state = createRoundFromHands(
      {
        a: [card(8, 10), card(7, 9)],
        b: [card(1, 4), card(2, 5)],
      },
      ["a", "b"],
      "a",
      "two-player",
      "vosu",
    );
    state = applyRoundAction(state, "a", {
      type: "show",
      start: 0,
      end: 0,
      valueMode: "active",
    });
    state = applyRoundAction(state, "b", {
      type: "scout-and-show",
      side: "left",
      insertAt: 0,
      flipped: false,
      showStart: 1,
      showEnd: 1,
      valueMode: "active",
    });

    expect(state.players.b?.twoPlayerScoutChips).toBe(2);
    expect(state.players.a?.scoutTokens).toBe(0);
    expect(state.activePlayerId).toBe("a");
    expect(state.players.b?.scoutAndShowAvailable).toBe(true);
    assertRoundInvariants(state);

    state = applyRoundAction(state, "a", {
      type: "show",
      start: 0,
      end: 0,
      valueMode: "active",
    });
    expect(state.status.kind).toBe("ended");
    if (state.status.kind === "ended") {
      expect(state.status.result.scores).toEqual({ a: 4, b: 0 });
    }
  });

  it("blocks Scout and combined actions when no two-player chips remain", () => {
    let state = createRoundFromHands(
      {
        a: [card(8, 10), card(7, 9)],
        b: [card(1, 4), card(2, 5)],
      },
      ["a", "b"],
      "a",
      "two-player",
      "vosu",
    );
    state = applyRoundAction(state, "a", {
      type: "show",
      start: 0,
      end: 0,
      valueMode: "active",
    });
    state = {
      ...state,
      players: {
        ...state.players,
        b: {
          ...state.players.b!,
          twoPlayerScoutChips: 0,
          scoutAndShowAvailable: false,
        },
      },
    };

    const legal = selectLegalActions(state, "b");
    expect(legal.scout.disabledReason).toBe("no-scout-chips");
    expect(legal.scoutAndShow.disabledReason).toBe("no-scout-chips");
    expect(() =>
      applyRoundAction(state, "b", {
        type: "scout-and-show",
        side: "left",
        insertAt: 0,
        flipped: false,
        showStart: 0,
        showEnd: 0,
        valueMode: "active",
      }),
    ).toThrow(/no two-player Scout chips/i);
    assertRoundInvariants(state);
  });

  it("preserves the official two-player prohibition", () => {
    let state = createRoundFromHands(
      { a: [card(8, 10), card(7, 9)], b: [card(1, 4), card(2, 5)] },
      ["a", "b"],
      "a",
      "two-player",
      "official",
    );
    state = applyRoundAction(state, "a", {
      type: "show",
      start: 0,
      end: 0,
      valueMode: "active",
    });
    expect(selectLegalActions(state, "b").scoutAndShow.disabledReason).toBe(
      "wrong-variant",
    );
  });
});
