import { cardValue, flipWholeHand, randomOrientation } from "./cards.js";
import type { RandomSource } from "./rng.js";
import { beatsShow, classifyShow, enumerateLegalShows } from "./shows.js";
import { assertRoundInvariants } from "./invariants.js";
import {
  RulesError,
  type ActiveShow,
  type Card,
  type GameAction,
  type OrientedCard,
  type PlayerId,
  type PlayerState,
  type RulesMode,
  type RoundEndReason,
  type RoundState,
  type ScoutAction,
  type ScoutAndShowAction,
  type ShowAction,
} from "./types.js";

function playerAt(
  players: Readonly<Record<PlayerId, PlayerState>>,
  id: PlayerId,
): PlayerState {
  const player = players[id];
  if (player === undefined) {
    throw new RulesError(`Unknown player: ${id}`);
  }
  return player;
}

function replacePlayer(state: RoundState, player: PlayerState): RoundState {
  return {
    ...state,
    players: { ...state.players, [player.id]: player },
  };
}

function nextPlayer(state: RoundState, playerId: PlayerId): PlayerId {
  const index = state.playerOrder.indexOf(playerId);
  if (index < 0) {
    throw new RulesError(`Unknown player: ${playerId}`);
  }
  const next = state.playerOrder[(index + 1) % state.playerOrder.length];
  if (next === undefined) {
    throw new RulesError("Round has no next player");
  }
  return next;
}

function requireTurn(state: RoundState, playerId: PlayerId): PlayerState {
  if (state.status.kind !== "active") {
    throw new RulesError("The round has ended");
  }
  if (state.activePlayerId !== playerId) {
    throw new RulesError(`It is not ${playerId}'s turn`);
  }
  if (
    state.playerOrder.some(
      (id) => !playerAt(state.players, id).orientationChosen,
    )
  ) {
    throw new RulesError(
      "Every player must choose a hand orientation before play begins",
    );
  }
  const player = playerAt(state.players, playerId);
  return player;
}

function makePlayer(
  id: PlayerId,
  hand: readonly OrientedCard[],
  variant: RoundState["variant"],
  rulesMode: RulesMode,
): PlayerState {
  return {
    id,
    hand,
    captured: [],
    scoutTokens: 0,
    scoutAndShowAvailable: variant === "standard" || rulesMode === "vosu",
    twoPlayerScoutChips: variant === "two-player" ? 3 : 0,
    orientationChosen: false,
  };
}

export function createRoundFromDeck(
  playerIds: readonly PlayerId[],
  deck: readonly Card[],
  rng: RandomSource,
  startingPlayerId: PlayerId = playerIds[0] ?? "",
  variant: RoundState["variant"] = "standard",
  rulesMode: RulesMode = "official",
): RoundState {
  if (playerIds.length < 2 || playerIds.length > 5) {
    throw new RulesError("SCOUT requires two to five players");
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new RulesError("Player IDs must be unique");
  }
  if (!playerIds.includes(startingPlayerId)) {
    throw new RulesError("Starting player must be in the round");
  }
  if (deck.length % playerIds.length !== 0) {
    throw new RulesError("The round deck must deal evenly");
  }
  if (
    variant === "two-player" &&
    (playerIds.length !== 2 || deck.length !== 22)
  ) {
    throw new RulesError(
      "The two-player variant requires two players and 22 cards",
    );
  }
  if (playerIds.length === 2 && variant !== "two-player") {
    throw new RulesError("Two-player rounds must use the two-player variant");
  }

  const handSize = deck.length / playerIds.length;
  const players: Record<PlayerId, PlayerState> = {};
  for (let playerIndex = 0; playerIndex < playerIds.length; playerIndex += 1) {
    const id = playerIds[playerIndex];
    if (id === undefined) {
      throw new RulesError("Missing player ID");
    }
    const cards = deck
      .slice(playerIndex * handSize, (playerIndex + 1) * handSize)
      .map((card) => randomOrientation(card, rng));
    players[id] = makePlayer(id, cards, variant, rulesMode);
  }

  const round: RoundState = {
    rulesMode,
    variant,
    playerOrder: [...playerIds],
    players,
    startingPlayerId,
    activePlayerId: startingPlayerId,
    activeShow: null,
    status: { kind: "active" },
    initialCardIds: deck.map((card) => card.id),
    turnNumber: 0,
  };
  assertRoundInvariants(round);
  return round;
}

export function createRoundFromHands(
  hands: Readonly<Record<PlayerId, readonly OrientedCard[]>>,
  playerOrder: readonly PlayerId[],
  startingPlayerId: PlayerId,
  variant: RoundState["variant"] = "standard",
  rulesMode: RulesMode = "official",
): RoundState {
  if (playerOrder.length < 2 || playerOrder.length > 5) {
    throw new RulesError("SCOUT requires two to five players");
  }
  if (new Set(playerOrder).size !== playerOrder.length) {
    throw new RulesError("Player IDs must be unique");
  }
  if (!playerOrder.includes(startingPlayerId)) {
    throw new RulesError("Starting player must be in the round");
  }
  if (variant === "two-player" && playerOrder.length !== 2) {
    throw new RulesError("The two-player variant requires two players");
  }
  if (playerOrder.length === 2 && variant !== "two-player") {
    throw new RulesError("Two-player rounds must use the two-player variant");
  }
  const players: Record<PlayerId, PlayerState> = {};
  const ids: string[] = [];
  for (const id of playerOrder) {
    const hand = hands[id];
    if (hand === undefined) {
      throw new RulesError(`Missing hand for ${id}`);
    }
    players[id] = {
      ...makePlayer(id, [...hand], variant, rulesMode),
      orientationChosen: true,
    };
    ids.push(...hand.map((oriented) => oriented.card.id));
  }
  const round: RoundState = {
    rulesMode,
    variant,
    playerOrder: [...playerOrder],
    players,
    startingPlayerId,
    activePlayerId: startingPlayerId,
    activeShow: null,
    status: { kind: "active" },
    initialCardIds: ids,
    turnNumber: 0,
  };
  assertRoundInvariants(round);
  return round;
}

export function chooseHandOrientation(
  state: RoundState,
  playerId: PlayerId,
  flip: boolean,
): RoundState {
  if (state.status.kind !== "active") {
    throw new RulesError("The round has ended");
  }
  const player = playerAt(state.players, playerId);
  if (player.orientationChosen) {
    throw new RulesError("Hand orientation has already been chosen");
  }
  const next = replacePlayer(state, {
    ...player,
    hand: flip ? flipWholeHand(player.hand) : [...player.hand],
    orientationChosen: true,
  });
  assertRoundInvariants(next);
  return next;
}

function scoreRound(
  state: RoundState,
  protectedPlayerId?: PlayerId,
): Readonly<Record<PlayerId, number>> {
  const scores: Record<PlayerId, number> = {};
  for (const id of state.playerOrder) {
    const player = playerAt(state.players, id);
    const positive =
      player.captured.length +
      (state.variant === "standard"
        ? player.scoutTokens
        : player.twoPlayerScoutChips);
    const penalty = id === protectedPlayerId ? 0 : player.hand.length;
    scores[id] = positive - penalty;
  }
  return scores;
}

function finishRound(
  state: RoundState,
  reason: RoundEndReason,
  winnerId: PlayerId,
  protectedPlayerId?: PlayerId,
): RoundState {
  const result = {
    reason,
    winnerId,
    scores: scoreRound(state, protectedPlayerId),
    ...(protectedPlayerId === undefined ? {} : { protectedPlayerId }),
  };
  return {
    ...state,
    status: {
      kind: "ended",
      result,
    },
  };
}

function showCards(
  state: RoundState,
  playerId: PlayerId,
  action: ShowAction,
): RoundState {
  const player = requireTurn(state, playerId);
  if (
    !Number.isInteger(action.start) ||
    !Number.isInteger(action.end) ||
    action.start < 0 ||
    action.end < action.start ||
    action.end >= player.hand.length
  ) {
    throw new RulesError("Show must be a contiguous range inside the hand");
  }

  const shown = player.hand.slice(action.start, action.end + 1);
  const valueMode =
    action.valueMode ??
    (state.rulesMode === "official" ? ("active" as const) : undefined);
  if (valueMode !== "active" && valueMode !== "opposite") {
    throw new RulesError("Show value mode must be active or opposite");
  }
  if (state.rulesMode === "official" && valueMode !== "active") {
    throw new RulesError("Official rules only allow active card values");
  }
  const classification = classifyShow(shown, valueMode);
  if (classification === null) {
    throw new RulesError("The selected cards are not a set or consecutive run");
  }
  if (!beatsShow(classification, state.activeShow?.classification ?? null)) {
    throw new RulesError("The show does not beat the active show");
  }

  const remaining = [
    ...player.hand.slice(0, action.start),
    ...player.hand.slice(action.end + 1),
  ];
  const captured = state.activeShow?.cards.map((card) => card.card) ?? [];
  const updatedPlayer: PlayerState = {
    ...player,
    hand: remaining,
    captured: [...player.captured, ...captured],
  };
  const activeShow: ActiveShow = {
    ownerId: playerId,
    cards: shown,
    valueMode,
    classification,
    scoutedBy: [],
  };
  let next: RoundState = {
    ...replacePlayer(state, updatedPlayer),
    activeShow,
    activePlayerId: nextPlayer(state, playerId),
    turnNumber: state.turnNumber + 1,
  };
  if (remaining.length === 0) {
    return finishRound(next, "empty-hand", playerId);
  }
  if (next.variant === "two-player") {
    next = finishTwoPlayerIfStuck(next);
  }
  return next;
}

interface ScoutResult {
  readonly state: RoundState;
  readonly scoutedPlayer: PlayerState;
}

function scoutWithoutTurnAdvance(
  state: RoundState,
  playerId: PlayerId,
  action: ScoutAction | ScoutAndShowAction,
  spendTwoPlayerChip: boolean,
): ScoutResult {
  const player = requireTurn(state, playerId);
  const show = state.activeShow;
  if (show === null || show.cards.length === 0) {
    throw new RulesError("There is no active show to scout");
  }
  if (show.ownerId === playerId) {
    throw new RulesError("A player cannot scout their own active show");
  }
  if (action.side !== "left" && action.side !== "right") {
    throw new RulesError("Scout side must be left or right");
  }
  if (typeof action.flipped !== "boolean") {
    throw new RulesError("Scout orientation must be a boolean");
  }
  if (
    !Number.isInteger(action.insertAt) ||
    action.insertAt < 0 ||
    action.insertAt > player.hand.length
  ) {
    throw new RulesError("Scout insertion index is outside the hand");
  }
  if (spendTwoPlayerChip && player.twoPlayerScoutChips <= 0) {
    throw new RulesError("No two-player Scout chips remain");
  }

  const cardIndex = action.side === "left" ? 0 : show.cards.length - 1;
  const selected = show.cards[cardIndex];
  if (selected === undefined) {
    throw new RulesError("Scout selected no card");
  }
  const inserted: OrientedCard = {
    card: selected.card,
    flipped: action.flipped,
  };
  const hand = [
    ...player.hand.slice(0, action.insertAt),
    inserted,
    ...player.hand.slice(action.insertAt),
  ];
  const remainingShowCards = show.cards.filter(
    (_, index) => index !== cardIndex,
  );
  const remainingClassification = classifyShow(
    remainingShowCards,
    show.valueMode,
  );
  const updatedShow =
    remainingClassification === null
      ? null
      : {
          ...show,
          cards: remainingShowCards,
          classification: remainingClassification,
          scoutedBy: [...show.scoutedBy, playerId],
        };
  const scoutedPlayer: PlayerState = {
    ...player,
    hand,
    twoPlayerScoutChips:
      player.twoPlayerScoutChips - (spendTwoPlayerChip ? 1 : 0),
    scoutAndShowAvailable:
      state.rulesMode === "vosu" && state.variant === "two-player"
        ? player.twoPlayerScoutChips - (spendTwoPlayerChip ? 1 : 0) > 0
        : player.scoutAndShowAvailable,
  };
  let next = replacePlayer(state, scoutedPlayer);
  next = { ...next, activeShow: updatedShow };

  if (!spendTwoPlayerChip) {
    const owner = playerAt(next.players, show.ownerId);
    next = replacePlayer(next, {
      ...owner,
      scoutTokens: owner.scoutTokens + 1,
    });
  }
  return { state: next, scoutedPlayer };
}

function allOpponentsScouted(state: RoundState, show: ActiveShow): boolean {
  return state.playerOrder
    .filter((id) => id !== show.ownerId)
    .every((id) => show.scoutedBy.includes(id));
}

function finishTwoPlayerIfStuck(state: RoundState): RoundState {
  if (state.variant !== "two-player" || state.status.kind !== "active") {
    return state;
  }
  const player = playerAt(state.players, state.activePlayerId);
  const legalShows = enumerateLegalShows(
    player.hand,
    state.activeShow?.classification ?? null,
    state.rulesMode,
  );
  if (player.twoPlayerScoutChips === 0 && legalShows.length === 0) {
    const winnerId = state.activeShow?.ownerId ?? nextPlayer(state, player.id);
    return finishRound(state, "two-player-stuck", winnerId);
  }
  return state;
}

function scout(
  state: RoundState,
  playerId: PlayerId,
  action: ScoutAction,
): RoundState {
  if (state.variant === "two-player") {
    const result = scoutWithoutTurnAdvance(state, playerId, action, true);
    const continued: RoundState = {
      ...result.state,
      activePlayerId: playerId,
      turnNumber: state.turnNumber + 1,
    };
    return finishTwoPlayerIfStuck(continued);
  }

  const originalShow = state.activeShow;
  const result = scoutWithoutTurnAdvance(state, playerId, action, false);
  const advanced: RoundState = {
    ...result.state,
    activePlayerId: nextPlayer(state, playerId),
    turnNumber: state.turnNumber + 1,
  };
  const trackedShow =
    advanced.activeShow ??
    (originalShow === null
      ? null
      : { ...originalShow, scoutedBy: [...originalShow.scoutedBy, playerId] });
  if (trackedShow !== null && allOpponentsScouted(advanced, trackedShow)) {
    return finishRound(
      advanced,
      "all-scouted",
      trackedShow.ownerId,
      trackedShow.ownerId,
    );
  }
  return advanced;
}

function scoutAndShow(
  state: RoundState,
  playerId: PlayerId,
  action: ScoutAndShowAction,
): RoundState {
  if (state.variant === "two-player" && state.rulesMode === "official") {
    throw new RulesError("Scout & Show is not used in the two-player variant");
  }
  const player = requireTurn(state, playerId);
  if (
    state.rulesMode === "vosu" &&
    state.variant === "two-player" &&
    player.twoPlayerScoutChips <= 0
  ) {
    throw new RulesError("No two-player Scout chips remain");
  }
  if (!player.scoutAndShowAvailable) {
    throw new RulesError("Scout & Show has already been used this round");
  }

  // All mutations are applied to fresh objects. If Show validation throws, the
  // caller's original state remains untouched.
  const spendTwoPlayerChip = state.variant === "two-player";
  const scouted = scoutWithoutTurnAdvance(
    state,
    playerId,
    action,
    spendTwoPlayerChip,
  ).state;
  const afterScoutPlayer = playerAt(scouted.players, playerId);
  const consumed =
    state.rulesMode === "official"
      ? replacePlayer(scouted, {
          ...afterScoutPlayer,
          scoutAndShowAvailable: false,
        })
      : scouted;
  return showCards(consumed, playerId, {
    type: "show",
    start: action.showStart,
    end: action.showEnd,
    valueMode: action.valueMode,
  });
}

export function applyRoundAction(
  state: RoundState,
  playerId: PlayerId,
  action: GameAction,
): RoundState {
  const next =
    action.type === "show"
      ? showCards(state, playerId, action)
      : action.type === "scout"
        ? scout(state, playerId, action)
        : scoutAndShow(state, playerId, action);
  assertRoundInvariants(next);
  return next;
}

export function visibleValues(
  hand: readonly OrientedCard[],
): readonly number[] {
  return hand.map(cardValue);
}
