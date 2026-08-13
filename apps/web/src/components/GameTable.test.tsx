import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoGame } from "../protocol/demo";
import type { GameState } from "../protocol/types";
import { GameTable, OpponentStrip } from "./GameTable";

afterEach(cleanup);

function renderTable(state: GameState = demoGame) {
  return render(
    <GameTable
      state={state}
      logOpen={false}
      onToggleLog={vi.fn()}
      onCloseLog={vi.fn()}
    />,
  );
}

describe("GameTable", () => {
  it("keeps played cards upright while emphasizing Võsu opposite values", () => {
    const state = {
      ...demoGame,
      rulesMode: "vosu" as const,
      table: demoGame.table.map((play) => ({
        ...play,
        valueMode: "opposite" as const,
      })),
    };
    const { container } = renderTable(state);

    expect(screen.getByText(/showed · OPPOSITE/i)).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: /active 6, opposite 5, effective Show value 5 from opposite, played opposite/i,
      }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".is-effective-opposite")).toHaveLength(
      state.table.at(-1)!.cards.length,
    );
    expect(container.querySelectorAll(".card-effective-badge")).toHaveLength(
      state.table.at(-1)!.cards.length,
    );
  });

  it("does not style an opposite projection as active in Official mode", () => {
    const state = {
      ...demoGame,
      rulesMode: "official" as const,
      table: demoGame.table.map((play) => ({
        ...play,
        valueMode: "opposite" as const,
      })),
    };
    const { container } = renderTable(state);

    expect(container.querySelector(".is-effective-opposite")).not.toBeInTheDocument();
    expect(container.querySelector(".card-effective-badge")).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "active 6, opposite 5" }),
    ).toBeInTheDocument();
  });

  it("announces the local player's turn on the table", () => {
    const { container } = renderTable();
    expect(screen.getByText("Your move")).toBeInTheDocument();
    expect(container.querySelector(".felt-table")).toHaveClass("is-your-turn");
    expect(screen.getByText("YOUR MOVE")).toBeInTheDocument();
  });

  it("marks the active opponent, shows an exact leftover count, and surfaces overflow", () => {
    const state = {
      ...demoGame,
      activePlayerId: "maya",
      players: demoGame.players.map((player) =>
        player.id === "maya" ? { ...player, handCount: 9 } : player,
      ),
    };
    const { container } = render(
      <>
        <OpponentStrip state={state} />
        <GameTable
          state={state}
          logOpen={false}
          onToggleLog={vi.fn()}
          onCloseLog={vi.fn()}
        />
      </>,
    );

    expect(screen.getByText("Maya's move")).toBeInTheDocument();
    expect(container.querySelector(".felt-table")).toHaveClass("is-waiting");
    expect(container.querySelector(".turn-pill")).toHaveTextContent("Maya");

    const maya = screen.getByRole("article", {
      name: "Maya, 9 cards left, playing, Show",
    });
    expect(maya).toHaveAttribute("aria-current", "true");
    expect(maya).toHaveTextContent("Playing");
    expect(maya).toHaveTextContent("Show");
    expect(maya.querySelector(".hand-count-badge")).toHaveTextContent(/9/);
    expect(maya.querySelector(".hand-count-badge")).toHaveTextContent(/left/i);
    expect(maya.querySelector(".mini-hand-more")).toHaveTextContent("+3");
    expect(maya.querySelectorAll(".mini-hand i")).toHaveLength(6);
  });

  it("marks the Show owner separately from the player whose turn it is", () => {
    render(
      <OpponentStrip
        state={{
          ...demoGame,
          activePlayerId: "theo",
          scoutTargetId: "maya",
        }}
      />,
    );
    const maya = screen.getByRole("article", {
      name: "Maya, 5 cards left, Show",
    });
    const theo = screen.getByRole("article", {
      name: "Theo, 8 cards left, playing",
    });
    expect(maya.querySelector(".show-marker")).toHaveTextContent("Show");
    expect(theo.querySelector(".playing-marker")).toHaveTextContent("Playing");
    expect(theo.querySelector(".show-marker")).not.toBeInTheDocument();
  });

  it("pulses a +1 Scout award on the local score and opponent badge", () => {
    const { container } = render(
      <>
        <OpponentStrip
          state={demoGame}
          scoutAwardIds={["maya"]}
          pulseKey={1}
        />
        <GameTable
          state={demoGame}
          logOpen={false}
          onToggleLog={vi.fn()}
          onCloseLog={vi.fn()}
          scoutFeedback={{
            selfAward: true,
            opponentAwardIds: ["maya"],
            caption: "Maya earns +1 Scout",
            pulseKey: 1,
          }}
        />
      </>,
    );
    expect(screen.getByText("+1 SCOUT")).toBeInTheDocument();
    expect(screen.getByText("Maya earns +1 Scout")).toBeInTheDocument();
    expect(container.querySelector(".you-scout-line")).toHaveTextContent("2 Scout");
    expect(container.querySelector(".scout-award-float")).toHaveTextContent("+1");
  });
});
