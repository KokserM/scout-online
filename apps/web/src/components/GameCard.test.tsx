import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameCard, getCardDesign } from "./GameCard";

const card = { id: "one", top: 3, bottom: 8, suit: "coral" as const };

describe("GameCard", () => {
  it("exposes both values and selection to assistive technology", () => {
    const onClick = vi.fn();
    render(<GameCard card={card} selected onClick={onClick} />);
    const button = screen.getByRole("button", { name: /3 over 8, selected/i });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("repeats opposite values beneath the playable values at both ends", () => {
    const { container } = render(<GameCard card={card} />);

    const top = container.querySelector<HTMLElement>('[data-testid="card-top-cluster"]')!;
    expect(top.querySelector(".card-value--playable")).toHaveTextContent("3");
    expect(top.querySelector(".card-value--opposite")).toHaveTextContent("8");
    expect(top).toHaveTextContent("TOP");

    const bottom = container.querySelector<HTMLElement>('[data-testid="card-bottom-cluster"]')!;
    expect(bottom).toHaveClass("card-end--bottom");
    expect(bottom.querySelector(".card-value--playable")).toHaveTextContent("8");
    expect(bottom.querySelector(".card-value--opposite")).toHaveTextContent("3");
  });

  it("makes the flipped value the active top without changing card identity", () => {
    const { container } = render(<GameCard card={card} flipped />);
    expect(container.querySelector('[data-testid="card-top-cluster"] .card-value--playable')).toHaveTextContent("8");
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
