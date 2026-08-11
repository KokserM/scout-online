export type PlayerId = string;
export type CardId = string;
export type PlayerCount = 2 | 3 | 4 | 5;
export type RulesMode = "official" | "vosu";
export type ShowValueMode = "active" | "opposite";

export interface Card {
  readonly id: CardId;
  readonly low: number;
  readonly high: number;
}

export interface OrientedCard {
  readonly card: Card;
  readonly flipped: boolean;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly hand: readonly OrientedCard[];
  readonly captured: readonly Card[];
  readonly scoutTokens: number;
  readonly scoutAndShowAvailable: boolean;
  readonly twoPlayerScoutChips: number;
  readonly orientationChosen: boolean;
}

export type ShowKind = "single" | "run" | "set";

export interface ShowClassification {
  readonly kind: ShowKind;
  readonly size: number;
  readonly rank: number;
}

export interface ActiveShow {
  readonly ownerId: PlayerId;
  readonly cards: readonly OrientedCard[];
  readonly valueMode: ShowValueMode;
  readonly classification: ShowClassification;
  readonly scoutedBy: readonly PlayerId[];
}

export type RoundEndReason = "empty-hand" | "all-scouted" | "two-player-stuck";

export interface RoundResult {
  readonly reason: RoundEndReason;
  readonly winnerId: PlayerId;
  readonly protectedPlayerId?: PlayerId;
  readonly scores: Readonly<Record<PlayerId, number>>;
}

export type RoundStatus =
  | { readonly kind: "active" }
  | { readonly kind: "ended"; readonly result: RoundResult };

export interface RoundState {
  readonly rulesMode: RulesMode;
  readonly variant: "standard" | "two-player";
  readonly playerOrder: readonly PlayerId[];
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly startingPlayerId: PlayerId;
  readonly activePlayerId: PlayerId;
  readonly activeShow: ActiveShow | null;
  readonly status: RoundStatus;
  readonly initialCardIds: readonly CardId[];
  readonly turnNumber: number;
}

export type GameStatus =
  | { readonly kind: "active" }
  | {
      readonly kind: "ended";
      readonly winners: readonly PlayerId[];
      readonly totals: Readonly<Record<PlayerId, number>>;
    };

export interface GameState {
  readonly rulesMode: RulesMode;
  readonly playerOrder: readonly PlayerId[];
  readonly playerCount: PlayerCount;
  readonly initialStartingPlayerId: PlayerId;
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly round: RoundState;
  readonly totals: Readonly<Record<PlayerId, number>>;
  readonly status: GameStatus;
  readonly twoPlayerRoundDecks: readonly (readonly Card[])[];
  readonly scoredCurrentRound: boolean;
}

export interface ShowAction {
  readonly type: "show";
  readonly start: number;
  readonly end: number;
  readonly valueMode: ShowValueMode;
}

export interface ScoutAction {
  readonly type: "scout";
  readonly side: "left" | "right";
  readonly insertAt: number;
  readonly flipped: boolean;
}

export interface ScoutAndShowAction {
  readonly type: "scout-and-show";
  readonly side: "left" | "right";
  readonly insertAt: number;
  readonly flipped: boolean;
  readonly showStart: number;
  readonly showEnd: number;
  readonly valueMode: ShowValueMode;
}

export type GameAction = ShowAction | ScoutAction | ScoutAndShowAction;

export type ActionDisabledReason =
  | "round-ended"
  | "orientations-pending"
  | "not-active-player"
  | "no-legal-show"
  | "no-active-show"
  | "own-active-show"
  | "no-scout-chips"
  | "wrong-variant"
  | "already-used"
  | "no-combined-show";

export interface ShowRangeOption {
  readonly action: ShowAction;
  readonly valueMode: ShowValueMode;
  readonly classification: ShowClassification;
  readonly legal: boolean;
}

export interface ActionAvailability<T> {
  readonly actions: readonly T[];
  readonly disabledReason?: ActionDisabledReason;
}

export interface LegalActionOptions {
  readonly show: ActionAvailability<ShowAction> & {
    readonly ranges: readonly ShowRangeOption[];
  };
  readonly scout: ActionAvailability<ScoutAction>;
  readonly scoutAndShow: ActionAvailability<ScoutAndShowAction> & {
    readonly options: readonly {
      readonly scout: ScoutAction;
      readonly ranges: readonly ShowRangeOption[];
    }[];
  };
}

export interface PublicPlayerView {
  readonly id: PlayerId;
  readonly handCount: number;
  readonly capturedCount: number;
  readonly scoutTokens: number;
  readonly scoutAndShowAvailable: boolean;
  readonly twoPlayerScoutChips: number;
}

export interface PublicRoundView {
  readonly rulesMode: RulesMode;
  readonly variant: RoundState["variant"];
  readonly playerOrder: readonly PlayerId[];
  readonly players: readonly PublicPlayerView[];
  readonly activePlayerId: PlayerId;
  readonly activeShow: ActiveShow | null;
  readonly status: RoundStatus;
  readonly turnNumber: number;
}

export interface PrivatePlayerView extends PublicRoundView {
  readonly viewerId: PlayerId;
  readonly hand: readonly OrientedCard[];
  readonly captured: readonly Card[];
}

export class RulesError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RulesError";
  }
}
