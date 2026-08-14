import { describe, expect, it } from "vitest";
import {
  applyRoundAction,
  createRoundFromHands,
  createScoutDeck,
  orientCard,
  selectLegalActions,
} from "../src/index.js";

function card(low: number, high: number, flipped = false) {
  const found = createScoutDeck().find(
    (candidate) => candidate.low === low && candidate.high === high,
  );
  if (!found) throw new Error("missing test card");
  return orientCard(found, flipped);
}

describe("legal action selectors", () => {
  it("returns exact contiguous Show ranges and preserves too-weak patterns", () => {
    let round = createRoundFromHands(
      {
        a: [card(4, 10)],
        b: [card(1, 7), card(2, 8), card(3, 9), card(1, 10)],
        c: [card(5, 8)],
      },
      ["a", "b", "c"],
      "a",
    );
    round = applyRoundAction(round, "a", { type: "show", start: 0, end: 0 });

    const selected = selectLegalActions(round, "b");
    expect(selected.show.ranges).toContainEqual({
      action: { type: "show", start: 0, end: 2, valueMode: "active" },
      valueMode: "active",
      classification: { kind: "run", size: 3, rank: 3 },
      legal: true,
    });
    expect(selected.show.ranges).toContainEqual({
      action: { type: "show", start: 0, end: 0, valueMode: "active" },
      valueMode: "active",
      classification: { kind: "single", size: 1, rank: 1 },
      legal: false,
    });
    expect(selected.show.ranges).not.toContainEqual(
      expect.objectContaining({
        action: {
          type: "show",
          start: 2,
          end: 3,
          valueMode: "active",
        },
      }),
    );
  });

  it("enumerates Scout endpoints, insertions, orientations, and combined shows", () => {
    let round = createRoundFromHands(
      {
        a: [card(4, 8), card(4, 9), card(7, 10)],
        b: [card(3, 7), card(5, 10)],
        c: [card(6, 9)],
      },
      ["a", "b", "c"],
      "a",
    );
    round = applyRoundAction(round, "a", { type: "show", start: 0, end: 1 });

    const selected = selectLegalActions(round, "b");
    expect(selected.scout.disabledReason).toBeUndefined();
    expect(selected.scout.actions).toHaveLength(12);
    expect(
      new Set(selected.scout.actions.map((action) => action.side)),
    ).toEqual(new Set(["left", "right"]));
    expect(
      new Set(selected.scout.actions.map((action) => action.insertAt)),
    ).toEqual(new Set([0, 1, 2]));
    expect(
      new Set(selected.scout.actions.map((action) => action.flipped)),
    ).toEqual(new Set([false, true]));
    expect(selected.scoutAndShow.actions.length).toBeGreaterThan(0);
    expect(
      selected.scoutAndShow.options.some((option) =>
        option.ranges.some((range) => !range.legal),
      ),
    ).toBe(true);
  });

  it("projects only Scout & Show choices with a legal follow-up Show", () => {
    let round = createRoundFromHands(
      {
        a: [card(5, 8), card(5, 9), card(1, 10)],
        b: [card(1, 3)],
        c: [card(2, 4)],
      },
      ["a", "b", "c"],
      "a",
    );
    round = applyRoundAction(round, "a", { type: "show", start: 0, end: 1 });

    const combined = selectLegalActions(round, "b").scoutAndShow;
    expect(combined.disabledReason).toBeUndefined();
    expect(combined.actions.length).toBeGreaterThan(0);
    expect(combined.options.length).toBeGreaterThan(0);
    expect(combined.actions.every((action) => action.flipped)).toBe(true);
    expect(
      new Set(combined.options.map((option) => option.scout.flipped)),
    ).toEqual(new Set([false, true]));
    expect(
      combined.options.some(
        (option) =>
          option.scout.flipped === false &&
          !option.ranges.some((range) => range.legal),
      ),
    ).toBe(true);
  });

  it("reports own-show and two-player chip prohibitions", () => {
    let round = createRoundFromHands(
      { a: [card(1, 7), card(2, 8)], b: [card(3, 9), card(4, 10)] },
      ["a", "b"],
      "a",
      "two-player",
    );
    round = applyRoundAction(round, "a", { type: "show", start: 0, end: 0 });
    const ownShowTurn = { ...round, activePlayerId: "a" };
    expect(selectLegalActions(ownShowTurn, "a").scout.disabledReason).toBe(
      "own-active-show",
    );

    round = {
      ...round,
      activePlayerId: "b",
      players: {
        ...round.players,
        b: { ...round.players.b!, twoPlayerScoutChips: 0 },
      },
    };
    expect(selectLegalActions(round, "b").scout.disabledReason).toBe(
      "no-scout-chips",
    );
  });
});
