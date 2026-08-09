import { motion } from "framer-motion";
import type { CSSProperties, KeyboardEventHandler, PointerEventHandler } from "react";
import type { Card } from "../protocol/types";

export type CardPlayability = "neutral" | "legal" | "illegal" | "scoutable";

interface GameCardProps {
  card: Card;
  selected?: boolean;
  flipped?: boolean;
  compact?: boolean;
  playability?: CardPlayability;
  onClick?: () => void;
  tabIndex?: number;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onPointerEnter?: PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>;
}

const CARD_PALETTES = [
  { ink: "#3b1768", face: "#ffd447", accent: "#ff5d73", shadow: "#210b3a" },
  { ink: "#073b4c", face: "#7cead1", accent: "#ff6b35", shadow: "#032630" },
  { ink: "#47210c", face: "#ffb4d0", accent: "#6c4cff", shadow: "#2d1207" },
  { ink: "#17301d", face: "#c9f269", accent: "#e74881", shadow: "#0b1d0f" },
  { ink: "#2d2558", face: "#9ad9ff", accent: "#ff7a18", shadow: "#17122f" },
] as const;

const MOTIFS = ["burst", "steps", "orbit", "confetti"] as const;

function hashCardId(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getCardDesign(id: string) {
  const hash = hashCardId(id);
  return {
    palette: hash % CARD_PALETTES.length,
    motif: MOTIFS[Math.floor(hash / CARD_PALETTES.length) % MOTIFS.length],
    shift: ((hash >>> 8) % 9) - 4,
  } as const;
}

export function GameCard({
  card,
  selected,
  flipped,
  compact,
  playability = "neutral",
  onClick,
  tabIndex,
  onKeyDown,
  onPointerDown,
  onPointerEnter,
  onPointerUp,
  onPointerCancel,
}: GameCardProps) {
  const design = getCardDesign(card.id);
  const palette = CARD_PALETTES[design.palette] ?? CARD_PALETTES[0];
  const activeTop = flipped ? card.bottom : card.top;
  const activeBottom = flipped ? card.top : card.bottom;
  const style = {
    "--card-ink": palette.ink,
    "--card-face": palette.face,
    "--card-accent": palette.accent,
    "--card-shadow": palette.shadow,
    "--motif-shift": `${design.shift}px`,
  } as CSSProperties;
  const stateLabel =
    playability === "neutral" ? "" : `, ${playability}`;

  const content = (
    <div
      className={`game-card game-card--motif-${design.motif}`}
      data-motif={design.motif}
      data-palette={design.palette}
      data-playability={playability}
      style={style}
    >
      <span className="card-grain" aria-hidden="true" />
      <span className="card-motif" aria-hidden="true"><i /><i /><i /></span>
      <span className="card-end card-end--top" data-testid="card-top-cluster">
        <span className="card-active-label">TOP</span>
        <strong className="card-value card-value--playable">{activeTop}</strong>
        <small className="card-value card-value--opposite">{activeBottom}</small>
      </span>
      <span className="card-center-mark" aria-hidden="true"><b>PLAY</b><i>◆</i></span>
      <span className="card-end card-end--bottom" data-testid="card-bottom-cluster">
        <strong className="card-value card-value--playable">{activeBottom}</strong>
        <small className="card-value card-value--opposite">{activeTop}</small>
      </span>
      {playability !== "neutral" && (
        <span className="card-state" aria-hidden="true">
          {playability === "legal" ? "✓ LEGAL" : playability === "illegal" ? "× BLOCKED" : "↗ SCOUT"}
        </span>
      )}
    </div>
  );

  if (!onClick) return <div className={compact ? "card-wrap is-compact" : "card-wrap"}>{content}</div>;

  return (
    <motion.button
      type="button"
      className={`card-wrap card-button ${compact ? "is-compact" : ""} ${selected ? "is-selected" : ""} is-${playability}`}
      aria-pressed={selected}
      aria-label={`${activeTop} over ${activeBottom}${selected ? ", selected" : ""}${stateLabel}`}
      disabled={playability === "illegal"}
      onClick={onClick}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      whileHover={{ y: -8 }}
      whileTap={{ scale: 0.97 }}
      layout
    >
      {content}
    </motion.button>
  );
}
