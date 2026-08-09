import { randomInt, shuffle, type RandomSource } from "./rng.js";
import type { Card, OrientedCard, PlayerCount } from "./types.js";

export function createScoutDeck(): readonly Card[] {
  const cards: Card[] = [];
  for (let low = 1; low <= 9; low += 1) {
    for (let high = low + 1; high <= 10; high += 1) {
      cards.push({ id: `${low}-${high}`, low, high });
    }
  }
  return cards;
}

export function deckForPlayerCount(
  playerCount: PlayerCount,
): readonly Card[] {
  const deck = createScoutDeck();
  if (playerCount === 3) {
    return deck.filter((card) => card.high !== 10);
  }
  if (playerCount === 2 || playerCount === 4) {
    return deck.filter((card) => !(card.low === 9 && card.high === 10));
  }
  return deck;
}

export function shuffledDeck(
  playerCount: PlayerCount,
  rng: RandomSource,
): readonly Card[] {
  return shuffle(deckForPlayerCount(playerCount), rng);
}

export function orientCard(
  card: Card,
  flipped = false,
): OrientedCard {
  return { card, flipped };
}

export function randomOrientation(
  card: Card,
  rng: RandomSource,
): OrientedCard {
  return orientCard(card, randomInt(rng, 2) === 1);
}

export function cardValue(card: OrientedCard): number {
  return card.flipped ? card.card.high : card.card.low;
}

export function flipWholeHand(
  hand: readonly OrientedCard[],
): readonly OrientedCard[] {
  return [...hand]
    .reverse()
    .map((card) => ({ card: card.card, flipped: !card.flipped }));
}
