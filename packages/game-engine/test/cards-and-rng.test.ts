import { describe, expect, it } from "vitest";
import {
  SeededRandomSource,
  SequenceRandomSource,
  cardValue,
  createScoutDeck,
  deckForPlayerCount,
  flipWholeHand,
  orientCard,
  randomInt,
  shuffle,
} from "../src/index.js";

describe("deck and orientation", () => {
  it("builds each unordered number pair exactly once", () => {
    const deck = createScoutDeck();
    expect(deck).toHaveLength(45);
    expect(new Set(deck.map((card) => card.id)).size).toBe(45);
    expect(deck[0]).toEqual({ id: "1-2", low: 1, high: 2 });
    expect(deck.at(-1)).toEqual({ id: "9-10", low: 9, high: 10 });
  });

  it("filters the official decks for every player count", () => {
    expect(deckForPlayerCount(3)).toHaveLength(36);
    expect(deckForPlayerCount(3).every((card) => card.high !== 10)).toBe(true);
    expect(deckForPlayerCount(4)).toHaveLength(44);
    expect(deckForPlayerCount(2)).toHaveLength(44);
    expect(deckForPlayerCount(4).some((card) => card.id === "9-10")).toBe(false);
    expect(deckForPlayerCount(5)).toHaveLength(45);
  });

  it("flips the complete hand without permitting reordering", () => {
    const [first, second] = createScoutDeck();
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) {
      return;
    }
    const hand = [orientCard(first), orientCard(second, true)];
    const flipped = flipWholeHand(hand);
    expect(flipped.map((card) => card.card.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(flipped.map(cardValue)).toEqual([second.low, first.high]);
    expect(flipWholeHand(flipped)).toEqual(hand);
  });
});

describe("random sources", () => {
  it("replays seeded shuffles exactly", () => {
    const values = [1, 2, 3, 4, 5, 6];
    expect(shuffle(values, new SeededRandomSource(42))).toEqual(
      shuffle(values, new SeededRandomSource(42)),
    );
  });

  it("uses rejection sampling instead of modulo-biased terminal values", () => {
    const rng = new SequenceRandomSource([0xffff_ffff, 7]);
    expect(randomInt(rng, 10)).toBe(7);
  });
});
