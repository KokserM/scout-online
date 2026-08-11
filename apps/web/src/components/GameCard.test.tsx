import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameCard, getCardDesign } from "./GameCard";

const card = { id: "one", top: 3, bottom: 8, suit: "coral" as const };

describe("GameCard", () => {
  it("exposes both values and selection to assistive technology", () => {
    const onClick = vi.fn();
    render(<GameCard card={card} selected onClick={onClick} />);
    const button = screen.getByRole("button", { name: /active 3, opposite 8, selected/i });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.querySelector(".card-selected-marker")).toHaveTextContent("✓ SELECTED");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("marks a Scouted insertion distinctly from selection", () => {
    const { rerender } = render(<GameCard card={card} inserted onClick={vi.fn()} />);
    const inserted = screen.getByRole("button", { name: /Scouted card/i });
    expect(inserted).not.toHaveClass("is-selected");
    expect(inserted.querySelector(".card-inserted-marker")).toHaveTextContent("SCOUTED");
    expect(inserted.querySelector(".card-selected-marker")).not.toBeInTheDocument();

    rerender(<GameCard card={card} inserted selected onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: /selected, Scouted card/i })).toHaveClass("is-selected", "is-inserted");
    expect(screen.getByText("SCOUTED")).toBeInTheDocument();
  });

  it("shows one upright active value and a smaller labeled opposite reference", () => {
    const { container } = render(<GameCard card={card} />);

    expect(screen.getByRole("img", { name: "active 3, opposite 8" })).toBeInTheDocument();
    const values = container.querySelector<HTMLElement>('[data-testid="card-value-cluster"]')!;
    expect(values.querySelector(".card-value--playable")).toHaveTextContent("3");
    expect(values.querySelector(".card-value--opposite")).toHaveTextContent("8");
    expect(values).toHaveTextContent("ACTIVE");
    expect(values).toHaveTextContent("OPPOSITE");
    expect(container.querySelectorAll(".card-value--playable")).toHaveLength(1);
  });

  it("makes the flipped value the active top without changing card identity", () => {
    const { container } = render(<GameCard card={card} flipped />);
    expect(screen.getByRole("img", { name: "active 8, opposite 3" })).toBeInTheDocument();
    expect(container.querySelector('[data-testid="card-value-cluster"] .card-value--playable')).toHaveTextContent("8");
    expect(container.querySelector(".game-card")).toHaveAttribute("data-palette", String(getCardDesign(card.id).palette));
  });

  it("derives a deterministic palette and motif from the immutable id", () => {
    const first = getCardDesign("immutable-card-42");
    const second = getCardDesign("immutable-card-42");
    expect(second).toEqual(first);

    const { container, rerender } = render(<GameCard card={{ ...card, id: "immutable-card-42" }} />);
    const initialCard = container.querySelector(".game-card");
    expect(initialCard).toHaveAttribute("data-palette", String(first.palette));
    expect(initialCard).toHaveAttribute("data-motif", first.motif);

    rerender(<GameCard card={{ ...card, id: "immutable-card-42", top: 9, bottom: 2, suit: "sky" }} />);
    expect(container.querySelector(".game-card")).toHaveAttribute("data-palette", String(first.palette));
    expect(container.querySelector(".game-card")).toHaveAttribute("data-motif", first.motif);
  });
});
