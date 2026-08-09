import { shuffledDeck } from "./cards.js";
import { assertGameInvariants } from "./invariants.js";
import type { RandomSource } from "./rng.js";
import { applyRoundAction, chooseHandOrientation, createRoundFromDeck } from "./round.js";
import type {
  Card,
  GameAction,
  GameState,
  PlayerCount,
  PlayerId,
  RoundState,
} from "./types.js";
import { RulesError } from "./types.js";

function asPlayerCount(count: number): PlayerCount {
  if (count === 2 || count === 3 || count === 4 || count === 5) {
    return count;
  }
  throw new RulesError("SCOUT requires two to five players");
}

function emptyTotals(playerIds: readonly PlayerId[]): Record<PlayerId, number> {
  return Object.fromEntries(playerIds.map((id) => [id, 0]));
}

function startingPlayerForRound(
  playerOrder: readonly PlayerId[],
  initialStartingPlayerId: PlayerId,
  roundNumber: number,
): PlayerId {
  const initialIndex = playerOrder.indexOf(initialStartingPlayerId);
  if (initialIndex < 0) {
    throw new RulesError("Initial starting player must be in the game");
  }
  const player =
    playerOrder[(initialIndex + roundNumber - 1) % playerOrder.length];
  if (player === undefined) {
    throw new RulesError("Game has no starting player");
  }
  return player;
}

function buildRound(
  playerOrder: readonly PlayerId[],
  playerCount: PlayerCount,
  initialStartingPlayerId: PlayerId,
  roundNumber: number,
  rng: RandomSource,
  twoPlayerRoundDecks: readonly (readonly Card[])[],
): RoundState {
  const startingPlayer = startingPlayerForRound(
    playerOrder,
    initialStartingPlayerId,
    roundNumber,
  );
  if (playerCount === 2) {
    const deck = twoPlayerRoundDecks[roundNumber - 1];
    if (deck === undefined) {
      throw new RulesError("Missing two-player round deck");
    }
    return createRoundFromDeck(
      playerOrder,
      deck,
      rng,
      startingPlayer,
      "two-player",
    );
  }
  return createRoundFromDeck(
    playerOrder,
    shuffledDeck(playerCount, rng),
    rng,
    startingPlayer,
    "standard",
  );
}

export function createGame(
  playerIds: readonly PlayerId[],
  rng: RandomSource,
  initialStartingPlayerId: PlayerId = playerIds[0] ?? "",
): GameState {
  const playerCount = asPlayerCount(playerIds.length);
  if (new Set(playerIds).size !== playerIds.length) {
    throw new RulesError("Player IDs must be unique");
  }
  if (!playerIds.includes(initialStartingPlayerId)) {
    throw new RulesError("Initial starting player must be in the game");
  }
  const playerOrder = [...playerIds];
  const twoPlayerDeck = playerCount === 2 ? shuffledDeck(2, rng) : [];
  // The official two-player game uses the two halves of one shuffle.
  const twoPlayerRoundDecks: readonly (readonly Card[])[] =
    playerCount === 2
      ? [twoPlayerDeck.slice(0, 22), twoPlayerDeck.slice(22)]
      : [];

  const game: GameState = {
    playerOrder,
    playerCount,
    initialStartingPlayerId,
    roundNumber: 1,
    totalRounds: playerCount === 2 ? 2 : playerCount,
    round: buildRound(
      playerOrder,
      playerCount,
      initialStartingPlayerId,
      1,
      rng,
      twoPlayerRoundDecks,
    ),
    totals: emptyTotals(playerOrder),
    status: { kind: "active" },
    twoPlayerRoundDecks,
    scoredCurrentRound: false,
  };
  assertGameInvariants(game);
  return game;
}

export function chooseGameHandOrientation(
  game: GameState,
  playerId: PlayerId,
  flip: boolean,
): GameState {
  if (game.status.kind !== "active") {
    throw new RulesError("The game has ended");
  }
  const next: GameState = {
    ...game,
    round: chooseHandOrientation(game.round, playerId, flip),
  };
  assertGameInvariants(next);
  return next;
}

function scoreCompletedRound(game: GameState, round: RoundState): GameState {
  if (round.status.kind !== "ended" || game.scoredCurrentRound) {
    return { ...game, round };
  }
  const totals: Record<PlayerId, number> = { ...game.totals };
  for (const id of game.playerOrder) {
    totals[id] = (totals[id] ?? 0) + (round.status.result.scores[id] ?? 0);
  }
  if (game.roundNumber === game.totalRounds) {
    const highest = Math.max(...Object.values(totals));
    return {
      ...game,
      round,
      totals,
      scoredCurrentRound: true,
      status: {
        kind: "ended",
        winners: game.playerOrder.filter((id) => totals[id] === highest),
        totals,
      },
    };
  }
  return { ...game, round, totals, scoredCurrentRound: true };
}

export function applyGameAction(
  game: GameState,
  playerId: PlayerId,
  action: GameAction,
): GameState {
  if (game.status.kind !== "active") {
    throw new RulesError("The game has ended");
  }
  const round = applyRoundAction(game.round, playerId, action);
  const next = scoreCompletedRound(game, round);
  assertGameInvariants(next);
  return next;
}

export function startNextRound(
  game: GameState,
  rng: RandomSource,
): GameState {
  if (game.status.kind === "ended") {
    throw new RulesError("The game has ended");
  }
  if (game.round.status.kind !== "ended" || !game.scoredCurrentRound) {
    throw new RulesError("The current round is not complete");
  }
  const roundNumber = game.roundNumber + 1;
  const next: GameState = {
    ...game,
    roundNumber,
    round: buildRound(
      game.playerOrder,
      game.playerCount,
      game.initialStartingPlayerId,
      roundNumber,
      rng,
      game.twoPlayerRoundDecks,
    ),
    scoredCurrentRound: false,
  };
  assertGameInvariants(next);
  return next;
}
