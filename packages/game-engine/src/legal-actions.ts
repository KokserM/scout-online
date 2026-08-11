import { beatsShow, classifyShow } from "./shows.js";
import type {
  ActionDisabledReason,
  LegalActionOptions,
  OrientedCard,
  PlayerId,
  PlayerState,
  RoundState,
  ScoutAction,
  ScoutAndShowAction,
  ShowRangeOption,
  ShowValueMode,
} from "./types.js";
import { RulesError } from "./types.js";

function playerAt(state: RoundState, playerId: PlayerId): PlayerState {
  const player = state.players[playerId];
  if (player === undefined) {
    throw new RulesError(`Unknown player: ${playerId}`);
  }
  return player;
}

function turnDisabledReason(
  state: RoundState,
  playerId: PlayerId,
): ActionDisabledReason | undefined {
  if (state.status.kind !== "active") {
    return "round-ended";
  }
  if (state.playerOrder.some((id) => !playerAt(state, id).orientationChosen)) {
    return "orientations-pending";
  }
  if (state.activePlayerId !== playerId) {
    return "not-active-player";
  }
  return undefined;
}

export function enumerateShowRanges(
  hand: readonly OrientedCard[],
  incumbent: RoundState["activeShow"],
  rulesMode: RoundState["rulesMode"],
): readonly ShowRangeOption[] {
  const ranges: ShowRangeOption[] = [];
  const valueModes: readonly ShowValueMode[] =
    rulesMode === "vosu" ? ["active", "opposite"] : ["active"];
  for (let start = 0; start < hand.length; start += 1) {
    for (let end = start; end < hand.length; end += 1) {
      for (const valueMode of valueModes) {
        const classification = classifyShow(
          hand.slice(start, end + 1),
          valueMode,
        );
        if (classification !== null) {
          ranges.push({
            action: { type: "show", start, end, valueMode },
            valueMode,
            classification,
            legal: beatsShow(classification, incumbent?.classification ?? null),
          });
        }
      }
    }
  }
  return ranges;
}

export function enumerateScoutActions(
  handLength: number,
  showLength: number,
): readonly ScoutAction[] {
  const actions: ScoutAction[] = [];
  const sides: readonly ("left" | "right")[] =
    showLength === 1 ? ["left"] : ["left", "right"];
  for (const side of sides) {
    for (let insertAt = 0; insertAt <= handLength; insertAt += 1) {
      actions.push({ type: "scout", side, insertAt, flipped: false });
      actions.push({ type: "scout", side, insertAt, flipped: true });
    }
  }
  return actions;
}

function handAfterScout(
  hand: readonly OrientedCard[],
  state: RoundState,
  scout: ScoutAction,
): readonly OrientedCard[] {
  const show = state.activeShow;
  const selected = scout.side === "left" ? show?.cards[0] : show?.cards.at(-1);
  if (selected === undefined) {
    return hand;
  }
  const inserted = { card: selected.card, flipped: scout.flipped };
  return [
    ...hand.slice(0, scout.insertAt),
    inserted,
    ...hand.slice(scout.insertAt),
  ];
}

function remainingShow(state: RoundState, side: ScoutAction["side"]) {
  const cards =
    side === "left"
      ? (state.activeShow?.cards.slice(1) ?? [])
      : (state.activeShow?.cards.slice(0, -1) ?? []);
  const classification =
    state.activeShow === null
      ? null
      : classifyShow(cards, state.activeShow.valueMode);
  return classification === null
    ? null
    : {
        ...state.activeShow!,
        cards,
        classification,
      };
}

function enumerateScoutAndShowActions(
  state: RoundState,
  player: PlayerState,
): {
  readonly actions: readonly ScoutAndShowAction[];
  readonly options: LegalActionOptions["scoutAndShow"]["options"];
} {
  const show = state.activeShow;
  if (show === null) {
    return { actions: [], options: [] };
  }
  const actions: ScoutAndShowAction[] = [];
  const options: {
    scout: ScoutAction;
    ranges: readonly ShowRangeOption[];
  }[] = [];
  for (const scout of enumerateScoutActions(
    player.hand.length,
    show.cards.length,
  )) {
    const hand = handAfterScout(player.hand, state, scout);
    const ranges = enumerateShowRanges(
      hand,
      remainingShow(state, scout.side),
      state.rulesMode,
    );
    if (!ranges.some((range) => range.legal)) {
      continue;
    }
    options.push({ scout, ranges });
    for (const range of ranges) {
      if (!range.legal) {
        continue;
      }
      actions.push({
        type: "scout-and-show",
        side: scout.side,
        insertAt: scout.insertAt,
        flipped: scout.flipped,
        showStart: range.action.start,
        showEnd: range.action.end,
        valueMode: range.action.valueMode,
      });
    }
  }
  return { actions, options };
}

function scoutDisabledReason(
  state: RoundState,
  player: PlayerState,
  turnReason: ActionDisabledReason | undefined,
): ActionDisabledReason | undefined {
  if (turnReason !== undefined) return turnReason;
  if (state.activeShow === null) return "no-active-show";
  if (state.activeShow.ownerId === player.id) return "own-active-show";
  if (state.variant === "two-player" && player.twoPlayerScoutChips <= 0) {
    return "no-scout-chips";
  }
  return undefined;
}

export function selectLegalActions(
  state: RoundState,
  playerId: PlayerId,
): LegalActionOptions {
  const player = playerAt(state, playerId);
  const turnReason = turnDisabledReason(state, playerId);
  const ranges = enumerateShowRanges(
    player.hand,
    state.activeShow,
    state.rulesMode,
  );
  const legalShows = ranges
    .filter((range) => range.legal)
    .map((range) => range.action);
  const showReason =
    turnReason ?? (legalShows.length === 0 ? "no-legal-show" : undefined);
  const scoutReason = scoutDisabledReason(state, player, turnReason);
  const scouts =
    scoutReason === undefined && state.activeShow !== null
      ? enumerateScoutActions(player.hand.length, state.activeShow.cards.length)
      : [];

  let combinedReason = scoutReason;
  if (
    combinedReason === undefined &&
    state.variant !== "standard" &&
    state.rulesMode === "official"
  ) {
    combinedReason = "wrong-variant";
  } else if (combinedReason === undefined && !player.scoutAndShowAvailable) {
    combinedReason = "already-used";
  }
  const combined =
    combinedReason === undefined
      ? enumerateScoutAndShowActions(state, player)
      : { actions: [], options: [] };
  if (combinedReason === undefined && combined.actions.length === 0) {
    combinedReason = "no-combined-show";
  }

  return {
    show: {
      actions: showReason === undefined ? legalShows : [],
      ranges,
      ...(showReason === undefined ? {} : { disabledReason: showReason }),
    },
    scout: {
      actions: scouts,
      ...(scoutReason === undefined ? {} : { disabledReason: scoutReason }),
    },
    scoutAndShow: {
      actions: combined.actions,
      options: combined.options,
      ...(combinedReason === undefined
        ? {}
        : { disabledReason: combinedReason }),
    },
  };
}
