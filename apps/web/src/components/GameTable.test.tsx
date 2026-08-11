import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { demoGame } from "../protocol/demo";
import type { GameState } from "../protocol/types";
import { GameTable } from "./GameTable";

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
});
