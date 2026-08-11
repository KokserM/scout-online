import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHandRangeSelection } from "./useHandRangeSelection";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

function dispatchPointer(
  target: Element,
  type: string,
  { pointerId, clientX = 0, clientY = 0 }: { pointerId: number; clientX?: number; clientY?: number },
) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: "touch" },
  });
  fireEvent(target, event);
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

  it("scrolls only the newly active right-side card into view", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(<Harness ids={["a", "b", "c"]} resetKey="turn-1" />);
    const buttons = screen.getAllByRole("button");
    const container = buttons[0]!.parentElement!;
    container.scrollLeft = 240;
    const scrollSpies = buttons.map((button) => {
      const scrollIntoView = vi.fn();
      button.scrollIntoView = scrollIntoView;
      return scrollIntoView;
    });

    fireEvent.keyDown(buttons[0]!, { key: "ArrowRight" });

    expect(buttons[1]).toHaveFocus();
    expect(scrollSpies[0]).not.toHaveBeenCalled();
    expect(scrollSpies[1]).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    expect(scrollSpies[2]).not.toHaveBeenCalled();
    expect(container.scrollLeft).toBe(240);
  });

  it("does not toggle cards when a touch pans or is cancelled", () => {
    render(<Harness ids={["a", "b"]} resetKey="turn-1" />);
    const [first, second] = screen.getAllByRole("button");
    const container = first!.parentElement!;
    container.scrollLeft = 90;

    dispatchPointer(first!, "pointerdown", { pointerId: 5, clientX: 160, clientY: 20 });
    dispatchPointer(first!, "pointermove", { pointerId: 5, clientX: 90, clientY: 22 });
    dispatchPointer(first!, "pointerup", { pointerId: 5 });
    fireEvent.click(first!);

    dispatchPointer(second!, "pointerdown", { pointerId: 6, clientX: 80, clientY: 20 });
    dispatchPointer(second!, "pointercancel", { pointerId: 6 });

    expect(document.querySelector("output")).toHaveTextContent("");
    expect(container.scrollLeft).toBe(90);
  });

  it("resets on authoritative identity changes", () => {
    const { rerender } = render(<Harness ids={["a", "b"]} resetKey="playing|you|a,b" />);
    fireEvent.click(screen.getByRole("button", { name: "a" }));
    expect(screen.getByText("a", { selector: "output" })).toBeInTheDocument();

    rerender(<Harness ids={["a", "b"]} resetKey="playing|other|a,b" />);
    expect(screen.getByText("", { selector: "output" })).toBeInTheDocument();
  });
});
