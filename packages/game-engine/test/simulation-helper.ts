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

export function simulate(
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
