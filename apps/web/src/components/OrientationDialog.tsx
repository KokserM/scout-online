import { motion, useReducedMotion } from "framer-motion";
import { Crown, RotateCw } from "lucide-react";
import type { GameState } from "../protocol/types";
import { AccessibleDialog } from "./AccessibleDialog";
import { GameCard } from "./GameCard";

interface OrientationDialogProps {
  state: GameState;
  previewFlipped: boolean;
  onFlip: () => void;
  onLock: () => void;
}

export function OrientationDialog({ state, previewFlipped, onFlip, onLock }: OrientationDialogProps) {
  const reduceMotion = useReducedMotion();
  const readyCount = state.players.filter((player) => player.orientationChosen).length;
  return (
    <AccessibleDialog labelledBy="orientation-title">
      {state.mustChooseOrientation ? (
        <>
          <p className="eyebrow">ONE CHOICE. NO REORDERING.</p>
          <h1 id="orientation-title">Which way is up?</h1>
          <p>Rotate only the complete hand, then lock it for the round. After locking, each card’s large upright number is its active value for Show; the small OPPOSITE number beneath it is a reference, not another choice.</p>
          <p className="orientation-progress" aria-live="polite">{readyCount} of {state.players.length} players locked</p>
          <motion.div
            className={`orientation-hand ${previewFlipped ? "is-reversed" : ""}`}
            aria-label={`Full hand orientation preview, ${state.hand.length} cards`}
            animate={reduceMotion ? {} : { rotate: previewFlipped ? 1 : 0 }}
          >
            {state.hand.map((card) => <GameCard card={card} flipped={previewFlipped} compact key={card.id} />)}
          </motion.div>
          <button className="button button--secondary" onClick={onFlip}><RotateCw /> Flip the whole hand</button>
          <button className="button button--primary" onClick={onLock}>Lock this orientation</button>
        </>
      ) : (
        <>
          <p className="eyebrow">YOUR HAND IS LOCKED</p>
          <h1 id="orientation-title">Waiting in the wings.</h1>
          <p>Your large upright values are locked. Only a newly Scouted card may choose an orientation while you insert it.</p>
          <p aria-live="polite">{readyCount} of {state.players.length} players locked. Play begins automatically when everyone is ready.</p>
          {state.startingPlayerId && (
            <p className="starting-player"><Crown aria-hidden="true" /> {state.players.find((player) => player.id === state.startingPlayerId)?.name} starts this round</p>
          )}
        </>
      )}
    </AccessibleDialog>
  );
}
