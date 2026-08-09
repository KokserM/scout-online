import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import type { Card, GameState, Play } from "../protocol/types";
import { AccessibleDialog } from "./AccessibleDialog";
import { GameCard } from "./GameCard";

export type ScoutKind = "scout" | "scout-and-show";
export type ScoutStage = "endpoint" | "orientation" | "insertion" | "confirm" | "show";
export interface ScoutFlow {
  kind: ScoutKind;
  stage: ScoutStage;
  endpoint?: "start" | "end";
  flipped?: boolean;
  insertionIndex?: number;
}

interface ScoutWorkflowDialogProps {
  state: GameState;
  flow: ScoutFlow;
  currentPlay: Play;
  pickedCard?: Card;
  displayedHand: Card[];
  availableEndpoints: ("start" | "end")[];
  selectionStatus: string;
  selectedIds: string[];
  showIsLegal: boolean;
  isSelected: (id: string) => boolean;
  getCardProps: (index: number) => object;
  canInsertAt: (index: number) => boolean;
  availableFlips: boolean[];
  onEndpoint: (endpoint: "start" | "end") => void;
  onOrientation: (flipped: boolean) => void;
  onContinue: () => void;
  onInsertion: (index: number) => void;
  onConfirmScout: () => void;
  onShow: () => void;
  onBack: () => void;
  onCancel: () => void;
}

export function ScoutWorkflowDialog({
  state,
  flow,
  currentPlay,
  pickedCard,
  displayedHand,
  availableEndpoints,
  selectionStatus,
  selectedIds,
  showIsLegal,
  isSelected,
  getCardProps,
  canInsertAt,
  availableFlips,
  onEndpoint,
  onOrientation,
  onContinue,
  onInsertion,
  onConfirmScout,
  onShow,
  onBack,
  onCancel,
}: ScoutWorkflowDialogProps) {
  return (
    <AccessibleDialog className="choice-card scout-choice" labelledBy="scout-title" onClose={onCancel}>
      <p className="eyebrow">{flow.kind === "scout-and-show" ? "SCOUT & SHOW" : "SCOUT A CARD"}</p>
      {flow.stage === "endpoint" ? (
        <>
          <h1 id="scout-title">Take from either end.</h1>
          <p>Pick one legal end card from the current play.</p>
          <div className="scout-row">
            <button className="scout-end" disabled={!availableEndpoints.includes("start")} onClick={() => onEndpoint("start")}><ChevronLeft /> Take left</button>
            <div className="table-play">{currentPlay.cards.map((card) => <GameCard card={card} compact key={card.id} />)}</div>
            <button className="scout-end" disabled={!availableEndpoints.includes("end")} onClick={() => onEndpoint("end")}>Take right <ChevronRight /></button>
          </div>
        </>
      ) : flow.stage === "orientation" ? (
        <>
          <h1 id="scout-title">Which way is up?</h1>
          <p>Choose one of the orientations that can continue this move.</p>
          {pickedCard && <div className="scout-card-preview"><GameCard card={pickedCard} compact /></div>}
          <div className="stage-actions" role="group" aria-label="Choose card orientation">
            {availableFlips.map((flipped) => {
              const endpointCard = flow.endpoint === "start"
                ? currentPlay.cards[0]
                : currentPlay.cards.at(-1);
              const value = endpointCard
                ? flipped
                  ? Math.max(endpointCard.top, endpointCard.bottom)
                  : Math.min(endpointCard.top, endpointCard.bottom)
                : undefined;
              return (
                <button
                  className={flow.flipped === flipped ? "button button--primary" : "button button--secondary"}
                  aria-pressed={flow.flipped === flipped}
                  key={String(flipped)}
                  onClick={() => onOrientation(flipped)}
                >
                  <RotateCw /> Use value {value}
                </button>
              );
            })}
          </div>
          <button className="button button--primary" disabled={flow.flipped === undefined} onClick={onContinue}>Choose a gap</button>
        </>
      ) : flow.stage === "insertion" ? (
        <>
          <h1 id="scout-title">Where does it go?</h1>
          <p>Every legal gap is shown once. Your hand’s order stays unchanged.</p>
          <div className="insertion-picker" aria-label="Choose insertion position">
            {Array.from({ length: state.hand.length + 1 }, (_, index) => (
              <div className="insertion-gap-item" key={`gap-${index}`}>
                <button disabled={!canInsertAt(index)} onClick={() => onInsertion(index)} aria-label={`Insert at position ${index}`}>+</button>
                {state.hand[index] && <GameCard card={state.hand[index]} compact />}
              </div>
            ))}
          </div>
        </>
      ) : flow.stage === "confirm" ? (
        <>
          <h1 id="scout-title">Confirm this Scout?</h1>
          <p>The highlighted card will be inserted here only after you confirm.</p>
          <div className="preview-hand" aria-label="Resulting hand preview">{displayedHand.map((card) => <GameCard card={card} compact key={card.id} />)}</div>
          <button className="button button--primary" onClick={onConfirmScout}>Confirm Scout</button>
        </>
      ) : (
        <>
          <h1 id="scout-title">Choose your Show.</h1>
          <p>This is your resulting hand. Select a contiguous legal range to complete both actions.</p>
          <div className="preview-hand selectable-preview" aria-label="Resulting hand preview">
            {displayedHand.map((card, index) => <GameCard card={card} selected={isSelected(card.id)} {...getCardProps(index)} key={card.id} />)}
          </div>
          <p aria-live="polite">{selectionStatus}</p>
          <button className="button button--primary" disabled={!showIsLegal} onClick={onShow}>Confirm Scout &amp; Show {selectedIds.length || ""}</button>
        </>
      )}
      <div className="stage-actions">
        {flow.stage !== "endpoint" && <button className="text-button" onClick={onBack}><ChevronLeft /> Back</button>}
        <button className="text-button" onClick={onCancel}>Cancel</button>
      </div>
    </AccessibleDialog>
  );
}
