import { describe, expect, it } from "vitest";
import {
  SeededRandomSource,
  applyGameAction,
  assertGameInvariants,
  chooseBotAction,
  chooseGameHandOrientation,
  createGame,
  randomInt,
  startNextRound,
  toPrivatePlayerView,
  type GameState,
  type PlayerCount,
  type RandomSource,
  type RulesMode,
} from "../src/index.js";

function orientEveryone(game: GameState, rng: RandomSource): GameState {
  let oriented = game;
  for (const id of game.playerOrder) {
    oriented = chooseGameHandOrientation(oriented, id, randomInt(rng, 2) === 1);
  }
  return oriented;
}

function simulate(
  playerCount: PlayerCount,
  seed: number,
  rulesMode: RulesMode = "official",
): GameState {
  const rng = new SeededRandomSource(seed);
  const ids = Array.from(
    { length: playerCount },
    (_, index) => `player-${index + 1}`,
  );
  let game = orientEveryone(createGame(ids, rng, ids[0] ?? "", rulesMode), rng);
  let actions = 0;
  while (game.status.kind === "active") {
    assertGameInvariants(game);
    if (game.round.status.kind === "ended") {
      game = orientEveryone(startNextRound(game, rng), rng);
      continue;
    }
    const actor = game.round.activePlayerId;
    const action = chooseBotAction(toPrivatePlayerView(game.round, actor), rng);
    game = applyGameAction(game, actor, action);
    actions += 1;
    if (actions > 5_000) {
      throw new Error("Simulation did not terminate");
    }
  }
  assertGameInvariants(game);
  return game;
}

describe("invariant simulations", () => {
  it("completes deterministic official and VOSU games for two to five players", () => {
    for (const rulesMode of ["official", "vosu"] as const) {
      for (const count of [2, 3, 4, 5] as const) {
        for (let seed = 1; seed <= 1_000; seed += 1) {
          const game = simulate(count, seed * 10_000 + count, rulesMode);
          expect(game.status.kind).toBe("ended");
          expect(game.roundNumber).toBe(game.totalRounds);
          if (game.status.kind === "ended") {
            expect(game.status.winners.length).toBeGreaterThan(0);
          }
        }
      }
    }
  }, 120_000);

  it("replays a full game byte-for-byte from the same seed", () => {
    expect(simulate(4, 8675309)).toEqual(simulate(4, 8675309));
    expect(simulate(4, 8675309, "vosu")).toEqual(simulate(4, 8675309, "vosu"));
  });
});
