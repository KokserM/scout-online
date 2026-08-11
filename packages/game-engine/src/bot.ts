import type { RandomSource } from "./rng.js";
import { randomInt } from "./rng.js";
import { enumerateScoutActions } from "./legal-actions.js";
import { classifyShow, enumerateLegalShows } from "./shows.js";
import type {
  GameAction,
  OrientedCard,
  PrivatePlayerView,
  ScoutAndShowAction,
} from "./types.js";
import { RulesError } from "./types.js";

export type BotDifficulty = "easy" | "standard";

function randomItem<T>(values: readonly T[], rng: RandomSource): T {
  const value = values[randomInt(rng, values.length)];
  if (value === undefined) {
    throw new RulesError("Cannot choose from an empty action list");
  }
  return value;
}

function value(oriented: OrientedCard): number {
  return oriented.flipped ? oriented.card.high : oriented.card.low;
}

function adjacencyScore(
  hand: readonly OrientedCard[],
  insertAt: number,
  card: OrientedCard,
): number {
  const candidate = value(card);
  let score = 0;
  for (const neighbor of [hand[insertAt - 1], hand[insertAt]]) {
    if (!neighbor) continue;
    const difference = Math.abs(value(neighbor) - candidate);
    if (difference === 0) score += 5;
    else if (difference === 1) score += 4;
    else if (difference === 2) score += 1;
  }
  return score;
}

function bestByScore<T>(
  values: readonly T[],
  score: (value: T) => number,
  rng: RandomSource,
): T {
  const highest = Math.max(...values.map(score));
  return randomItem(
    values.filter((value) => score(value) === highest),
    rng,
  );
}

function scoutAndShowOptions(
  view: PrivatePlayerView,
): readonly ScoutAndShowAction[] {
  const show = view.activeShow;
  if (show === null) {
    return [];
  }
  const actions: ScoutAndShowAction[] = [];
  for (const scout of enumerateScoutActions(
    view.hand.length,
    show.cards.length,
  )) {
    const selected =
      scout.side === "left" ? show.cards[0] : show.cards[show.cards.length - 1];
    if (selected === undefined) {
      continue;
    }
    const card: OrientedCard = {
      card: selected.card,
      flipped: scout.flipped,
    };
    const hand = [
      ...view.hand.slice(0, scout.insertAt),
      card,
      ...view.hand.slice(scout.insertAt),
    ];
    const remaining =
      scout.side === "left" ? show.cards.slice(1) : show.cards.slice(0, -1);
    const incumbent = classifyShow(remaining, show.valueMode);
    for (const shown of enumerateLegalShows(hand, incumbent, view.rulesMode)) {
      actions.push({
        type: "scout-and-show",
        side: scout.side,
        insertAt: scout.insertAt,
        flipped: scout.flipped,
        showStart: shown.start,
        showEnd: shown.end,
        valueMode: shown.valueMode,
      });
    }
  }
  return actions;
}

/**
 * Selects an action using only the bot's sanitized private view. Opponent hand
 * identities, deck order, and server state are deliberately not accepted.
 */
export function chooseBotAction(
  view: PrivatePlayerView,
  rng: RandomSource,
  difficulty: BotDifficulty = "standard",
): GameAction {
  if (view.status.kind !== "active") {
    throw new RulesError("The round has ended");
  }
  if (view.activePlayerId !== view.viewerId) {
    throw new RulesError("The bot is not the active player");
  }
  const legalShows = enumerateLegalShows(
    view.hand,
    view.activeShow?.classification ?? null,
    view.rulesMode,
  );
  const self = view.players.find((player) => player.id === view.viewerId);
  if (self === undefined) {
    throw new RulesError("Bot view is missing its public player record");
  }
  if (view.activeShow?.ownerId === view.viewerId && legalShows.length === 0) {
    throw new RulesError("A bot cannot scout its own active show");
  }
  if (difficulty === "easy") {
    const canScout =
      view.activeShow !== null &&
      view.activeShow.ownerId !== view.viewerId &&
      (view.variant === "standard" || self.twoPlayerScoutChips > 0);
    if (legalShows.length > 0 && (!canScout || randomInt(rng, 100) < 70)) {
      return randomItem(legalShows, rng);
    }
    if (canScout && view.activeShow !== null) {
      return randomItem(
        enumerateScoutActions(view.hand.length, view.activeShow.cards.length),
        rng,
      );
    }
  }
  if (legalShows.length > 0) {
    // Prefer shedding cards and capturing a large incumbent while preserving
    // useful adjacent pairs in the remaining hand.
    return bestByScore(
      legalShows,
      (action) => {
        const length = action.end - action.start + 1;
        const left = view.hand[action.start - 1];
        const right = view.hand[action.end + 1];
        const bridge =
          left && right && Math.abs(value(left) - value(right)) <= 1 ? 3 : 0;
        return length * 20 + (view.activeShow?.cards.length ?? 0) * 3 + bridge;
      },
      rng,
    );
  }

  if (view.activeShow === null) {
    throw new RulesError("No legal action exists");
  }

  const canScoutAndShow =
    self.scoutAndShowAvailable &&
    view.activeShow.ownerId !== view.viewerId &&
    (view.variant === "standard" ||
      (view.rulesMode === "vosu" && self.twoPlayerScoutChips > 0));
  if (canScoutAndShow) {
    // An unlimited VOSU Scout & Show that only replaces the scouted card can
    // cycle forever. Prefer a plain Scout unless the combined action reduces
    // the hand; two-player chips and official once-per-round use are bounded.
    const combined = scoutAndShowOptions(view).filter(
      (action) =>
        view.rulesMode === "official" ||
        view.variant === "two-player" ||
        action.showEnd - action.showStart + 1 > 1,
    );
    if (combined.length > 0) {
      return bestByScore(
        combined,
        (action) =>
          (action.showEnd - action.showStart + 1) * 20 +
          (view.activeShow?.cards.length ?? 0) * 3 -
          (action.showStart <= action.insertAt &&
          action.insertAt <= action.showEnd
            ? 0
            : 2),
        rng,
      );
    }
  }
  if (view.variant === "two-player" && self.twoPlayerScoutChips <= 0) {
    throw new RulesError("No legal action exists");
  }
  const scouts = enumerateScoutActions(
    view.hand.length,
    view.activeShow.cards.length,
  );
  return bestByScore(
    scouts,
    (action) => {
      const selected =
        action.side === "left"
          ? view.activeShow?.cards[0]
          : view.activeShow?.cards.at(-1);
      if (!selected) return Number.NEGATIVE_INFINITY;
      const inserted = { card: selected.card, flipped: action.flipped };
      const conservation =
        view.variant === "two-player" && self.twoPlayerScoutChips === 1
          ? -6
          : 0;
      return (
        adjacencyScore(view.hand, action.insertAt, inserted) + conservation
      );
    },
    rng,
  );
}
