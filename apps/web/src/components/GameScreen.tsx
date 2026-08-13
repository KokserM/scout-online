import { AnimatePresence } from "framer-motion";
import { Eye } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ClientAction, GameState, ShowValueMode } from "../protocol/types";
import { AccessibleDialog } from "./AccessibleDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { ConnectionBanner } from "./ConnectionBanner";
import { GameHandActionBar } from "./GameHandActionBar";
import { GameResults } from "./GameResults";
import { GameTable, OpponentStrip } from "./GameTable";
import { OrientationDialog } from "./OrientationDialog";
import {
  ScoutWorkflowDialog,
  type ScoutFlow,
  type ScoutKind,
} from "./ScoutWorkflowDialog";
import { useHandRangeSelection } from "./useHandRangeSelection";
import { useScoutPointFeedback } from "./useScoutPointFeedback";

interface GameScreenProps {
  state: GameState;
  connected: boolean;
  dispatch: (action: ClientAction) => void;
  readOnly?: boolean;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

function disabledReason(reason?: string): string | undefined {
  if (!reason) return undefined;
  return (
    {
      "round-ended": "The round has ended",
      "orientations-pending": "Waiting for hand orientations",
      "not-active-player": "It is not your turn",
      "no-legal-show": "No Show beats the table",
      "no-active-show": "There is no Show to Scout",
      "own-active-show": "You cannot Scout your own Show",
      "no-scout-chips": "No Scout chips remain",
      "wrong-variant": "Unavailable in this variant",
      "already-used": "Scout & Show was already used",
      "no-combined-show": "No Scout & Show option is legal",
    }[reason] ?? reason
  );
}

export function GameScreen({
  state,
  connected,
  dispatch,
  readOnly = false,
}: GameScreenProps) {
  const [logOpen, setLogOpen] = useState(false);
  const [scoutFlow, setScoutFlow] = useState<ScoutFlow>();
  const [orientationPreview, setOrientationPreview] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [valueModeChoice, setValueModeChoice] = useState<{
    key: string;
    mode: ShowValueMode;
  }>();
  const self = state.players.find((player) => player.id === state.selfId);
  const currentPlay = state.table.at(-1);
  const pickedCard =
    scoutFlow?.endpoint === "start"
      ? currentPlay?.cards[0]
      : scoutFlow?.endpoint === "end"
        ? currentPlay?.cards.at(-1)
        : undefined;
  const orientedPicked = useMemo(() => {
    if (!pickedCard || scoutFlow?.flipped === undefined) return undefined;
    const high = Math.max(pickedCard.top, pickedCard.bottom);
    const low = Math.min(pickedCard.top, pickedCard.bottom);
    return {
      ...pickedCard,
      top: scoutFlow.flipped ? high : low,
      bottom: scoutFlow.flipped ? low : high,
    };
  }, [pickedCard, scoutFlow?.flipped]);
  const hasPreviewHand =
    scoutFlow?.insertionIndex !== undefined &&
    orientedPicked !== undefined &&
    (scoutFlow.stage === "confirm" || scoutFlow.stage === "show");
  const displayedHand = hasPreviewHand
    ? [
        ...state.hand.slice(0, scoutFlow.insertionIndex),
        orientedPicked,
        ...state.hand.slice(scoutFlow.insertionIndex),
      ]
    : state.hand;
  const resetKey = `${state.round}|${state.phase}|${state.activePlayerId ?? ""}|${state.hand.map((card) => card.id).join(",")}`;
  const selection = useHandRangeSelection(
    displayedHand.map((card) => card.id),
    resetKey,
  );
  const selectedCards = displayedHand.filter((card) =>
    selection.selectedIds.includes(card.id),
  );
  const combinedOption =
    scoutFlow?.kind === "scout-and-show" &&
    scoutFlow.endpoint &&
    scoutFlow.insertionIndex !== undefined &&
    scoutFlow.flipped !== undefined
      ? state.availableActions.scoutAndShow.options.find(
          (option) =>
            option.position === scoutFlow.endpoint &&
            option.insertAt === scoutFlow.insertionIndex &&
            option.flipped === scoutFlow.flipped,
        )
      : undefined;
  const selectedIds = selectedCards.map((card) => card.id);
  const selectedShowOptions = (
    scoutFlow?.stage === "show"
      ? (combinedOption?.showRanges ?? [])
      : state.availableActions.show.ranges
  ).filter((range) => sameIds(range.cardIds, selectedIds));
  const availableValueModes = [
    ...new Set(
      selectedShowOptions
        .filter((range) => range.legal)
        .map((range) => range.valueMode),
    ),
  ];
  const valueModeChoiceKey = `${scoutFlow?.stage ?? "show"}|${selectedIds.join(",")}|${availableValueModes.join(",")}`;
  const effectiveValueMode =
    state.rulesMode === "official"
      ? "active"
      : availableValueModes.length === 1
        ? availableValueModes[0]
        : valueModeChoice?.key === valueModeChoiceKey &&
            availableValueModes.includes(valueModeChoice.mode)
          ? valueModeChoice.mode
          : undefined;
  const selectedShow = selectedShowOptions.find(
    (range) => range.valueMode === effectiveValueMode,
  );
  const showIsLegal = selectedShow?.legal === true;
  const needsValueMode =
    state.rulesMode === "vosu" && availableValueModes.length > 1;
  const selectionStatus = !selection.selectedIds.length
    ? "Keep their order"
    : needsValueMode && !effectiveValueMode
      ? "Choose ACTIVE or OPPOSITE"
      : showIsLegal
        ? `${selectedShow?.kind ? `${selectedShow.kind} · ` : ""}legal Show`
        : selectedShowOptions.length
          ? "Valid pattern, but too weak"
          : "Not a valid Show pattern";

  useEffect(() => setScoutFlow(undefined), [resetKey]);
  useEffect(() => {
    setValueModeChoice(
      state.rulesMode === "vosu" && availableValueModes.length === 1
        ? { key: valueModeChoiceKey, mode: availableValueModes[0]! }
        : undefined,
    );
  }, [resetKey, valueModeChoiceKey, state.rulesMode]);
  const chooseValueMode = (mode: ShowValueMode) =>
    setValueModeChoice({ key: valueModeChoiceKey, mode });
  const scoutFeedback = useScoutPointFeedback(state);

  if (state.phase === "round-results" || state.phase === "final") {
    return (
      <GameResults
        state={state}
        final={state.phase === "final"}
        dispatch={dispatch}
      />
    );
  }

  const show = () => {
    if (!showIsLegal || readOnly) return;
    if (
      scoutFlow?.kind === "scout-and-show" &&
      scoutFlow.endpoint &&
      scoutFlow.insertionIndex !== undefined &&
      scoutFlow.flipped !== undefined
    ) {
      dispatch({
        type: "scout-and-show",
        playId:
          state.availableActions.scoutAndShow.playId ?? currentPlay?.id ?? "",
        position: scoutFlow.endpoint,
        insertionIndex: scoutFlow.insertionIndex,
        flipped: scoutFlow.flipped,
        cardIds: selectedIds,
        valueMode: selectedShow.valueMode,
      });
      setScoutFlow(undefined);
    } else {
      dispatch({
        type: "show",
        cardIds: selectedIds,
        valueMode: selectedShow.valueMode,
      });
    }
    selection.clear();
  };
  const beginScout = (kind: ScoutKind) => {
    if (readOnly) return;
    selection.clear();
    setScoutFlow({ kind, stage: "endpoint" });
  };
  const availableScoutEndpoints =
    scoutFlow?.kind === "scout-and-show"
      ? [
          ...new Set(
            state.availableActions.scoutAndShow.options.map(
              (option) => option.position,
            ),
          ),
        ]
      : state.availableActions.scout.endpoints;
  const legalFlips = (endpoint: "start" | "end") =>
    scoutFlow?.kind === "scout-and-show"
      ? [
          ...new Set(
            state.availableActions.scoutAndShow.options
              .filter((option) => option.position === endpoint)
              .map((option) => option.flipped),
          ),
        ]
      : state.availableActions.scout.flipped;
  const chooseEndpoint = (endpoint: "start" | "end") => {
    if (legalFlips(endpoint).length > 0) {
      setScoutFlow(
        (flow) => flow && { kind: flow.kind, endpoint, stage: "orientation" },
      );
    }
  };
  const canInsertAt = (insertionIndex: number) => {
    if (!scoutFlow?.endpoint || scoutFlow.flipped === undefined) return false;
    return scoutFlow.kind === "scout-and-show"
      ? state.availableActions.scoutAndShow.options.some(
          (option) =>
            option.position === scoutFlow.endpoint &&
            option.insertAt === insertionIndex &&
            option.flipped === scoutFlow.flipped,
        )
      : insertionIndex < state.availableActions.scout.insertionCount &&
          state.availableActions.scout.flipped.includes(scoutFlow.flipped);
  };
  const chooseInsertion = (insertionIndex: number) => {
    if (!canInsertAt(insertionIndex)) return;
    selection.clear();
    setScoutFlow(
      (flow) =>
        flow && {
          ...flow,
          insertionIndex,
          stage: flow.kind === "scout" ? "confirm" : "show",
        },
    );
  };
  const confirmScout = () => {
    if (
      !currentPlay ||
      scoutFlow?.kind !== "scout" ||
      !scoutFlow.endpoint ||
      scoutFlow.insertionIndex === undefined ||
      scoutFlow.flipped === undefined ||
      readOnly
    )
      return;
    dispatch({
      type: "scout",
      playId: state.availableActions.scout.playId ?? currentPlay.id,
      position: scoutFlow.endpoint,
      insertionIndex: scoutFlow.insertionIndex,
      flipped: scoutFlow.flipped,
    });
    setScoutFlow(undefined);
  };
  const backScout = () => {
    setScoutFlow((flow) => {
      if (!flow || flow.stage === "endpoint") return undefined;
      if (flow.stage === "orientation")
        return { kind: flow.kind, stage: "endpoint" };
      const { insertionIndex: _insertionIndex, ...withoutInsertion } = flow;
      if (flow.stage === "insertion")
        return { ...withoutInsertion, stage: "orientation" };
      selection.clear();
      return { ...withoutInsertion, stage: "insertion" };
    });
  };
  const cancelScout = () => {
    selection.clear();
    setScoutFlow(undefined);
  };

  return (
    <main className="game-shell">
      {!connected && !readOnly && (
        <ConnectionBanner graceMs={state.reconnectGraceMs} variant="game" />
      )}
      {readOnly && (
        <div className="preview-banner" role="status">
          <Eye /> Demo preview · controls are read-only
        </div>
      )}
      <OpponentStrip
        state={state}
        scoutAwardIds={scoutFeedback.opponentAwardIds}
        pulseKey={scoutFeedback.pulseKey}
      />
      <GameTable
        state={state}
        logOpen={logOpen}
        onToggleLog={() => setLogOpen((open) => !open)}
        onCloseLog={() => setLogOpen(false)}
        scoutFeedback={scoutFeedback}
      />
      <GameHandActionBar
        state={state}
        {...(self ? { self } : {})}
        displayedHand={displayedHand}
        selection={selection}
        selectionStatus={selectionStatus}
        showIsLegal={showIsLegal}
        showCount={selectedCards.length}
        valueModes={availableValueModes}
        selectedValueMode={effectiveValueMode}
        scoutShowInProgress={scoutFlow?.stage === "show"}
        readOnly={readOnly}
        onScout={() => beginScout("scout")}
        onScoutAndShow={() => beginScout("scout-and-show")}
        onShow={show}
        onValueMode={chooseValueMode}
        onHelp={() => setHelpOpen(true)}
        onLeave={() =>
          readOnly ? dispatch({ type: "leave-room" }) : setLeaveOpen(true)
        }
        disabledReason={disabledReason}
      />

      <AnimatePresence>
        {state.phase === "orientation" && !readOnly && (
          <OrientationDialog
            state={state}
            previewFlipped={orientationPreview}
            onFlip={() => setOrientationPreview((value) => !value)}
            onLock={() =>
              dispatch({
                type: "choose-orientation",
                flipped: orientationPreview,
              })
            }
          />
        )}
        {scoutFlow && currentPlay && (
          <ScoutWorkflowDialog
            state={state}
            flow={scoutFlow}
            currentPlay={currentPlay}
            {...(pickedCard
              ? { pickedCard: orientedPicked ?? pickedCard }
              : {})}
            {...(orientedPicked ? { insertedCardId: orientedPicked.id } : {})}
            displayedHand={displayedHand}
            availableEndpoints={availableScoutEndpoints}
            selectionStatus={selectionStatus}
            selectedIds={selectedIds}
            showIsLegal={showIsLegal}
            valueModes={availableValueModes}
            selectedValueMode={effectiveValueMode}
            isSelected={selection.isSelected}
            getCardProps={selection.getCardProps}
            canInsertAt={canInsertAt}
            availableFlips={
              scoutFlow.endpoint ? legalFlips(scoutFlow.endpoint) : []
            }
            onEndpoint={chooseEndpoint}
            onOrientation={(flipped) =>
              setScoutFlow((flow) => flow && { ...flow, flipped })
            }
            onContinue={() =>
              setScoutFlow((flow) => flow && { ...flow, stage: "insertion" })
            }
            onInsertion={chooseInsertion}
            onConfirmScout={confirmScout}
            onShow={show}
            onValueMode={chooseValueMode}
            onBack={backScout}
            onCancel={cancelScout}
          />
        )}
        {helpOpen && (
          <AccessibleDialog
            className="choice-card help-card"
            labelledBy="game-help-title"
            onClose={() => setHelpOpen(false)}
            closeOnBackdrop
          >
            <p className="eyebrow">RIGHT NOW</p>
            <h1 id="game-help-title">
              {state.activePlayerId === state.selfId
                ? "It’s your move."
                : "Watch the active Show."}
            </h1>
            <p>
              {state.variant === "two-player"
                ? state.rulesMode === "vosu"
                  ? `Scout or Scout & Show spends one of your ${self?.scoutChips ?? 0} remaining chips. Scout lets you act again; a successful Scout & Show passes the turn.`
                  : `Scout spends one of your ${self?.scoutChips ?? 0} remaining chips and lets you act again.`
                : state.rulesMode === "vosu"
                  ? "Scout takes an end card. Scout & Show is unlimited."
                  : `Scout takes an end card. Scout & Show is ${self?.scoutAndShowAvailable ? "still available" : "already used"} this round.`}
            </p>
            <p>
              Select adjacent cards in your fixed hand using only each card’s
              large upright active value
              {state.rulesMode === "vosu"
                ? ", or choose OPPOSITE for every card in the Show."
                : ". The small OPPOSITE number beneath it is a reference and cannot be chosen for Show."}
            </p>
            <p>
              Only a newly Scouted card may choose either orientation, and only
              while you insert it. A longer Show wins; at equal length, sets
              beat runs and ties do not win.
            </p>
            <button
              className="button button--primary"
              onClick={() => setHelpOpen(false)}
            >
              Got it
            </button>
          </AccessibleDialog>
        )}
      </AnimatePresence>
      <ConfirmDialog
        open={leaveOpen}
        title="Leave this table?"
        description="You may lose your seat and the current match progress on this device."
        confirmLabel="Leave table"
        onCancel={() => setLeaveOpen(false)}
        onConfirm={() => dispatch({ type: "leave-room" })}
      />
    </main>
  );
}
