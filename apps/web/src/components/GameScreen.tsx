import { AnimatePresence } from "framer-motion";
import { Eye, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ClientAction, GameState } from "../protocol/types";
import { AccessibleDialog } from "./AccessibleDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { GameHandActionBar } from "./GameHandActionBar";
import { GameResults } from "./GameResults";
import { GameTable, OpponentStrip } from "./GameTable";
import { OrientationDialog } from "./OrientationDialog";
import { ScoutWorkflowDialog, type ScoutFlow, type ScoutKind } from "./ScoutWorkflowDialog";
import { useHandRangeSelection } from "./useHandRangeSelection";

interface GameScreenProps {
  state: GameState;
  connected: boolean;
  dispatch: (action: ClientAction) => void;
  readOnly?: boolean;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function disabledReason(reason?: string): string | undefined {
  if (!reason) return undefined;
  return {
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
  }[reason] ?? reason;
}

export function GameScreen({ state, connected, dispatch, readOnly = false }: GameScreenProps) {
  const [logOpen, setLogOpen] = useState(false);
  const [scoutFlow, setScoutFlow] = useState<ScoutFlow>();
  const [orientationPreview, setOrientationPreview] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const self = state.players.find((player) => player.id === state.selfId);
  const currentPlay = state.table.at(-1);
  const pickedCard = scoutFlow?.endpoint === "start"
    ? currentPlay?.cards[0]
    : scoutFlow?.endpoint === "end"
      ? currentPlay?.cards.at(-1)
      : undefined;
  const orientedPicked = useMemo(() => {
    if (!pickedCard || scoutFlow?.flipped === undefined) return undefined;
    const high = Math.max(pickedCard.top, pickedCard.bottom);
    const low = Math.min(pickedCard.top, pickedCard.bottom);
    return { ...pickedCard, top: scoutFlow.flipped ? high : low, bottom: scoutFlow.flipped ? low : high };
  }, [pickedCard, scoutFlow?.flipped]);
  const hasPreviewHand = scoutFlow?.insertionIndex !== undefined && orientedPicked !== undefined && (scoutFlow.stage === "confirm" || scoutFlow.stage === "show");
  const displayedHand = hasPreviewHand
    ? [...state.hand.slice(0, scoutFlow.insertionIndex), orientedPicked, ...state.hand.slice(scoutFlow.insertionIndex)]
    : state.hand;
  const resetKey = `${state.round}|${state.phase}|${state.activePlayerId ?? ""}|${state.hand.map((card) => card.id).join(",")}`;
  const selection = useHandRangeSelection(displayedHand.map((card) => card.id), resetKey);
  const selectedCards = displayedHand.filter((card) => selection.selectedIds.includes(card.id));
  const combinedOption = scoutFlow?.kind === "scout-and-show" && scoutFlow.endpoint && scoutFlow.insertionIndex !== undefined && scoutFlow.flipped !== undefined
    ? state.availableActions.scoutAndShow.options.find((option) => option.position === scoutFlow.endpoint && option.insertAt === scoutFlow.insertionIndex && option.flipped === scoutFlow.flipped)
    : undefined;
  const selectedIds = selectedCards.map((card) => card.id);
  const selectedShow = scoutFlow?.stage === "show"
    ? combinedOption?.showRanges.find((range) => sameIds(range.cardIds, selectedIds))
    : state.availableActions.show.ranges.find((range) => sameIds(range.cardIds, selection.selectedIds));
  const showIsLegal = selectedShow?.legal === true;
  const selectionStatus = !selection.selectedIds.length
    ? "Keep their order"
    : showIsLegal
      ? `${selectedShow?.kind ? `${selectedShow.kind} · ` : ""}legal Show`
      : selectedShow ? "Valid pattern, but too weak" : "Not a valid Show pattern";

  useEffect(() => setScoutFlow(undefined), [resetKey]);

  if (state.phase === "round-results" || state.phase === "final") {
    return <GameResults state={state} final={state.phase === "final"} dispatch={dispatch} />;
  }

  const show = () => {
    if (!showIsLegal || readOnly) return;
    if (scoutFlow?.kind === "scout-and-show" && scoutFlow.endpoint && scoutFlow.insertionIndex !== undefined && scoutFlow.flipped !== undefined) {
      dispatch({ type: "scout-and-show", playId: state.availableActions.scoutAndShow.playId ?? currentPlay?.id ?? "", position: scoutFlow.endpoint, insertionIndex: scoutFlow.insertionIndex, flipped: scoutFlow.flipped, cardIds: selectedIds });
      setScoutFlow(undefined);
    } else {
      dispatch({ type: "show", cardIds: selectedIds });
    }
    selection.clear();
  };
  const beginScout = (kind: ScoutKind) => {
    if (readOnly) return;
    selection.clear();
    setScoutFlow({ kind, stage: "endpoint" });
  };
  const availableScoutEndpoints = scoutFlow?.kind === "scout-and-show"
    ? [...new Set(state.availableActions.scoutAndShow.options.map((option) => option.position))]
    : state.availableActions.scout.endpoints;
  const legalFlips = (endpoint: "start" | "end") => scoutFlow?.kind === "scout-and-show"
    ? [...new Set(state.availableActions.scoutAndShow.options.filter((option) => option.position === endpoint).map((option) => option.flipped))]
    : state.availableActions.scout.flipped;
  const chooseEndpoint = (endpoint: "start" | "end") => {
    if (legalFlips(endpoint).length > 0) {
      setScoutFlow((flow) => flow && { kind: flow.kind, endpoint, stage: "orientation" });
    }
  };
  const canInsertAt = (insertionIndex: number) => {
    if (!scoutFlow?.endpoint || scoutFlow.flipped === undefined) return false;
    return scoutFlow.kind === "scout-and-show"
      ? state.availableActions.scoutAndShow.options.some((option) => option.position === scoutFlow.endpoint && option.insertAt === insertionIndex && option.flipped === scoutFlow.flipped)
      : insertionIndex < state.availableActions.scout.insertionCount && state.availableActions.scout.flipped.includes(scoutFlow.flipped);
  };
  const chooseInsertion = (insertionIndex: number) => {
    if (!canInsertAt(insertionIndex)) return;
    selection.clear();
    setScoutFlow((flow) => flow && { ...flow, insertionIndex, stage: flow.kind === "scout" ? "confirm" : "show" });
  };
  const confirmScout = () => {
    if (!currentPlay || scoutFlow?.kind !== "scout" || !scoutFlow.endpoint || scoutFlow.insertionIndex === undefined || scoutFlow.flipped === undefined || readOnly) return;
    dispatch({ type: "scout", playId: state.availableActions.scout.playId ?? currentPlay.id, position: scoutFlow.endpoint, insertionIndex: scoutFlow.insertionIndex, flipped: scoutFlow.flipped });
    setScoutFlow(undefined);
  };
  const backScout = () => {
    setScoutFlow((flow) => {
      if (!flow || flow.stage === "endpoint") return undefined;
      if (flow.stage === "orientation") return { kind: flow.kind, stage: "endpoint" };
      const { insertionIndex: _insertionIndex, ...withoutInsertion } = flow;
      if (flow.stage === "insertion") return { ...withoutInsertion, stage: "orientation" };
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
      {!connected && !readOnly && <div className="connection-banner" role="status" aria-live="assertive"><WifiOff /> Connection lost. Reconnecting… your seat is reserved for {Math.ceil(state.reconnectGraceMs / 1000)} seconds.</div>}
      {readOnly && <div className="preview-banner" role="status"><Eye /> Demo preview · controls are read-only</div>}
      <OpponentStrip state={state} />
      <GameTable state={state} logOpen={logOpen} onToggleLog={() => setLogOpen((open) => !open)} onCloseLog={() => setLogOpen(false)} />
      <GameHandActionBar
        state={state}
        {...(self ? { self } : {})}
        displayedHand={displayedHand}
        selection={selection}
        selectionStatus={selectionStatus}
        showIsLegal={showIsLegal}
        showCount={selectedCards.length}
        scoutShowInProgress={scoutFlow?.stage === "show"}
        readOnly={readOnly}
        onScout={() => beginScout("scout")}
        onScoutAndShow={() => beginScout("scout-and-show")}
        onShow={show}
        onHelp={() => setHelpOpen(true)}
        onLeave={() => readOnly ? dispatch({ type: "leave-room" }) : setLeaveOpen(true)}
        disabledReason={disabledReason}
      />

      <AnimatePresence>
        {state.phase === "orientation" && !readOnly && (
          <OrientationDialog state={state} previewFlipped={orientationPreview} onFlip={() => setOrientationPreview((value) => !value)} onLock={() => dispatch({ type: "choose-orientation", flipped: orientationPreview })} />
        )}
        {scoutFlow && currentPlay && (
          <ScoutWorkflowDialog
            state={state}
            flow={scoutFlow}
            currentPlay={currentPlay}
            {...(orientedPicked ? { pickedCard: orientedPicked } : {})}
            displayedHand={displayedHand}
            availableEndpoints={availableScoutEndpoints}
            selectionStatus={selectionStatus}
            selectedIds={selectedIds}
            showIsLegal={showIsLegal}
            isSelected={selection.isSelected}
            getCardProps={selection.getCardProps}
            canInsertAt={canInsertAt}
            availableFlips={scoutFlow.endpoint ? legalFlips(scoutFlow.endpoint) : []}
            onEndpoint={chooseEndpoint}
            onOrientation={(flipped) => setScoutFlow((flow) => flow && { ...flow, flipped })}
            onContinue={() => setScoutFlow((flow) => flow && { ...flow, stage: "insertion" })}
            onInsertion={chooseInsertion}
            onConfirmScout={confirmScout}
            onShow={show}
            onBack={backScout}
            onCancel={cancelScout}
          />
        )}
        {helpOpen && (
          <AccessibleDialog className="choice-card help-card" labelledBy="game-help-title" onClose={() => setHelpOpen(false)} closeOnBackdrop>
            <p className="eyebrow">RIGHT NOW</p>
            <h1 id="game-help-title">{state.activePlayerId === state.selfId ? "It’s your move." : "Watch the active Show."}</h1>
            <p>{state.variant === "two-player" ? `Scout spends one of your ${self?.scoutChips ?? 0} remaining chips and lets you act again.` : `Scout takes an end card. Scout & Show is ${self?.scoutAndShowAvailable ? "still available" : "already used"} this round.`}</p>
            <p>Select adjacent cards in your fixed hand. A longer Show wins; at equal length, sets beat runs and ties do not win.</p>
            <button className="button button--primary" onClick={() => setHelpOpen(false)}>Got it</button>
          </AccessibleDialog>
        )}
      </AnimatePresence>
      <ConfirmDialog open={leaveOpen} title="Leave this table?" description="You may lose your seat and the current match progress on this device." confirmLabel="Leave table" onCancel={() => setLeaveOpen(false)} onConfirm={() => dispatch({ type: "leave-room" })} />
    </main>
  );
}
