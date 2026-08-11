import { randomInt, randomUUID } from "node:crypto";
import {
  CryptoRandomSource,
  applyGameAction,
  assertGameInvariants,
  chooseBotAction as chooseEngineBotAction,
  chooseGameHandOrientation,
  createGame,
  selectLegalActions,
  startNextRound,
  toPrivatePlayerView,
  type GameAction as EngineAction,
  type GameState,
  type OrientedCard,
  type BotDifficulty,
  type RandomSource,
} from "@grandstand/game-engine";
import type {
  Activity,
  AvailableActions,
  Card,
  GameAction,
  Play,
  RulesMode,
  RoundScore,
} from "@grandstand/shared";

export interface EnginePlayerSummary {
  score: number;
  handCount: number;
  capturedCount: number;
  scoutPoints: number;
  scoutAndShowAvailable: boolean;
  scoutChips: number;
}

export interface EnginePlayerView {
  phase: "orientation" | "playing" | "round-results" | "final";
  round: number;
  totalRounds: number;
  rulesMode: RulesMode;
  variant: "standard" | "two-player";
  hand: Card[];
  table: Play[];
  activePlayerId?: string;
  startingPlayerId?: string;
  scoutTargetId?: string;
  pendingOrientationPlayerIds?: readonly string[];
  players: Readonly<Record<string, EnginePlayerSummary>>;
  availableActions: AvailableActions;
  roundScores?: RoundScore[];
  activity: Activity[];
}

export interface GameEngine {
  createGame(playerIds: readonly string[], rulesMode?: RulesMode): unknown;
  applyAction(state: unknown, playerId: string, action: GameAction): unknown;
  getPlayerView(state: unknown, playerId: string): EnginePlayerView;
  assertState?(state: unknown): void;
  chooseBotAction(
    state: unknown,
    playerId: string,
    difficulty?: BotDifficulty,
  ): GameAction | undefined;
}

/**
 * All knowledge of @grandstand/game-engine's concrete API and index-based
 * actions lives here. The transport and room service only depend on GameEngine.
 */
export interface GameEngineOptions {
  rng?: RandomSource;
  chooseStartingPlayer?: (playerIds: readonly string[]) => string;
}

export function createGameEngine(options: GameEngineOptions = {}): GameEngine {
  const rng = options.rng ?? new CryptoRandomSource();
  return {
    createGame: (playerIds, rulesMode = "official") => {
      const startingPlayer =
        options.chooseStartingPlayer?.(playerIds) ??
        playerIds[randomInt(playerIds.length)];
      if (!startingPlayer) throw new Error("A game requires players");
      const game = createGame(playerIds, rng, startingPlayer, rulesMode);
      assertGameInvariants(game);
      return game;
    },
    applyAction: (state, playerId, action) => {
      const game = asGameState(state);
      let next: GameState;
      switch (action.type) {
        case "game:choose-orientation":
          next = chooseGameHandOrientation(game, playerId, action.flipped);
          break;
        case "game:next-round":
          next = startNextRound(game, rng);
          break;
        case "game:show":
        case "game:scout":
        case "game:scout-and-show":
          next = applyGameAction(
            game,
            playerId,
            toEngineAction(game, playerId, action),
          );
          break;
        case "game:start":
        case "game:rematch":
          throw new Error(`${action.type} is handled by the room service`);
      }
      assertGameInvariants(next);
      return next;
    },
    getPlayerView: (state, playerId) => {
      const game = asGameState(state);
      assertGameInvariants(game);
      return buildView(game, playerId);
    },
    assertState: (state) => assertGameInvariants(asGameState(state)),
    chooseBotAction: (state, playerId, difficulty = "standard") => {
      const game = asGameState(state);
      const privateView = toPrivatePlayerView(game.round, playerId);
      if (
        !privateView.players.every(
          (player) => game.round.players[player.id]?.orientationChosen,
        )
      ) {
        return {
          actionId: randomUUID(),
          type: "game:choose-orientation",
          flipped: false,
        };
      }
      return fromEngineAction(
        game,
        playerId,
        chooseEngineBotAction(privateView, rng, difficulty),
      );
    },
  };
}

export async function loadGameEngine(): Promise<GameEngine> {
  return createGameEngine();
}

function buildView(game: GameState, playerId: string): EnginePlayerView {
  const view = toPrivatePlayerView(game.round, playerId);
  const availableActions = projectAvailableActions(game, playerId);
  const phase =
    game.status.kind === "ended"
      ? "final"
      : game.round.status.kind === "ended"
        ? "round-results"
        : view.players.some(
              (player) => !game.round.players[player.id]?.orientationChosen,
            )
          ? "orientation"
          : "playing";
  const activeShow = view.activeShow;
  const roundScores =
    game.round.status.kind === "ended"
      ? view.players.map((player) => {
          const result =
            game.round.status.kind === "ended"
              ? game.round.status.result
              : undefined;
          if (!result) throw new Error("Round result disappeared");
          return {
            playerId: player.id,
            capturedCards: player.capturedCount,
            scoutPoints: player.scoutTokens,
            cardsRemaining: player.handCount,
            unusedScoutChips: player.twoPlayerScoutChips,
            handPenaltyExempt: result.protectedPlayerId === player.id,
            roundTotal: result.scores[player.id] ?? 0,
            cumulativeTotal: game.totals[player.id] ?? 0,
          };
        })
      : undefined;
  return {
    phase,
    round: game.roundNumber,
    totalRounds: game.totalRounds,
    rulesMode: view.rulesMode,
    variant: view.variant,
    hand: view.hand.map(toProtocolCard),
    table:
      activeShow === null
        ? []
        : [
            {
              id: showId(game),
              playerId: activeShow.ownerId,
              cards: activeShow.cards.map(toProtocolCard),
              valueMode: activeShow.valueMode,
            },
          ],
    ...(phase === "playing" ? { activePlayerId: view.activePlayerId } : {}),
    startingPlayerId: game.round.startingPlayerId,
    ...(activeShow === null ? {} : { scoutTargetId: activeShow.ownerId }),
    ...(phase === "orientation"
      ? {
          pendingOrientationPlayerIds: view.players
            .map((player) => player.id)
            .filter((id) => !game.round.players[id]?.orientationChosen),
        }
      : {}),
    players: Object.fromEntries(
      view.players.map((player) => [
        player.id,
        {
          score: game.totals[player.id] ?? 0,
          handCount: player.handCount,
          capturedCount: player.capturedCount,
          scoutPoints: player.scoutTokens,
          scoutAndShowAvailable: player.scoutAndShowAvailable,
          scoutChips: player.twoPlayerScoutChips,
        },
      ]),
    ),
    availableActions,
    ...(roundScores ? { roundScores } : {}),
    activity: [],
  };
}

function projectAvailableActions(
  game: GameState,
  playerId: string,
): AvailableActions {
  const selected = selectLegalActions(game.round, playerId);
  const player = game.round.players[playerId];
  if (!player) throw new Error("Unknown player");
  const playId = game.round.activeShow === null ? undefined : showId(game);
  const show = {
    enabled: selected.show.disabledReason === undefined,
    ...(selected.show.disabledReason
      ? { disabledReason: selected.show.disabledReason }
      : {}),
    ranges: selected.show.ranges.map((range) => ({
      cardIds: player.hand
        .slice(range.action.start, range.action.end + 1)
        .map(({ card }) => card.id),
      kind: range.classification.kind,
      valueMode: range.valueMode,
      legal: range.legal,
    })),
  };
  const scout = {
    enabled: selected.scout.disabledReason === undefined,
    ...(selected.scout.disabledReason
      ? { disabledReason: selected.scout.disabledReason }
      : {}),
    ...(playId ? { playId } : {}),
    endpoints: [
      ...new Set(
        selected.scout.actions.map((action) =>
          action.side === "left" ? ("start" as const) : ("end" as const),
        ),
      ),
    ],
    insertionCount:
      selected.scout.actions.length === 0
        ? 0
        : Math.max(...selected.scout.actions.map((action) => action.insertAt)) +
          1,
    flipped: [
      ...new Set(selected.scout.actions.map((action) => action.flipped)),
    ],
  };
  const grouped = new Map<
    string,
    AvailableActions["scoutAndShow"]["options"][number]
  >();
  for (const option of selected.scoutAndShow.options) {
    if (!option.ranges.some((range) => range.legal)) continue;
    const action = option.scout;
    const position = action.side === "left" ? "start" : "end";
    const activeShow = game.round.activeShow;
    const scouted =
      action.side === "left" ? activeShow?.cards[0] : activeShow?.cards.at(-1);
    if (!scouted) continue;
    const resultingHand = [
      ...player.hand.slice(0, action.insertAt),
      { card: scouted.card, flipped: action.flipped },
      ...player.hand.slice(action.insertAt),
    ];
    const key = `${position}:${action.insertAt}:${action.flipped}`;
    grouped.set(key, {
      position,
      insertAt: action.insertAt,
      flipped: action.flipped,
      showRanges: option.ranges.map((range) => ({
        cardIds: resultingHand
          .slice(range.action.start, range.action.end + 1)
          .map(({ card }) => card.id),
        kind: range.classification.kind,
        valueMode: range.valueMode,
        legal: range.legal,
      })),
    });
  }
  return {
    show,
    scout,
    scoutAndShow: {
      enabled: selected.scoutAndShow.disabledReason === undefined,
      ...(selected.scoutAndShow.disabledReason
        ? { disabledReason: selected.scoutAndShow.disabledReason }
        : {}),
      ...(playId ? { playId } : {}),
      options: [...grouped.values()],
    },
  };
}

function toEngineAction(
  game: GameState,
  playerId: string,
  action: Extract<
    GameAction,
    { type: "game:show" | "game:scout" | "game:scout-and-show" }
  >,
): EngineAction {
  const player = game.round.players[playerId];
  if (!player) throw new Error("Unknown player");
  if (action.type === "game:show") {
    const [start, end] = contiguousRange(player.hand, action.cardIds);
    return { type: "show", start, end, valueMode: action.valueMode };
  }
  if (action.playId !== showId(game))
    throw new Error("The referenced show is no longer active");
  const activeShow = game.round.activeShow;
  if (!activeShow) throw new Error("There is no active show");
  const side = action.position === "start" ? "left" : "right";
  const insertAt = action.insertAt ?? player.hand.length;
  const flipped = action.flipped ?? false;
  if (action.type === "game:scout")
    return { type: "scout", side, insertAt, flipped };

  const selected =
    side === "left" ? activeShow.cards[0] : activeShow.cards.at(-1);
  if (!selected) throw new Error("The active show is empty");
  const inserted: OrientedCard = { card: selected.card, flipped };
  const resultingHand = [
    ...player.hand.slice(0, insertAt),
    inserted,
    ...player.hand.slice(insertAt),
  ];
  const [showStart, showEnd] = contiguousRange(resultingHand, action.cardIds);
  return {
    type: "scout-and-show",
    side,
    insertAt,
    flipped,
    showStart,
    showEnd,
    valueMode: action.valueMode,
  };
}

function fromEngineAction(
  game: GameState,
  playerId: string,
  action: EngineAction,
): GameAction {
  const player = game.round.players[playerId];
  if (!player) throw new Error("Unknown bot");
  if (action.type === "show") {
    return {
      actionId: randomUUID(),
      type: "game:show",
      cardIds: player.hand
        .slice(action.start, action.end + 1)
        .map(({ card }) => card.id),
      valueMode: action.valueMode,
    };
  }
  const position = action.side === "left" ? "start" : "end";
  if (action.type === "scout") {
    return {
      actionId: randomUUID(),
      type: "game:scout",
      playId: showId(game),
      position,
      insertAt: action.insertAt,
      flipped: action.flipped,
    };
  }
  const activeShow = game.round.activeShow;
  const selected =
    action.side === "left" ? activeShow?.cards[0] : activeShow?.cards.at(-1);
  if (!selected) throw new Error("Bot action references a missing show");
  const resultingHand = [
    ...player.hand.slice(0, action.insertAt),
    { card: selected.card, flipped: action.flipped },
    ...player.hand.slice(action.insertAt),
  ];
  return {
    actionId: randomUUID(),
    type: "game:scout-and-show",
    playId: showId(game),
    position,
    insertAt: action.insertAt,
    flipped: action.flipped,
    cardIds: resultingHand
      .slice(action.showStart, action.showEnd + 1)
      .map(({ card }) => card.id),
    valueMode: action.valueMode,
  };
}

function contiguousRange(
  hand: readonly OrientedCard[],
  cardIds: readonly string[],
): [number, number] {
  const start = hand.findIndex(({ card }) => card.id === cardIds[0]);
  if (start < 0) throw new Error("A selected card is not in the hand");
  for (let offset = 0; offset < cardIds.length; offset += 1) {
    if (hand[start + offset]?.card.id !== cardIds[offset]) {
      throw new Error("Selected cards must be contiguous and in hand order");
    }
  }
  return [start, start + cardIds.length - 1];
}

function toProtocolCard(oriented: OrientedCard): Card {
  const { card, flipped } = oriented;
  const suits = ["coral", "gold", "mint", "sky", "violet"] as const;
  const suit =
    suits[
      [...card.id].reduce(
        (total, character) => total + character.charCodeAt(0),
        0,
      ) % suits.length
    ]!;
  return {
    id: card.id,
    top: flipped ? card.high : card.low,
    bottom: flipped ? card.low : card.high,
    suit,
  };
}

function showId(game: GameState): string {
  const show = game.round.activeShow;
  return show
    ? `show_${game.roundNumber}_${game.round.turnNumber}_${show.ownerId}`
    : "show_none";
}

function asGameState(state: unknown): GameState {
  if (
    typeof state !== "object" ||
    state === null ||
    !("round" in state) ||
    !("playerOrder" in state) ||
    !("status" in state)
  ) {
    throw new Error("Invalid game-engine state");
  }
  return state as GameState;
}
