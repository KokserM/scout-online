import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownToLine,
  Eye,
  HelpCircle,
  LogOut,
  Sparkles,
} from "lucide-react";
import type { Card, GameState, Player, ShowValueMode } from "../protocol/types";
import { GameCard } from "./GameCard";
import { RulesModeBadge } from "./RulesModeBadge";
import { ShowValueModePicker } from "./ShowValueModePicker";
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
  valueModes: ShowValueMode[];
  selectedValueMode: ShowValueMode | undefined;
  scoutShowInProgress: boolean;
  readOnly?: boolean;
  onScout: () => void;
  onScoutAndShow: () => void;
  onShow: () => void;
  onValueMode: (mode: ShowValueMode) => void;
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
  valueModes,
  selectedValueMode,
  scoutShowInProgress,
  readOnly,
  onScout,
  onScoutAndShow,
  onShow,
  onValueMode,
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
        <span>
          <b>Your hand</b> · {state.hand.length} cards
        </span>
        <span>
          <RulesModeBadge mode={state.rulesMode} /> · {showCount} selected ·{" "}
          {selectionStatus}
        </span>
      </div>
      {state.round === 1 && (
        <p className="orientation-hint">
          <strong>Card key:</strong>{" "}
          {state.rulesMode === "vosu"
            ? "The large upright number is ACTIVE. Choose ACTIVE or OPPOSITE for the whole Show when both are legal."
            : "The large upright number is active for Show. The small OPPOSITE number is a reference and cannot be selected."}
        </p>
      )}
      <div className="hand-scroll">
        <motion.div
          className="hand"
          layout={!scoutShowInProgress && !reduceMotion}
        >
          {handBehindDialog.map((card, index) =>
            scoutShowInProgress ? (
              <GameCard card={card} layoutAnimation={false} key={card.id} />
            ) : (
              <GameCard
                card={card}
                selected={selection.isSelected(card.id)}
                {...(selection.isSelected(card.id) && selectedValueMode
                  ? { effectiveValueMode: selectedValueMode }
                  : {})}
                {...selection.getCardProps(index)}
                key={card.id}
              />
            ),
          )}
        </motion.div>
      </div>
      <div className="action-bar">
        <div className="action-context">
          <div className="turn-prompt">
            <span className={isTurn ? "turn-dot is-live" : "turn-dot"} />
            {readOnly ? (
              <>
                <Eye /> Preview only
              </>
            ) : isTurn ? (
              "Choose your move"
            ) : (
              "Watch the table"
            )}
          </div>
          <div
            className="action-selection-feedback"
            role="status"
            aria-live="polite"
          >
            <strong>
              {showCount} {showCount === 1 ? "card" : "cards"} selected
            </strong>
            <span>{selectionStatus}</span>
          </div>
          {state.rulesMode === "vosu" && !scoutShowInProgress && (
            <ShowValueModePicker
              modes={valueModes}
              value={selectedValueMode}
              onChange={onValueMode}
            />
          )}
          <small className="mode-status">
            {state.variant === "two-player"
              ? state.rulesMode === "vosu"
                ? `Scout or Scout & Show spends a chip · ${self?.scoutChips ?? 0} left · no Scout point`
                : `Scout spends a chip · ${self?.scoutChips ?? 0} remaining`
              : state.rulesMode === "vosu"
                ? "Scout gives the Show owner +1 and passes · Scout & Show unlimited"
                : `Scout gives the Show owner +1 · Scout & Show ${self?.scoutAndShowAvailable ? "ready" : "used"} this round`}
          </small>
        </div>
        <div className="action-buttons">
          <button
            className="icon-button utility-action"
            onClick={onHelp}
            aria-label="Show contextual help"
          >
            <HelpCircle />
          </button>
          <button
            className="button button--secondary"
            title={disabledReason(state.availableActions.scout.disabledReason)}
            disabled={readOnly || !state.availableActions.scout.enabled}
            onClick={onScout}
          >
            <ArrowDownToLine /> Scout{" "}
            {state.variant === "two-player" ? `(${self?.scoutChips ?? 0})` : ""}
          </button>
          {(state.variant === "standard" || state.rulesMode === "vosu") && (
            <button
              className="button button--secondary"
              title={disabledReason(
                state.availableActions.scoutAndShow.disabledReason,
              )}
              disabled={
                readOnly || !state.availableActions.scoutAndShow.enabled
              }
              onClick={onScoutAndShow}
            >
              <Sparkles /> Scout & Show
            </button>
          )}
          <button
            className="button button--primary"
            title={disabledReason(state.availableActions.show.disabledReason)}
            disabled={readOnly || !showIsLegal || scoutShowInProgress}
            onClick={onShow}
          >
            Show {showCount || ""}
          </button>
          <button
            className="icon-button utility-action"
            onClick={onLeave}
            aria-label={readOnly ? "Exit preview" : "Leave table"}
          >
            <LogOut />
          </button>
        </div>
      </div>
    </section>
  );
}
