import { Trophy } from "lucide-react";
import type { ClientAction, GameState } from "../protocol/types";
import { AccessibleDialog } from "./AccessibleDialog";
import { RulesModeBadge } from "./RulesModeBadge";

export function GameResults({
  state,
  final,
  dispatch,
}: {
  state: GameState;
  final: boolean;
  dispatch: (action: ClientAction) => void;
}) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score;
  const winners = ranked.filter((player) => player.score === topScore);
  const isHost = state.selfId === state.hostId;
  const title = final
    ? winners.length > 1
      ? `${winners.map((player) => player.name).join(" & ")} share the win.`
      : `${ranked[0]?.name} takes the grandstand.`
    : "That’s the round.";

  return (
    <AccessibleDialog className="results-card" labelledBy="results-title">
      <Trophy className="results-trophy" aria-hidden="true" />
      <p className="eyebrow">
        {final ? "MATCH COMPLETE" : `ROUND ${state.round} COMPLETE`} ·{" "}
        <RulesModeBadge mode={state.rulesMode} />
      </p>
      <h1 id="results-title">{title}</h1>
      <p className="results-mode-copy">
        {state.rulesMode === "vosu"
          ? state.variant === "two-player"
            ? "Võsu · Scout and Scout & Show used the same limited Scout chips."
            : "Võsu · Scout & Show remained unlimited this round."
          : "Official rules · active Show values only."}
      </p>
      <ol className="standings">
        {ranked.map((player, index) => {
          const score = state.roundScores?.find(
            (entry) => entry.playerId === player.id,
          );
          return (
            <li
              className={player.score === topScore && final ? "is-winner" : ""}
              key={player.id}
            >
              <span>{index + 1}</span>
              <b>{player.name}</b>
              <small>
                {score ? (
                  <>
                    <span>
                      Captured <b>+{score.capturedCards}</b>
                    </span>
                    <span>
                      Scout <b>+{score.scoutPoints}</b>
                    </span>
                    {state.variant === "two-player" && (
                      <span>
                        Unused chips <b>+{score.unusedScoutChips}</b>
                      </span>
                    )}
                    <span>
                      Hand{" "}
                      <b>
                        {score.handPenaltyExempt
                          ? "exempt"
                          : `−${score.cardsRemaining}`}
                      </b>
                    </span>
                    <span>
                      Round{" "}
                      <b>
                        {score.roundTotal >= 0 ? "+" : ""}
                        {score.roundTotal}
                      </b>
                    </span>
                  </>
                ) : (
                  "Final standing"
                )}
              </small>
              <strong>{player.score}</strong>
            </li>
          );
        })}
      </ol>
      {isHost ? (
        <button
          className="button button--primary button--full"
          onClick={() => dispatch({ type: final ? "rematch" : "next-round" })}
        >
          {final ? "Play again" : "Next round"}
        </button>
      ) : (
        <>
          <p className="waiting-copy">Waiting for the host…</p>
          <button
            className="text-button leave-button"
            onClick={() => dispatch({ type: "leave-room" })}
          >
            Leave table
          </button>
        </>
      )}
      {final && isHost && (
        <button
          className="text-button"
          onClick={() => dispatch({ type: "leave-room" })}
        >
          Return home
        </button>
      )}
    </AccessibleDialog>
  );
}
