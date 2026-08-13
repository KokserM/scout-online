import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoGame } from "../protocol/demo";
import type { GameState, RoundOutcome, RoundScore } from "../protocol/types";
import { GameResults } from "./GameResults";

afterEach(cleanup);

function scores(
  overrides: Partial<Record<string, Partial<RoundScore>>> = {},
): RoundScore[] {
  return demoGame.players.map((player) => ({
    playerId: player.id,
    capturedCards: 3,
    scoutPoints: 2,
    cardsRemaining: 4,
    unusedScoutChips: 1,
    handPenaltyExempt: false,
    roundTotal: 1,
    cumulativeTotal: player.score,
    ...overrides[player.id],
  }));
}

function renderResults(
  outcome: RoundOutcome,
  extra: Partial<GameState> = {},
  final = false,
) {
  return render(
    <GameResults
      state={{
        ...demoGame,
        phase: final ? "final" : "round-results",
        roundOutcome: outcome,
        roundScores: scores(),
        ...extra,
      }}
      final={final}
      dispatch={vi.fn()}
    />,
  );
}

describe("GameResults", () => {
  it("tells the empty-hand story and highlights the player who went out", () => {
    const { container } = renderResults({
      reason: "empty-hand",
      winnerId: "you",
    });
    expect(screen.getByText(/ROUND 2 COMPLETE/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "You goes out." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Empty hand ends the round/i),
    ).toBeInTheDocument();
    expect(container.querySelector(".is-round-lead")).toHaveTextContent("You");
  });

  it("tells the unbeaten Show story, exempts the owner, and highlights their row", () => {
    const { container } = renderResults(
      { reason: "all-scouted", winnerId: "maya", protectedPlayerId: "maya" },
      {
        roundScores: scores({
          maya: { handPenaltyExempt: true, cardsRemaining: 5 },
        }),
      },
    );
    expect(
      screen.getByRole("heading", { name: "Maya’s Show stood." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Every other player Scouted it. Maya skips the hand penalty./),
    ).toBeInTheDocument();
    expect(screen.getByText("exempt (unbeaten Show)")).toBeInTheDocument();
    expect(container.querySelector(".is-round-lead")).toHaveTextContent("Maya");
  });

  it("tells the two-player stuck story and hides the Scout point line", () => {
    renderResults(
      { reason: "two-player-stuck", winnerId: "you" },
      {
        variant: "two-player",
        players: demoGame.players.slice(0, 2),
        roundScores: scores().slice(0, 2),
      },
    );
    expect(
      screen.getByRole("heading", { name: "You takes the round." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /The other player could not Show and had no Scout chips left./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Scout")).not.toBeInTheDocument();
    expect(screen.getAllByText("Unused chips").length).toBeGreaterThan(0);
  });

  it("keeps the match winner as the title and the last-round story as the subline", () => {
    renderResults(
      { reason: "empty-hand", winnerId: "maya" },
      {
        players: demoGame.players.map((player) => ({
          ...player,
          score: player.id === "maya" ? 30 : 10,
        })),
      },
      true,
    );
    expect(screen.getByText(/MATCH COMPLETE/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Maya takes the grandstand." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Maya goes out. Empty hand ends the round/),
    ).toBeInTheDocument();
  });
});
