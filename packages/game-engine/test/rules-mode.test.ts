import { describe, expect, it } from "vitest";
import {
  SeededRandomSource,
  createGame,
  createRoundFromDeck,
  createRoundFromHands,
  createScoutDeck,
  orientCard,
  toPrivatePlayerView,
  toPublicRoundView,
} from "../src/index.js";

describe("rules mode", () => {
  it("defaults every engine factory to official", () => {
    const rng = new SeededRandomSource(1);
    const game = createGame(["a", "b", "c"], rng);
    const fromDeck = createRoundFromDeck(
      ["a", "b", "c"],
      createScoutDeck().slice(0, 9),
      rng,
    );
    const fromHands = createRoundFromHands(
      {
        a: [orientCard(createScoutDeck()[0]!)],
        b: [orientCard(createScoutDeck()[1]!)],
        c: [orientCard(createScoutDeck()[2]!)],
      },
      ["a", "b", "c"],
      "a",
    );

    expect(game.rulesMode).toBe("official");
    expect(game.round.rulesMode).toBe("official");
    expect(fromDeck.rulesMode).toBe("official");
    expect(fromHands.rulesMode).toBe("official");
  });

  it("propagates VOSU through game, round, public, and private state", () => {
    const game = createGame(
      ["a", "b", "c"],
      new SeededRandomSource(2),
      "b",
      "vosu",
    );

    expect(game.rulesMode).toBe("vosu");
    expect(game.round.rulesMode).toBe("vosu");
    expect(toPublicRoundView(game.round).rulesMode).toBe("vosu");
    expect(toPrivatePlayerView(game.round, "a").rulesMode).toBe("vosu");
    expect(game.initialStartingPlayerId).toBe("b");
  });
});
