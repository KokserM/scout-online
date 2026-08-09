import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useHandRangeSelection } from "./useHandRangeSelection";

afterEach(cleanup);

function Harness({ ids, resetKey }: { ids: string[]; resetKey: string }) {
  const selection = useHandRangeSelection(ids, resetKey);
  return (
    <div>
      {ids.map((id, index) => (
        <button
          key={id}
          aria-label={id}
          aria-pressed={selection.isSelected(id)}
          {...selection.getCardProps(index)}
        >
          {id}
        </button>
      ))}
      <output>{selection.selectedIds.join(",")}</output>
    </div>
  );
}

describe("useHandRangeSelection", () => {
  it("sets, extends, and deselects contiguous ranges from either edge", () => {
    render(<Harness ids={["a", "b", "c", "d"]} resetKey="turn-1" />);

    fireEvent.click(screen.getByRole("button", { name: "b" }));
    fireEvent.click(screen.getByRole("button", { name: "c" }));
    expect(screen.getByText("b,c", { selector: "output" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "b" }));
    expect(screen.getByText("c", { selector: "output" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "c" }));
    expect(screen.getByText("", { selector: "output" })).toBeInTheDocument();
  });

  it("selects an adjacent range by pointer drag without moving cards", () => {
    render(<Harness ids={["a", "b", "c", "d"]} resetKey="turn-1" />);
    const buttons = screen.getAllByRole("button");

    fireEvent.pointerDown(buttons[1]!, { pointerId: 7, button: 0 });
    fireEvent.pointerEnter(buttons[2]!, { pointerId: 7 });
    fireEvent.pointerEnter(buttons[3]!, { pointerId: 7 });
    fireEvent.pointerUp(buttons[3]!, { pointerId: 7 });

    expect(screen.getByText("b,c,d", { selector: "output" })).toBeInTheDocument();
    expect(buttons.map((button) => button.textContent)).toEqual(["a", "b", "c", "d"]);
  });

  it("supports arrows, Shift range extension, and Space selection", () => {
    render(<Harness ids={["a", "b", "c"]} resetKey="turn-1" />);
    const first = screen.getByRole("button", { name: "a" });

    fireEvent.keyDown(first, { key: " " });
    fireEvent.keyDown(first, { key: "ArrowRight", shiftKey: true });
    expect(screen.getByText("a,b", { selector: "output" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("button", { name: "b" }), { key: "ArrowRight", shiftKey: true });
    expect(screen.getByText("a,b,c", { selector: "output" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "c" }), { key: "Enter" });
    expect(screen.getByText("a,b", { selector: "output" })).toBeInTheDocument();
  });

  it("resets on authoritative identity changes", () => {
    const { rerender } = render(<Harness ids={["a", "b"]} resetKey="playing|you|a,b" />);
    fireEvent.click(screen.getByRole("button", { name: "a" }));
    expect(screen.getByText("a", { selector: "output" })).toBeInTheDocument();

    rerender(<Harness ids={["a", "b"]} resetKey="playing|other|a,b" />);
    expect(screen.getByText("", { selector: "output" })).toBeInTheDocument();
  });
});
