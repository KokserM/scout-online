import { describe, expect, it } from "vitest";
import {
  beatsShow,
  classifyShow,
  compareShows,
  createScoutDeck,
  enumerateLegalShows,
  orientCard,
  type Card,
} from "../src/index.js";

function card(low: number, high: number, flipped = false) {
  const found = createScoutDeck().find(
    (candidate) => candidate.low === low && candidate.high === high,
  );
  if (found === undefined) {
    throw new Error("test card not found");
  }
  return orientCard(found, flipped);
}

describe("show classification and rank", () => {
  it("classifies singles, matching sets, ascending and descending runs", () => {
    expect(classifyShow([card(1, 8)])).toEqual({
      kind: "single",
      size: 1,
      rank: 1,
    });
    expect(classifyShow([card(4, 8), card(4, 9), card(4, 10)])).toEqual({
      kind: "set",
      size: 3,
      rank: 4,
    });
    expect(classifyShow([card(2, 8), card(3, 8), card(4, 8)])).toEqual({
      kind: "run",
      size: 3,
      rank: 4,
    });
    expect(
      classifyShow([card(2, 5, true), card(2, 4, true), card(2, 3, true)]),
    ).toEqual({ kind: "run", size: 3, rank: 5 });
  });

  it("rejects gaps, unordered values, and empty selections", () => {
    expect(classifyShow([])).toBeNull();
    expect(classifyShow([card(1, 8), card(3, 9)])).toBeNull();
    expect(classifyShow([card(1, 8), card(2, 9), card(2, 10)])).toBeNull();
  });

  it("ranks length, then sets over runs, then the highest value", () => {
    const pairRun = classifyShow([card(2, 8), card(3, 9)]);
    const pairSet = classifyShow([card(4, 8), card(4, 9)]);
    const triple = classifyShow([card(1, 7), card(2, 8), card(3, 9)]);
    expect(pairRun).not.toBeNull();
    expect(pairSet).not.toBeNull();
    expect(triple).not.toBeNull();
    if (pairRun === null || pairSet === null || triple === null) {
      return;
    }
    expect(compareShows(pairSet, pairRun)).toBeGreaterThan(0);
    expect(compareShows(triple, pairSet)).toBeGreaterThan(0);
    expect(beatsShow(pairSet, pairSet)).toBe(false);
  });

  it("enumerates only contiguous legal ranges", () => {
    const hand = [card(1, 7), card(2, 8), card(3, 9), card(1, 10)];
    const legal = enumerateLegalShows(hand, {
      kind: "run",
      size: 2,
      rank: 8,
    });
    expect(legal).toContainEqual({
      type: "show",
      start: 0,
      end: 2,
      valueMode: "active",
    });
    expect(legal).not.toContainEqual({
      type: "show",
      start: 0,
      end: 3,
      valueMode: "active",
    });
  });

  it("does not depend on mutable card aliases", () => {
    const physical: Card = { id: "1-2", low: 1, high: 2 };
    expect(classifyShow([orientCard(physical)])?.rank).toBe(1);
  });
});
