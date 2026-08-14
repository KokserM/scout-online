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

  it("renders one table card per Show card and exposes seat anchors", () => {
    const play = demoGame.table.at(-1)!;
    const { container } = render(
      <>
        <OpponentStrip state={demoGame} />
        <GameTable
          state={demoGame}
          logOpen={false}
          onToggleLog={vi.fn()}
          onCloseLog={vi.fn()}
        />
      </>,
    );
    expect(container.querySelectorAll(".card-deal")).toHaveLength(play.cards.length);
    expect(container.querySelector("[data-table-play]")).toBeInTheDocument();
    expect(container.querySelector(`[data-seat="${demoGame.selfId}"]`)).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: /Maya, 5 cards left, Show/ }),
    ).toHaveAttribute("data-seat", "maya");
  });

  it("still shows every Show card immediately during a deal, including reduced motion", () => {
    const play = demoGame.table.at(-1)!;
    const tableMotion = {
      showDeal: {
        playId: play.id,
        actorId: play.playerId,
        cardIds: play.cards.map((card) => card.id),
      },
      pulseKey: 1,
    };
    const { container, rerender } = render(
      <GameTable
        state={demoGame}
        logOpen={false}
        onToggleLog={vi.fn()}
        onCloseLog={vi.fn()}
        tableMotion={tableMotion}
      />,
    );
    expect(container.querySelectorAll(".card-deal")).toHaveLength(play.cards.length);

    const matchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
      }),
    });
    rerender(
      <GameTable
        state={demoGame}
        logOpen={false}
        onToggleLog={vi.fn()}
        onCloseLog={vi.fn()}
        tableMotion={tableMotion}
      />,
    );
    expect(container.querySelectorAll(".card-deal")).toHaveLength(play.cards.length);
    expect(container.querySelectorAll(".card-deal .card-wrap")).toHaveLength(
      play.cards.length,
    );
    window.matchMedia = matchMedia;
  });

  it("pulses live points and captions a Scout award", () => {
    const { container } = render(
      <>
        <OpponentStrip state={demoGame} pulsingPlayerId="maya" />
        <GameTable
          state={demoGame}
          logOpen={false}
          onToggleLog={vi.fn()}
          onCloseLog={vi.fn()}
          tableMotion={{
            scoutAward: { ownerId: "maya" },
            caption: "Maya earns +1 Scout",
            pulseKey: 1,
            pulsingPlayerId: "maya",
          }}
        />
      </>,
    );
    expect(screen.getAllByText("Maya earns +1 Scout").length).toBeGreaterThan(0);
    expect(container.querySelector(".you-scout-line")).toHaveTextContent("2 Scout");
    expect(container.querySelector(".opponent .is-points-pulse")).toHaveTextContent(
      "17 pts",
    );
  });
});
