import { X } from "lucide-react";
import { AccessibleDialog } from "./AccessibleDialog";

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function RulesModal({ open, onClose }: RulesModalProps) {
  if (!open) return null;
  return (
    <AccessibleDialog className="rules-modal" labelledBy="rules-title" onClose={onClose} closeOnBackdrop>
            <button className="icon-button modal-close" onClick={onClose} aria-label="Close rules">
              <X />
            </button>
            <p className="eyebrow">TABLE GUIDE</p>
            <h2 id="rules-title">How to take the table</h2>
            <div className="rules-sections">
              <article><h3>Objective</h3><p>Build sets and runs without rearranging your hand. Score the most points across all rounds.</p></article>
              <article><h3>Your fixed hand</h3><p>At the reveal, keep your hand or rotate the entire hand 180°. That reverses and flips every card. After locking, cards in your hand cannot be flipped or reordered.</p></article>
              <article><h3>Reading a card</h3><p>The large upright number labeled ACTIVE is the card’s playable value. The small OPPOSITE number beneath it is only a reference; you cannot choose it for a Show.</p></article>
              <article><h3>Show</h3><p>Using only active values, play adjacent cards: one card, equal values (a set), or consecutive values in either direction (a run).</p></article>
              <article><h3>Show ranking</h3><p>More cards always wins. At equal length, a set beats a run; otherwise the higher value or higher run wins. An equal Show never wins.</p></article>
              <article><h3>Scout</h3><p>Take exactly the left or right end of the Active Set. This newly Scouted card may choose either orientation only while you insert it into a hand gap; that active value then locks. In 3–5 player games the Show owner earns +1 Scout, then play passes — Official and Võsu both award that point.</p></article>
              <article><h3>Scout & Show</h3><p>Scout and immediately Show as one move. The Show need not use the card you took. Official: once per round in 3–5 player games. Võsu: unlimited — scout and pass, or scout and show, as often as you like. The Show owner still earns the Scout point.</p></article>
              <article><h3>Ending and scoring</h3><p>A round ends when a Show empties a hand, or when every opponent Scouts an unbeaten Show. Score captures and Scout points, then subtract cards left in hand. The unbeaten Show owner skips that hand penalty.</p></article>
              <article><h3>Two players</h3><p>Play two reserved 22-card rounds. Each player has three Scout chips. Scouting spends your chip, awards no Scout point, and you act again; unused chips score. Official has no Scout & Show. Võsu lets you Scout & Show for one chip; that also awards no Scout point and then passes the turn.</p></article>
            </div>
    </AccessibleDialog>
  );
}
