import { describe, expect, it } from "vitest";
import {
  SeededRandomSource,
  applyRoundAction,
  assertGameInvariants,
  chooseBotAction,
  createGame,
  createRoundFromHands,
  createScoutDeck,
  orientCard,
  toPrivatePlayerView,
  toPublicRoundView,
} from "../src/index.js";

function testCard(low: number, high: number) {
  const card = createScoutDeck().find(
    (candidate) => candidate.low === low && candidate.high === high,
  );
  if (card === undefined) {
    throw new Error("missing test card");
  }
  return orientCard(card);
}

describe("sanitized views", () => {
  it("publishes counts and active cards but no opponent hand identities", () => {
    let round = createRoundFromHands(
      {
        alice: [testCard(1, 7), testCard(2, 8)],
        bob: [testCard(3, 9), testCard(4, 10)],
        cara: [testCard(5, 8), testCard(6, 9)],
      },
      ["alice", "bob", "cara"],
      "alice",
    );
    const hiddenId = round.players.bob?.hand[0]?.card.id;
    expect(hiddenId).toBeDefined();
    const publicView = toPublicRoundView(round);
    expect(JSON.stringify(publicView)).not.toContain(hiddenId);
    expect(
      publicView.players.find((player) => player.id === "bob")?.handCount,
    ).toBe(2);

    const privateView = toPrivatePlayerView(round, "alice");
    expect(privateView.hand).toEqual(round.players.alice?.hand);
    expect(JSON.stringify(privateView)).not.toContain(hiddenId);

    round = applyRoundAction(round, "alice", {
      type: "show",
      start: 0,
      end: 0,
    });
    expect(toPublicRoundView(round).activeShow?.cards[0]?.card.id).toBe("1-7");
  });

  it("rejects unknown private viewers", () => {
    const round = createRoundFromHands(
      { a: [testCard(1, 2)], b: [testCard(3, 4)] },
      ["a", "b"],
      "a",
      "two-player",
    );
    expect(() => toPrivatePlayerView(round, "intruder")).toThrow();
  });
});

describe("information-limited bot", () => {
  it("returns a legal Show from only its private view", () => {
    const round = createRoundFromHands(
      {
        a: [testCard(1, 7), testCard(2, 8), testCard(3, 9)],
        b: [testCard(4, 10)],
        c: [testCard(5, 8)],
      },
      ["a", "b", "c"],
      "a",
    );
    const action = chooseBotAction(
      toPrivatePlayerView(round, "a"),
      new SeededRandomSource(1),
    );
    expect(action).toEqual({
      type: "show",
      start: 0,
      end: 2,
      valueMode: "active",
    });
    expect(() => applyRoundAction(round, "a", action)).not.toThrow();
  });

  it("scouts when no Show can beat the table", () => {
    let round = createRoundFromHands(
      {
        a: [testCard(8, 10), testCard(1, 5)],
        b: [testCard(1, 4), testCard(3, 6)],
      },
      ["a", "b"],
      "a",
      "two-player",
    );
    round = applyRoundAction(round, "a", { type: "show", start: 0, end: 0 });
    expect(
      chooseBotAction(
        toPrivatePlayerView(round, "b"),
        new SeededRandomSource(9),
      ).type,
    ).toBe("scout");
  });

  it("chooses a legal opposite-value VOSU Show from its private view", () => {
    let round = createRoundFromHands(
      {
        a: [testCard(8, 10), testCard(2, 7)],
        b: [testCard(1, 9), testCard(3, 6)],
        c: [testCard(4, 5)],
      },
      ["a", "b", "c"],
      "a",
      "standard",
      "vosu",
    );
    round = applyRoundAction(round, "a", {
      type: "show",
      start: 0,
      end: 0,
      valueMode: "active",
    });
    const action = chooseBotAction(
      toPrivatePlayerView(round, "b"),
      new SeededRandomSource(4),
    );
    expect(action).toMatchObject({ type: "show", valueMode: "opposite" });
    expect(() => applyRoundAction(round, "b", action)).not.toThrow();
  });

  it("uses repeatable VOSU Scout & Show options without hidden state", () => {
    let round = createRoundFromHands(
      {
        a: [testCard(4, 8), testCard(4, 9), testCard(7, 10)],
        b: [testCard(3, 7), testCard(5, 10)],
        c: [testCard(6, 9)],
      },
      ["a", "b", "c"],
      "a",
      "standard",
      "vosu",
    );
    round = applyRoundAction(round, "a", {
      type: "show",
      start: 0,
      end: 1,
      valueMode: "active",
    });
    const action = chooseBotAction(
      toPrivatePlayerView(round, "b"),
      new SeededRandomSource(7),
    );
    expect(action.type).toBe("scout-and-show");
    round = applyRoundAction(round, "b", action);
    expect(round.players.b?.scoutAndShowAvailable).toBe(true);
  });

  it("keeps Easy bot choices legal while allowing less efficient Scouts", () => {
    let round = createRoundFromHands(
      {
        a: [testCard(1, 7), testCard(2, 8), testCard(3, 9)],
        b: [testCard(4, 10), testCard(5, 8)],
        c: [testCard(6, 9)],
      },
      ["a", "b", "c"],
      "a",
    );
    const action = chooseBotAction(
      toPrivatePlayerView(round, "a"),
      new SeededRandomSource(42),
      "easy",
    );
    expect(() => {
      round = applyRoundAction(round, "a", action);
    }).not.toThrow();
  });

  it("never scouts a bot's own active Show", () => {
    let round = createRoundFromHands(
      {
        a: [testCard(8, 10), testCard(1, 2)],
        b: [testCard(3, 4)],
        c: [testCard(5, 6)],
      },
      ["a", "b", "c"],
      "a",
    );
    round = applyRoundAction(round, "a", { type: "show", start: 0, end: 0 });
    const impossibleOwnTurn = { ...round, activePlayerId: "a" };
    expect(() =>
      chooseBotAction(
        toPrivatePlayerView(impossibleOwnTurn, "a"),
        new SeededRandomSource(1),
      ),
    ).toThrow(/cannot scout its own/i);
  });
});

describe("game setup", () => {
  it("creates official hand sizes and round counts", () => {
    const expected = [
      { count: 2, hand: 11, rounds: 2 },
      { count: 3, hand: 12, rounds: 3 },
      { count: 4, hand: 11, rounds: 4 },
      { count: 5, hand: 9, rounds: 5 },
    ] as const;
    for (const row of expected) {
      const ids = Array.from({ length: row.count }, (_, index) => `p${index}`);
      const game = createGame(ids, new SeededRandomSource(row.count));
      expect(game.round.players.p0?.hand).toHaveLength(row.hand);
      expect(game.totalRounds).toBe(row.rounds);
      assertGameInvariants(game);
    }
  });

  it("splits one shuffled 44-card deck across the two two-player rounds", () => {
    const game = createGame(["a", "b"], new SeededRandomSource(123));
    expect(game.twoPlayerRoundDecks.map((deck) => deck.length)).toEqual([
      22, 22,
    ]);
    const ids = game.twoPlayerRoundDecks.flat().map((card) => card.id);
    expect(new Set(ids).size).toBe(44);
    expect(ids).not.toContain("9-10");
  });
});
