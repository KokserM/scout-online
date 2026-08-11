import { classifyShow, compareShows } from "./shows.js";
import type {
  Card,
  CardId,
  GameState,
  OrientedCard,
  RoundState,
} from "./types.js";

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invariant violation: ${message}`);
  }
}

function checkCard(card: Card): void {
  invariant(
    Number.isInteger(card.low),
    `${card.id} low value is not an integer`,
  );
  invariant(
    Number.isInteger(card.high),
    `${card.id} high value is not an integer`,
  );
  invariant(
    card.low >= 1 && card.high <= 10,
    `${card.id} value is out of range`,
  );
  invariant(card.low < card.high, `${card.id} values are not canonical`);
  invariant(
    card.id === `${card.low}-${card.high}`,
    `${card.id} has a mismatched ID`,
  );
}

function collectOriented(
  destination: CardId[],
  cards: readonly OrientedCard[],
): void {
  for (const oriented of cards) {
    checkCard(oriented.card);
    destination.push(oriented.card.id);
  }
}

export function assertRoundInvariants(state: RoundState): void {
  invariant(
    state.rulesMode === "official" || state.rulesMode === "vosu",
    "invalid rules mode",
  );
  invariant(
    state.playerOrder.length >= 2 && state.playerOrder.length <= 5,
    "invalid player count",
  );
  invariant(
    new Set(state.playerOrder).size === state.playerOrder.length,
    "duplicate player IDs",
  );
  invariant(
    state.playerOrder.includes(state.startingPlayerId),
    "starting player is absent",
  );
  invariant(
    state.playerOrder.includes(state.activePlayerId),
    "active player is absent",
  );
  invariant(
    state.variant !== "two-player" || state.playerOrder.length === 2,
    "two-player variant has the wrong player count",
  );
  invariant(
    state.playerOrder.length !== 2 || state.variant === "two-player",
    "two-player round uses the standard variant",
  );

  const currentIds: CardId[] = [];
  for (const id of state.playerOrder) {
    const player = state.players[id];
    invariant(player !== undefined, `missing player state for ${id}`);
    invariant(player.id === id, `player record key mismatch for ${id}`);
    invariant(player.scoutTokens >= 0, `${id} has negative Scout tokens`);
    invariant(
      player.twoPlayerScoutChips >= 0 && player.twoPlayerScoutChips <= 3,
      `${id} has invalid two-player Scout chips`,
    );
    invariant(
      state.variant === "two-player" || player.twoPlayerScoutChips === 0,
      `${id} has two-player Scout chips in a standard round`,
    );
    invariant(
      state.variant !== "two-player" || player.scoutTokens === 0,
      `${id} has Scout points in a two-player round`,
    );
    invariant(
      state.rulesMode !== "vosu" ||
        (state.variant === "standard"
          ? player.scoutAndShowAvailable
          : player.scoutAndShowAvailable === player.twoPlayerScoutChips > 0),
      `${id} has stale VOSU Scout & Show availability`,
    );
    invariant(
      state.rulesMode !== "official" ||
        state.variant !== "two-player" ||
        !player.scoutAndShowAvailable,
      `${id} can Scout & Show in official two-player rules`,
    );
    collectOriented(currentIds, player.hand);
    for (const card of player.captured) {
      checkCard(card);
      currentIds.push(card.id);
    }
  }
  if (state.activeShow !== null) {
    invariant(
      state.playerOrder.includes(state.activeShow.ownerId),
      "active show owner is absent",
    );
    invariant(state.activeShow.cards.length > 0, "active show is empty");
    invariant(
      state.activeShow.valueMode === "active" ||
        (state.rulesMode === "vosu" &&
          state.activeShow.valueMode === "opposite"),
      "active show has an invalid value mode",
    );
    const classification = classifyShow(
      state.activeShow.cards,
      state.activeShow.valueMode,
    );
    invariant(classification !== null, "active show is invalid");
    invariant(
      compareShows(classification, state.activeShow.classification) === 0,
      "active show classification is stale",
    );
    invariant(
      state.variant === "two-player" ||
        new Set(state.activeShow.scoutedBy).size ===
          state.activeShow.scoutedBy.length,
      "a player scouted the same show twice",
    );
    invariant(
      !state.activeShow.scoutedBy.includes(state.activeShow.ownerId),
      "active show owner scouted their own show",
    );
    collectOriented(currentIds, state.activeShow.cards);
  }

  invariant(
    new Set(currentIds).size === currentIds.length,
    "a card exists in more than one zone",
  );
  invariant(
    new Set(state.initialCardIds).size === state.initialCardIds.length,
    "initial round cards are duplicated",
  );
  invariant(
    currentIds.length === state.initialCardIds.length,
    "cards were created or lost",
  );
  const expected = new Set(state.initialCardIds);
  invariant(
    currentIds.every((id) => expected.has(id)),
    "an unexpected card entered the round",
  );
}

export function assertGameInvariants(game: GameState): void {
  assertRoundInvariants(game.round);
  invariant(
    game.rulesMode === game.round.rulesMode,
    "round rules mode differs from game",
  );
  invariant(
    game.playerOrder.length === game.playerCount,
    "game player count is stale",
  );
  invariant(
    game.playerOrder.includes(game.initialStartingPlayerId),
    "initial starting player is absent",
  );
  const initialStartingIndex = game.playerOrder.indexOf(
    game.initialStartingPlayerId,
  );
  invariant(
    game.round.startingPlayerId ===
      game.playerOrder[
        (initialStartingIndex + game.roundNumber - 1) % game.playerOrder.length
      ],
    "round starting player does not follow clockwise rotation",
  );
  invariant(
    game.roundNumber >= 1 && game.roundNumber <= game.totalRounds,
    "round number is out of range",
  );
  invariant(
    game.totalRounds === (game.playerCount === 2 ? 2 : game.playerCount),
    "game has the wrong number of rounds",
  );
  for (const id of game.playerOrder) {
    invariant(Number.isInteger(game.totals[id]), `missing total for ${id}`);
  }
  if (game.playerCount === 2) {
    invariant(game.twoPlayerRoundDecks.length === 2, "missing split decks");
    const ids = game.twoPlayerRoundDecks.flat().map((card) => card.id);
    invariant(ids.length === 44, "two-player split does not contain 44 cards");
    invariant(new Set(ids).size === 44, "two-player split decks overlap");
  }
}
