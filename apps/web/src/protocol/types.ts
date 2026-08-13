export type Suit = "coral" | "gold" | "mint" | "sky" | "violet";
export type Phase =
  "lobby" | "orientation" | "playing" | "round-results" | "final";
export type Screen = "home" | "join" | "lobby" | "game";
export type RulesMode = "official" | "vosu";
export type ShowValueMode = "active" | "opposite";

export interface Card {
  id: string;
  top: number;
  bottom: number;
  suit: Suit;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  handCount: number;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  isBot: boolean;
  botDifficulty?: "easy" | "standard" | undefined;
  capturedCount: number;
  scoutPoints: number;
  scoutAndShowAvailable: boolean;
  scoutChips: number;
  orientationChosen?: boolean | undefined;
}

export interface Play {
  id: string;
  playerId: string;
  cards: Card[];
  valueMode: ShowValueMode;
}

export interface Activity {
  id: string;
  message: string;
  tone?: "neutral" | "good" | "warning" | undefined;
}

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

export interface AvailableActions {
  show: {
    enabled: boolean;
    disabledReason?: ActionDisabledReason | undefined;
    ranges: {
      cardIds: string[];
      kind: "single" | "run" | "set";
      valueMode: ShowValueMode;
      legal: boolean;
    }[];
  };
  scout: {
    enabled: boolean;
    disabledReason?: ActionDisabledReason | undefined;
    playId?: string | undefined;
    endpoints: ("start" | "end")[];
    insertionCount: number;
    flipped: boolean[];
  };
  scoutAndShow: {
    enabled: boolean;
    disabledReason?: ActionDisabledReason | undefined;
    playId?: string | undefined;
    options: {
      position: "start" | "end";
      insertAt: number;
      flipped: boolean;
      showRanges: {
        cardIds: string[];
        kind: "single" | "run" | "set";
        valueMode: ShowValueMode;
        legal: boolean;
      }[];
    }[];
  };
}

export interface GameState {
  roomCode: string;
  phase: Phase;
  selfId: string;
  hostId: string;
  players: Player[];
  hand: Card[];
  table: Play[];
  activePlayerId?: string | undefined;
  startingPlayerId?: string | undefined;
  scoutTargetId?: string | undefined;
  round: number;
  totalRounds: number;
  rulesMode: RulesMode;
  variant: "standard" | "two-player";
  mustChooseOrientation: boolean;
  availableActions: AvailableActions;
  roundScores?: RoundScore[] | undefined;
  roundOutcome?: RoundOutcome | undefined;
  activity: Activity[];
  canStart: boolean;
  reconnectGraceMs: number;
}

export interface RoundScore {
  playerId: string;
  capturedCards: number;
  scoutPoints: number;
  cardsRemaining: number;
  unusedScoutChips: number;
  handPenaltyExempt: boolean;
  roundTotal: number;
  cumulativeTotal: number;
}

export type RoundEndReason = "empty-hand" | "all-scouted" | "two-player-stuck";

export interface RoundOutcome {
  reason: RoundEndReason;
  winnerId: string;
  protectedPlayerId?: string | undefined;
}

export type ClientAction =
  | { type: "create-room"; name: string }
  | { type: "join-room"; name: string; roomCode: string }
  | { type: "quick-play"; name: string }
  | { type: "set-ready"; ready: boolean }
  | { type: "add-bot"; difficulty: "easy" | "standard" }
  | { type: "remove-bot"; playerId: string }
  | { type: "set-rules-mode"; rulesMode: RulesMode }
  | { type: "start-game" }
  | { type: "next-round" }
  | { type: "rematch" }
  | { type: "choose-orientation"; flipped: boolean }
  | { type: "show"; cardIds: string[]; valueMode: ShowValueMode }
  | {
      type: "scout";
      playId: string;
      position: "start" | "end";
      insertionIndex: number;
      flipped: boolean;
    }
  | {
      type: "scout-and-show";
      playId: string;
      position: "start" | "end";
      insertionIndex: number;
      flipped: boolean;
      cardIds: string[];
      valueMode: ShowValueMode;
    }
  | { type: "leave-room" };

export interface ServerError {
  code: string;
  message: string;
}
