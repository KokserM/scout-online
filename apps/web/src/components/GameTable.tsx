import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Crown, List, WifiOff } from "lucide-react";
import type { GameState, Player } from "../protocol/types";
import { GameCard } from "./GameCard";
import { RulesModeBadge } from "./RulesModeBadge";

function PlayerBadges({
  player,
  variant,
  rulesMode,
}: {
  player: Player;
  variant: GameState["variant"];
  rulesMode: GameState["rulesMode"];
}) {
  return (
    <small>
      {player.handCount} cards · {player.score} pts
      {variant === "two-player"
        ? ` · ${player.scoutChips} chips`
        : ` · ${player.scoutPoints} Scout`}
      {variant === "standard" &&
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

export function OpponentStrip({ state }: { state: GameState }) {
  const players = state.players.filter((player) => player.id !== state.selfId);
  return (
    <div className="opponent-strip" aria-label="Opponents">
      {players.map((player) => (
        <article
          className={`opponent ${player.id === state.activePlayerId ? "is-active" : ""}`}
          key={player.id}
        >
          <span className="avatar">{player.name[0]}</span>
          <span className="opponent-copy">
            <b>
              {player.name}
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
            />
          </span>
          {!player.connected && (
            <WifiOff aria-label={`${player.name} disconnected`} />
          )}
          <div className="mini-hand" aria-hidden="true">
            {Array.from({ length: Math.min(player.handCount, 6) }, (_, i) => (
              <i key={i} />
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

interface GameTableProps {
  state: GameState;
  logOpen: boolean;
  onToggleLog: () => void;
  onCloseLog: () => void;
}

export function GameTable({
  state,
  logOpen,
  onToggleLog,
  onCloseLog,
}: GameTableProps) {
  const reduceMotion = useReducedMotion();
  const self = state.players.find((player) => player.id === state.selfId);
  const currentPlay = state.table.at(-1);
  const isTurn = state.activePlayerId === state.selfId;
  const activeName = state.players.find(
    (player) => player.id === state.activePlayerId,
  )?.name;
  const playedOpposite =
    state.rulesMode === "vosu" && currentPlay?.valueMode === "opposite";

  return (
    <section className="table-zone" aria-label="Table">
      <header className="round-header">
        <span>
          Round {state.round} of {state.totalRounds} ·{" "}
          <RulesModeBadge mode={state.rulesMode} />
        </span>
        <b aria-live="polite">
          {isTurn
            ? "Your move"
            : `${activeName ?? "Another player"} is thinking`}
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
      <motion.div className="felt-table" layout={!reduceMotion}>
        <AnimatePresence mode="wait">
          {currentPlay ? (
            <motion.div
              className="current-play"
              key={currentPlay.id}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? {} : { opacity: 0, y: -16 }}
            >
              <p className="table-caption">
                {state.players.find((p) => p.id === currentPlay.playerId)?.name}{" "}
                showed · {currentPlay.valueMode.toUpperCase()}
              </p>
              <div className="table-play">
                {currentPlay.cards.map((card) => (
                  <GameCard
                    card={card}
                    compact
                    {...(playedOpposite
                      ? { effectiveValueMode: "opposite" as const }
                      : {})}
                    playedOpposite={playedOpposite}
                    key={card.id}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.p className="empty-table" key="empty">
              The table is open. Set the pace.
            </motion.p>
          )}
        </AnimatePresence>
        <div className="table-score">
          <span>YOU</span>
          <strong>{self?.score ?? 0}</strong>
          <small>points</small>
        </div>
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
