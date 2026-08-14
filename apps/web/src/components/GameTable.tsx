import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Crown, List, WifiOff } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { GameState, Player } from "../protocol/types";
import { GameCard } from "./GameCard";
import { RulesModeBadge } from "./RulesModeBadge";
import { seatOffsetFromTable, type Point } from "./seatAnchors";
import type { TableMotion } from "./useTableMotion";

function livePoints(player: Player, variant: GameState["variant"]) {
  return variant === "standard"
    ? player.score + player.scoutPoints
    : player.score;
}

function PlayerBadges({
  player,
  variant,
  rulesMode,
  pulsing,
}: {
  player: Player;
  variant: GameState["variant"];
  rulesMode: GameState["rulesMode"];
  pulsing?: boolean;
}) {
  return (
    <small>
      <span className={`live-points ${pulsing ? "is-points-pulse" : ""}`}>
        {livePoints(player, variant)} pts
      </span>
      {variant === "two-player"
        ? ` · ${player.scoutChips} chips`
        : ` · ${player.scoutPoints} Scout`}
      {(variant === "standard" || rulesMode === "vosu") &&
        ` · Scout & Show ${
          rulesMode === "vosu"
            ? "unlimited"
            : player.scoutAndShowAvailable
              ? "ready"
              : "used"
        }`}
    </small>
  );
}

function opponentLabel(
  player: Player,
  isActive: boolean,
  isShowOwner: boolean,
) {
  return `${player.name}, ${player.handCount} cards left${isActive ? ", playing" : ""}${isShowOwner ? ", Show" : ""}`;
}

export function OpponentStrip({
  state,
  pulsingPlayerId,
}: {
  state: GameState;
  pulsingPlayerId?: string;
}) {
  const players = state.players.filter((player) => player.id !== state.selfId);
  return (
    <div className="opponent-strip" aria-label="Opponents">
      {players.map((player) => {
        const isActive = player.id === state.activePlayerId;
        const isShowOwner = player.id === state.scoutTargetId;
        const extra = Math.max(0, player.handCount - 6);
        return (
          <article
            className={`opponent ${isActive ? "is-active" : ""}`}
            data-seat={player.id}
            {...(isActive ? { "aria-current": true as const } : {})}
            aria-label={opponentLabel(player, isActive, isShowOwner)}
            key={player.id}
          >
            <span className="avatar" aria-hidden="true">
              {player.name[0]}
            </span>
            <span className="opponent-copy">
              <b>
                {player.name}
                {isActive && <span className="playing-marker">Playing</span>}
                {isShowOwner && <span className="show-marker">Show</span>}
                {player.id === state.startingPlayerId && (
                  <span className="starting-marker">
                    <Crown aria-hidden="true" /> starts
                  </span>
                )}
              </b>
              <PlayerBadges
                player={player}
                variant={state.variant}
                rulesMode={state.rulesMode}
                pulsing={pulsingPlayerId === player.id}
              />
            </span>
            {!player.connected && (
              <WifiOff aria-label={`${player.name} disconnected`} />
            )}
            <span className="hand-count-badge" aria-hidden="true">
              <strong>{player.handCount}</strong>
              <small>left</small>
            </span>
            <div className="mini-hand" aria-hidden="true">
              {Array.from({ length: Math.min(player.handCount, 6) }, (_, i) => (
                <i key={i} />
              ))}
              {extra > 0 && <span className="mini-hand-more">+{extra}</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

interface GameTableProps {
  state: GameState;
  logOpen: boolean;
  onToggleLog: () => void;
  onCloseLog: () => void;
  tableMotion?: TableMotion;
}

export function GameTable({
  state,
  logOpen,
  onToggleLog,
  onCloseLog,
  tableMotion,
}: GameTableProps) {
  const reduceMotion = useReducedMotion();
  const feltRef = useRef<HTMLDivElement>(null);
  const [dealFrom, setDealFrom] = useState<Point>({ x: 0, y: -80 });
  const [peelTo, setPeelTo] = useState<Point>({ x: 0, y: 40 });
  const self = state.players.find((player) => player.id === state.selfId);
  const currentPlay = state.table.at(-1);
  const isTurn = state.activePlayerId === state.selfId;
  const activeName = state.players.find(
    (player) => player.id === state.activePlayerId,
  )?.name;
  const playedOpposite =
    state.rulesMode === "vosu" && currentPlay?.valueMode === "opposite";
  const deal = tableMotion?.showDeal;
  const peel = tableMotion?.scoutPeel;
  const awardStatus =
    tableMotion?.scoutAward &&
    (tableMotion.caption ??
      (tableMotion.scoutAward.ownerId === state.selfId
        ? "You gained +1 Scout"
        : `${state.players.find((player) => player.id === tableMotion.scoutAward?.ownerId)?.name ?? "A player"} gained +1 Scout`));

  useLayoutEffect(() => {
    const root = feltRef.current?.closest(".game-shell") ?? null;
    if (deal) {
      setDealFrom(seatOffsetFromTable(root, deal.actorId, state.selfId));
    }
    if (peel) {
      setPeelTo(seatOffsetFromTable(root, peel.scoutId, state.selfId));
    }
  }, [deal, peel, state.selfId]);

  return (
    <section className="table-zone" aria-label="Table">
      <header className="round-header">
        <span>
          Round {state.round} of {state.totalRounds} ·{" "}
          <RulesModeBadge mode={state.rulesMode} />
        </span>
        <b aria-live="polite">
          {isTurn ? "Your move" : `${activeName ?? "Another player"}'s move`}
        </b>
        <button
          className="icon-button"
          onClick={onToggleLog}
          aria-expanded={logOpen}
          aria-controls="activity-log"
          aria-label="Toggle activity log"
        >
          <List />
        </button>
      </header>
      <motion.div
        ref={feltRef}
        className={`felt-table ${isTurn ? "is-your-turn" : "is-waiting"}`}
        data-table-felt=""
        layout={!reduceMotion}
      >
        <p className="turn-pill" aria-hidden="true">
          {isTurn ? "YOUR MOVE" : (activeName ?? "Waiting")}
        </p>
        <AnimatePresence>
          {currentPlay ? (
            <motion.div
              className="current-play"
              key={currentPlay.id}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? {} : { opacity: 0, y: 24 }}
              transition={{ duration: 0.18 }}
            >
              <motion.p
                className="table-caption"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduceMotion ? 0 : 0.07 }}
              >
                {state.players.find((p) => p.id === currentPlay.playerId)?.name}{" "}
                showed · {currentPlay.valueMode.toUpperCase()}
              </motion.p>
              <div className="table-play" data-table-play="">
                {currentPlay.cards.map((card, index) => (
                  <motion.div
                    className="card-deal"
                    data-table-end={
                      index === 0
                        ? "start"
                        : index === currentPlay.cards.length - 1
                          ? "end"
                          : undefined
                    }
                    key={card.id}
                    initial={
                      reduceMotion || !deal
                        ? false
                        : {
                            x: dealFrom.x,
                            y: dealFrom.y,
                            rotate: dealFrom.y < 0 ? -10 : 10,
                            opacity: 0,
                            scale: 0.92,
                          }
                    }
                    animate={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
                    transition={
                      reduceMotion || !deal
                        ? { duration: 0 }
                        : {
                            delay: index * 0.07,
                            type: "spring",
                            stiffness: 380,
                            damping: 28,
                          }
                    }
                  >
                    <GameCard
                      card={card}
                      compact
                      layoutAnimation={false}
                      {...(playedOpposite
                        ? { effectiveValueMode: "opposite" as const }
                        : {})}
                      playedOpposite={playedOpposite}
                    />
                  </motion.div>
                ))}
                <AnimatePresence>
                  {peel && !reduceMotion && (
                    <motion.div
                      className={`card-peel is-${peel.fromEnd}`}
                      key={`peel-${peel.removedCardId}`}
                      initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
                      animate={{
                        opacity: 0,
                        x: peelTo.x,
                        y: peelTo.y,
                        rotate: 14,
                        scale: 0.86,
                      }}
                      transition={{ duration: 0.35, ease: "easeIn" }}
                    >
                      <GameCard
                        card={peel.card}
                        compact
                        layoutAnimation={false}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : (
            <motion.p className="empty-table" key="empty">
              The table is open. Set the pace.
            </motion.p>
          )}
        </AnimatePresence>
        <div
          className="table-score"
          data-seat={state.selfId}
        >
          <span>YOU</span>
          <strong
            className={`live-points ${tableMotion?.pulsingPlayerId === state.selfId ? "is-points-pulse" : ""}`}
          >
            {self ? livePoints(self, state.variant) : 0}
          </strong>
          <small>points</small>
          {state.variant === "standard" && (
            <small className="you-scout-line">{self?.scoutPoints ?? 0} Scout</small>
          )}
        </div>
        <span
          className="self-seat-anchor"
          data-seat={state.selfId}
          aria-hidden="true"
        />
        {awardStatus && (
          <p className="scout-award-status" aria-live="polite">
            {awardStatus}
          </p>
        )}
        <AnimatePresence>
          {tableMotion?.caption && (
            <motion.p
              className="scout-award-caption"
              key={`caption-${tableMotion.pulseKey}`}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {tableMotion.caption}
            </motion.p>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {tableMotion?.chipToast && (
            <motion.p
              className="scout-chip-toast"
              key={`chip-${tableMotion.pulseKey}`}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {tableMotion.chipToast}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
      <AnimatePresence>
        {logOpen && (
          <motion.aside
            id="activity-log"
            className="activity-log"
            aria-label="Activity"
            initial={reduceMotion ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? {} : { opacity: 0, x: 24 }}
          >
            <div className="section-heading">
              <h2>Table talk</h2>
              <button className="text-button" onClick={onCloseLog}>
                Close
              </button>
            </div>
            <ul aria-live="polite">
              {state.activity.map((item) => (
                <li className={`tone-${item.tone ?? "neutral"}`} key={item.id}>
                  {item.message}
                </li>
              ))}
            </ul>
          </motion.aside>
        )}
      </AnimatePresence>
    </section>
  );
}
