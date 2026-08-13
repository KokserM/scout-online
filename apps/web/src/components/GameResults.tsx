import { Trophy } from "lucide-react";
import type { ClientAction, GameState, RoundOutcome } from "../protocol/types";
import { AccessibleDialog } from "./AccessibleDialog";
import { RulesModeBadge } from "./RulesModeBadge";

function playerName(state: GameState, playerId: string | undefined): string {
  return state.players.find((player) => player.id === playerId)?.name ?? "A player";
}

function roundStory(state: GameState, outcome: RoundOutcome) {
  const name = playerName(state, outcome.winnerId);
  if (outcome.reason === "empty-hand") {
    return {
      headline: `${name} goes out.`,
      subline:
        "Empty hand ends the round. Remaining cards are a penalty except for that player’s captured/Scout score.",
    };
  }
  if (outcome.reason === "all-scouted") {
    return {
      headline: `${name}’s Show stood.`,
      subline: `Every other player Scouted it. ${name} skips the hand penalty.`,
    };
  }
  return {
    headline: `${name} takes the round.`,
    subline: "The other player could not Show and had no Scout chips left.",
  };
}

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
  const story = state.roundOutcome
    ? roundStory(state, state.roundOutcome)
    : undefined;
  const title = final
    ? winners.length > 1
      ? `${winners.map((player) => player.name).join(" & ")} share the win.`
      : `${ranked[0]?.name} takes the grandstand.`
    : (story?.headline ?? "That’s the round.");
  const subline = final
    ? story
      ? `${story.headline} ${story.subline}`
      : undefined
    : story?.subline;
  const roundLeadId = state.roundOutcome?.winnerId;

  return (
    <AccessibleDialog className="results-card" labelledBy="results-title">
      <Trophy className="results-trophy" aria-hidden="true" />
      <p className="eyebrow">
        {final ? "MATCH COMPLETE" : `ROUND ${state.round} COMPLETE`} ·{" "}
        <RulesModeBadge mode={state.rulesMode} />
      </p>
      <h1 id="results-title">{title}</h1>
      {subline && <p className="results-story">{subline}</p>}
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
          const classes = [
            player.score === topScore && final ? "is-winner" : "",
            player.id === roundLeadId ? "is-round-lead" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li className={classes} key={player.id}>
              <span>{index + 1}</span>
              <b>{player.name}</b>
              <small>
                {score ? (
                  <>
                    <span>
                      Captured <b>+{score.capturedCards}</b>
                    </span>
                    {state.variant !== "two-player" && (
                      <span>
                        Scout <b>+{score.scoutPoints}</b>
                      </span>
                    )}
                    {state.variant === "two-player" && (
                      <span>
                        Unused chips <b>+{score.unusedScoutChips}</b>
                      </span>
                    )}
                    <span>
                      Hand{" "}
                      <b>
                        {score.handPenaltyExempt
                          ? "exempt (unbeaten Show)"
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
