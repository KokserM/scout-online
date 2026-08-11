import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownToLine, Eye, HelpCircle, LogOut, Sparkles } from "lucide-react";
import type { Card, GameState, Player } from "../protocol/types";
import { GameCard } from "./GameCard";
import type { useHandRangeSelection } from "./useHandRangeSelection";

type Selection = ReturnType<typeof useHandRangeSelection>;

interface GameHandActionBarProps {
  state: GameState;
  self?: Player;
  displayedHand: Card[];
  selection: Selection;
  selectionStatus: string;
  showIsLegal: boolean;
  showCount: number;
  scoutShowInProgress: boolean;
  readOnly?: boolean;
  onScout: () => void;
  onScoutAndShow: () => void;
  onShow: () => void;
  onHelp: () => void;
  onLeave: () => void;
  disabledReason: (reason?: string) => string | undefined;
}

export function GameHandActionBar({
  state,
  self,
  displayedHand,
  selection,
  selectionStatus,
  showIsLegal,
  showCount,
  scoutShowInProgress,
  readOnly,
  onScout,
  onScoutAndShow,
  onShow,
  onHelp,
  onLeave,
  disabledReason,
}: GameHandActionBarProps) {
  const reduceMotion = useReducedMotion();
  const isTurn = state.activePlayerId === state.selfId;
  const handBehindDialog = scoutShowInProgress ? state.hand : displayedHand;
  return (
    <section className="hand-zone" aria-label="Your hand">
      <div className="hand-heading">
        <span><b>Your hand</b> · {state.hand.length} cards</span>
        <span>{showCount} selected · {selectionStatus}</span>
      </div>
      {state.round === 1 && (
        <p className="orientation-hint">
          <strong>Card key:</strong> the large upright number is active for Show. The small OPPOSITE number is a reference and cannot be selected.
        </p>
      )}
      <div className="hand-scroll">
        <motion.div className="hand" layout={!scoutShowInProgress && !reduceMotion}>
          {handBehindDialog.map((card, index) => (
            scoutShowInProgress
              ? <GameCard card={card} layoutAnimation={false} key={card.id} />
              : <GameCard card={card} selected={selection.isSelected(card.id)} {...selection.getCardProps(index)} key={card.id} />
          ))}
        </motion.div>
      </div>
      <div className="action-bar">
        <div className="action-context">
          <div className="turn-prompt">
            <span className={isTurn ? "turn-dot is-live" : "turn-dot"} />
            {readOnly ? <><Eye /> Preview only</> : isTurn ? "Choose your move" : "Watch the table"}
          </div>
          <div className="action-selection-feedback" role="status" aria-live="polite">
            <strong>{showCount} {showCount === 1 ? "card" : "cards"} selected</strong>
            <span>{selectionStatus}</span>
          </div>
        </div>
        <div className="action-buttons">
          <button className="icon-button utility-action" onClick={onHelp} aria-label="Show contextual help"><HelpCircle /></button>
          <button className="button button--secondary" title={disabledReason(state.availableActions.scout.disabledReason)} disabled={readOnly || !state.availableActions.scout.enabled} onClick={onScout}>
            <ArrowDownToLine /> Scout {state.variant === "two-player" ? `(${self?.scoutChips ?? 0})` : ""}
          </button>
          {state.variant === "standard" && (
            <button className="button button--secondary" title={disabledReason(state.availableActions.scoutAndShow.disabledReason)} disabled={readOnly || !state.availableActions.scoutAndShow.enabled} onClick={onScoutAndShow}>
              <Sparkles /> Scout & Show
            </button>
          )}
          <button className="button button--primary" title={disabledReason(state.availableActions.show.disabledReason)} disabled={readOnly || !showIsLegal || scoutShowInProgress} onClick={onShow}>Show {showCount || ""}</button>
          <button className="icon-button utility-action" onClick={onLeave} aria-label={readOnly ? "Exit preview" : "Leave table"}><LogOut /></button>
        </div>
      </div>
    </section>
  );
}
