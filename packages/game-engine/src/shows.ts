import { cardValue } from "./cards.js";
import type {
  OrientedCard,
  ShowAction,
  ShowClassification,
  ShowKind,
} from "./types.js";

export function classifyShow(
  cards: readonly OrientedCard[],
): ShowClassification | null {
  if (cards.length === 0) {
    return null;
  }
  const values = cards.map(cardValue);
  const first = values[0];
  if (first === undefined) {
    return null;
  }
  if (values.length === 1) {
    return { kind: "single", size: 1, rank: first };
  }

  if (values.every((value) => value === first)) {
    return { kind: "set", size: values.length, rank: first };
  }

  const direction = (values[1] ?? first) - first;
  if (
    (direction === 1 || direction === -1) &&
    values.every(
      (value, index) => index === 0 || value === first + direction * index,
    )
  ) {
    return {
      kind: "run",
      size: values.length,
      rank: Math.max(...values),
    };
  }
  return null;
}

function kindStrength(kind: ShowKind): number {
  if (kind === "set") {
    return 2;
  }
  if (kind === "run") {
    return 1;
  }
  return 0;
}

export function compareShows(
  challenger: ShowClassification,
  incumbent: ShowClassification,
): number {
  if (challenger.size !== incumbent.size) {
    return challenger.size - incumbent.size;
  }
  const kindDifference =
    kindStrength(challenger.kind) - kindStrength(incumbent.kind);
  if (kindDifference !== 0) {
    return kindDifference;
  }
  return challenger.rank - incumbent.rank;
}

export function beatsShow(
  challenger: ShowClassification,
  incumbent: ShowClassification | null,
): boolean {
  return incumbent === null || compareShows(challenger, incumbent) > 0;
}

export function enumerateLegalShows(
  hand: readonly OrientedCard[],
  incumbent: ShowClassification | null,
): readonly ShowAction[] {
  const actions: ShowAction[] = [];
  for (let start = 0; start < hand.length; start += 1) {
    for (let end = start; end < hand.length; end += 1) {
      const classification = classifyShow(hand.slice(start, end + 1));
      if (
        classification !== null &&
        beatsShow(classification, incumbent)
      ) {
        actions.push({ type: "show", start, end });
      }
    }
  }
  return actions;
}
