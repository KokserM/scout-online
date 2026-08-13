import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoGame } from "../protocol/demo";
import { OrientationDialog } from "./OrientationDialog";

afterEach(cleanup);

describe("OrientationDialog", () => {
  it("keeps transforms off the scrollport when the hand is flipped", () => {
    const onFlip = vi.fn();
    const { rerender } = render(
      <OrientationDialog
        state={{ ...demoGame, mustChooseOrientation: true }}
        previewFlipped={false}
        onFlip={onFlip}
        onLock={vi.fn()}
      />,
    );

    const scroll = screen.getByLabelText(
      `Full hand orientation preview, ${demoGame.hand.length} cards`,
    );
    expect(scroll).toHaveClass("orientation-hand");
    expect(scroll.querySelectorAll(".card-wrap")).toHaveLength(demoGame.hand.length);
    expect(scroll).not.toHaveStyle({ transform: "rotate(1deg)" });
    expect(scroll.querySelector(".orientation-hand-inner")).not.toHaveClass(
      "is-reversed",
    );

    fireEvent.click(screen.getByRole("button", { name: "Flip the whole hand" }));
    expect(onFlip).toHaveBeenCalledTimes(1);

    rerender(
      <OrientationDialog
        state={{ ...demoGame, mustChooseOrientation: true }}
        previewFlipped
        onFlip={onFlip}
        onLock={vi.fn()}
      />,
    );

    expect(scroll).toHaveClass("orientation-hand");
    expect(scroll).not.toHaveClass("is-reversed");
    expect(scroll.querySelector(".orientation-hand-inner")).toHaveClass(
      "is-reversed",
    );
    expect((scroll as HTMLElement).style.transform).toBe("");
  });
});
