import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import type { Card, GameState, Play, ShowValueMode } from "../protocol/types";
import { AccessibleDialog } from "./AccessibleDialog";
import { GameCard } from "./GameCard";
import { ShowValueModePicker } from "./ShowValueModePicker";

export type ScoutKind = "scout" | "scout-and-show";
export type ScoutStage =
  "endpoint" | "orientation" | "insertion" | "confirm" | "show";
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
  insertedCardId?: string;
  displayedHand: Card[];
  availableEndpoints: ("start" | "end")[];
  selectionStatus: string;
  selectedIds: string[];
  showIsLegal: boolean;
  valueModes?: ShowValueMode[];
  selectedValueMode?: ShowValueMode | undefined;
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
  onValueMode?: (mode: ShowValueMode) => void;
  onBack: () => void;
  onCancel: () => void;
}

export function ScoutWorkflowDialog({
  state,
  flow,
  currentPlay,
  pickedCard,
  insertedCardId,
  displayedHand,
  availableEndpoints,
  selectionStatus,
  selectedIds,
  showIsLegal,
  valueModes = [],
  selectedValueMode,
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
  onValueMode = () => undefined,
  onBack,
  onCancel,
}: ScoutWorkflowDialogProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const previewScrollLeftRef = useRef(0);
  const pendingPreviewScrollLeftRef = useRef<number | null>(null);
  const selectedIdsKey = selectedIds.join("\0");

  useLayoutEffect(() => {
    if (flow.stage !== "show") return;
    const preview = previewRef.current;
    if (!preview) return;
    const scrollLeft =
      pendingPreviewScrollLeftRef.current ?? previewScrollLeftRef.current;
    preview.scrollLeft = scrollLeft;
    previewScrollLeftRef.current = scrollLeft;
    pendingPreviewScrollLeftRef.current = null;
  }, [flow.stage, selectedIdsKey]);

  const preservePreviewScrollForSelection = () => {
    const preview = previewRef.current;
    if (preview) pendingPreviewScrollLeftRef.current = preview.scrollLeft;
  };

  return (
    <AccessibleDialog
      className="choice-card scout-choice"
      labelledBy="scout-title"
      initialFocus="#scout-title"
      initialFocusKey={flow.stage}
      onClose={onCancel}
    >
      <p className="eyebrow">
        {flow.kind === "scout-and-show" ? "SCOUT & SHOW" : "SCOUT A CARD"}
      </p>
      {flow.stage === "endpoint" ? (
        <>
          <h1 id="scout-title" tabIndex={-1}>
            Take from either end.
          </h1>
          <p>Pick one legal end card from the current play.</p>
          <div className="scout-row">
            <button
              className="scout-end"
              disabled={!availableEndpoints.includes("start")}
              onClick={() => onEndpoint("start")}
            >
              <ChevronLeft /> Take left
            </button>
            <div className="table-play">
              {currentPlay.cards.map((card) => (
                <GameCard card={card} compact key={card.id} />
              ))}
            </div>
            <button
              className="scout-end"
              disabled={!availableEndpoints.includes("end")}
              onClick={() => onEndpoint("end")}
            >
              Take right <ChevronRight />
            </button>
          </div>
        </>
      ) : flow.stage === "orientation" ? (
        <>
          <h1 id="scout-title" tabIndex={-1}>
            Set the Scouted card’s orientation.
          </h1>
          <p>
            This newly Scouted card may use either available orientation now,
            before insertion. Once inserted, its large upright active value is
            locked; the small OPPOSITE number is only a reference.
          </p>
          {pickedCard && (
            <div className="scout-card-preview">
              <GameCard card={pickedCard} compact />
            </div>
          )}
          <div
            className="stage-actions"
            role="group"
            aria-label="Choose card orientation"
          >
            {availableFlips.map((flipped) => {
              const endpointCard =
                flow.endpoint === "start"
                  ? currentPlay.cards[0]
                  : currentPlay.cards.at(-1);
              const value = endpointCard
                ? flipped
                  ? Math.max(endpointCard.top, endpointCard.bottom)
                  : Math.min(endpointCard.top, endpointCard.bottom)
                : undefined;
              return (
                <button
                  className={
                    flow.flipped === flipped
                      ? "button button--primary"
                      : "button button--secondary"
                  }
                  aria-pressed={flow.flipped === flipped}
                  key={String(flipped)}
                  onClick={() => onOrientation(flipped)}
                >
                  <RotateCw /> Use value {value}
                </button>
              );
            })}
          </div>
          <button
            className="button button--primary"
            disabled={flow.flipped === undefined}
            onClick={onContinue}
          >
            Choose a gap
          </button>
        </>
      ) : flow.stage === "insertion" ? (
        <>
          <h1 id="scout-title" tabIndex={-1}>
            Where does it go?
          </h1>
          <p>
            Every legal gap is shown once. The Scouted card’s orientation is now
            set, and the rest of your hand stays unchanged.
          </p>
          {pickedCard && (
            <div
              className="scouted-card-key"
              aria-label="Scouted card to insert"
            >
              <GameCard card={pickedCard} compact inserted />
              <strong>SCOUTED card</strong>
            </div>
          )}
          <div
            className="insertion-picker"
            aria-label="Choose insertion position"
          >
            {Array.from({ length: state.hand.length + 1 }, (_, index) => (
              <div className="insertion-gap-item" key={`gap-${index}`}>
                <button
                  disabled={!canInsertAt(index)}
                  onClick={() => onInsertion(index)}
                  aria-label={`Insert at position ${index}`}
                >
                  +
                </button>
                {state.hand[index] && (
                  <GameCard card={state.hand[index]} compact />
                )}
              </div>
            ))}
          </div>
        </>
      ) : flow.stage === "confirm" ? (
        <>
          <h1 id="scout-title" tabIndex={-1}>
            Confirm this Scout?
          </h1>
          <p>
            The card marked SCOUTED will be inserted here only after you
            confirm. Its large upright number is the active value.
          </p>
          <div className="preview-hand" aria-label="Resulting hand preview">
            {displayedHand.map((card) => (
              <GameCard
                card={card}
                compact
                inserted={card.id === insertedCardId}
                key={card.id}
              />
            ))}
          </div>
          <button className="button button--primary" onClick={onConfirmScout}>
            Confirm Scout
          </button>
        </>
      ) : (
        <>
          <h1 id="scout-title" tabIndex={-1}>
            Choose your Show.
          </h1>
          <p>
            This is your resulting hand. Select a contiguous legal range
            {state.rulesMode === "vosu"
              ? ", then use ACTIVE or OPPOSITE for every card in the Show."
              : " using only each card’s large upright active value."}
          </p>
          <div
            ref={previewRef}
            className="preview-hand selectable-preview"
            aria-label="Resulting hand preview"
            onScroll={(event) => {
              previewScrollLeftRef.current = event.currentTarget.scrollLeft;
              if (pendingPreviewScrollLeftRef.current !== null) {
                pendingPreviewScrollLeftRef.current =
                  event.currentTarget.scrollLeft;
              }
            }}
            onPointerDownCapture={preservePreviewScrollForSelection}
            onKeyDownCapture={(event) => {
              if (event.key === " " || event.key === "Enter")
                preservePreviewScrollForSelection();
            }}
          >
            {displayedHand.map((card, index) => (
              <GameCard
                card={card}
                selected={isSelected(card.id)}
                {...(isSelected(card.id) && selectedValueMode
                  ? { effectiveValueMode: selectedValueMode }
                  : {})}
                inserted={card.id === insertedCardId}
                layoutAnimation={false}
                {...getCardProps(index)}
                key={card.id}
              />
            ))}
          </div>
          <div className="selection-feedback" role="status" aria-live="polite">
            <strong>
              {selectedIds.length} {selectedIds.length === 1 ? "card" : "cards"}{" "}
              selected
            </strong>
            <span>{selectionStatus}</span>
          </div>
          {state.rulesMode === "vosu" && (
            <ShowValueModePicker
              modes={valueModes}
              value={selectedValueMode}
              onChange={onValueMode}
            />
          )}
          <button
            className="button button--primary"
            disabled={!showIsLegal}
            onClick={onShow}
          >
            Confirm Scout &amp; Show {selectedIds.length || ""}
          </button>
        </>
      )}
      <div className="stage-actions">
        {flow.stage !== "endpoint" && (
          <button className="text-button" onClick={onBack}>
            <ChevronLeft /> Back
          </button>
        )}
        <button className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </AccessibleDialog>
  );
}
