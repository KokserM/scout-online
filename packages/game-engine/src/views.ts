import type {
  PlayerId,
  PrivatePlayerView,
  PublicPlayerView,
  PublicRoundView,
  RoundState,
} from "./types.js";
import { RulesError } from "./types.js";

export function toPublicRoundView(state: RoundState): PublicRoundView {
  const players: PublicPlayerView[] = state.playerOrder.map((id) => {
    const player = state.players[id];
    if (player === undefined) {
      throw new RulesError(`Missing player: ${id}`);
    }
    return {
      id,
      handCount: player.hand.length,
      capturedCount: player.captured.length,
      scoutTokens: player.scoutTokens,
      scoutAndShowAvailable: player.scoutAndShowAvailable,
      twoPlayerScoutChips: player.twoPlayerScoutChips,
    };
  });
  return {
    variant: state.variant,
    playerOrder: [...state.playerOrder],
    players,
    activePlayerId: state.activePlayerId,
    activeShow:
      state.activeShow === null
        ? null
        : {
            ...state.activeShow,
            cards: state.activeShow.cards.map((card) => ({
              card: { ...card.card },
              flipped: card.flipped,
            })),
            scoutedBy: [...state.activeShow.scoutedBy],
          },
    status: state.status,
    turnNumber: state.turnNumber,
  };
}

export function toPrivatePlayerView(
  state: RoundState,
  viewerId: PlayerId,
): PrivatePlayerView {
  const player = state.players[viewerId];
  if (player === undefined) {
    throw new RulesError(`Unknown viewer: ${viewerId}`);
  }
  return {
    ...toPublicRoundView(state),
    viewerId,
    hand: player.hand.map((card) => ({
      card: { ...card.card },
      flipped: card.flipped,
    })),
    captured: player.captured.map((card) => ({ ...card })),
  };
}
