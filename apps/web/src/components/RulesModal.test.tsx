import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RulesModal } from "./RulesModal";

describe("RulesModal orientation semantics", () => {
  it("distinguishes the locked active value from the opposite reference", () => {
    render(<RulesModal open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "How to take the table" });
    expect(dialog).toHaveTextContent(/large upright number labeled ACTIVE is the card’s playable value/i);
    expect(dialog).toHaveTextContent(/small OPPOSITE number beneath it is only a reference/i);
    expect(dialog).toHaveTextContent(/cannot choose it for a Show/i);
    expect(dialog).toHaveTextContent(/newly Scouted card may choose either orientation only while you insert it/i);
  });
});
