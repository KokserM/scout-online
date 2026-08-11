import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoGame } from "../protocol/demo";
import { ScoutWorkflowDialog } from "./ScoutWorkflowDialog";

afterEach(cleanup);

describe("ScoutWorkflowDialog", () => {
  it("focuses each stage heading instead of an offscreen preview card", () => {
    const baseProps = {
      state: demoGame,
      currentPlay: demoGame.table.at(-1)!,
      displayedHand: demoGame.hand,
      insertedCardId: demoGame.hand.at(-1)!.id,
      availableEndpoints: ["start" as const, "end" as const],
      selectionStatus: "Keep their order",
      selectedIds: [],
      showIsLegal: false,
      isSelected: () => false,
      getCardProps: () => ({ onClick: vi.fn() }),
      canInsertAt: () => true,
      availableFlips: [false],
      onEndpoint: vi.fn(),
      onOrientation: vi.fn(),
      onContinue: vi.fn(),
      onInsertion: vi.fn(),
      onConfirmScout: vi.fn(),
      onShow: vi.fn(),
      onBack: vi.fn(),
      onCancel: vi.fn(),
    };
    const { rerender } = render(
      <ScoutWorkflowDialog
        {...baseProps}
        flow={{ kind: "scout-and-show", stage: "endpoint" }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Take from either end." })).toHaveFocus();

    rerender(
      <ScoutWorkflowDialog
        {...baseProps}
        flow={{
          kind: "scout-and-show",
          stage: "show",
          endpoint: "start",
          flipped: false,
          insertionIndex: 0,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Choose your Show." })).toHaveFocus();
    expect(within(screen.getByLabelText("Resulting hand preview")).getAllByRole("button")[0]).not.toHaveFocus();
  });

  it("restores the show preview scroll position after selection renders", () => {
    const selectedCardId = demoGame.hand.at(-1)!.id;
    const baseProps = {
      state: demoGame,
      flow: {
        kind: "scout-and-show" as const,
        stage: "show" as const,
        endpoint: "start" as const,
        flipped: false,
        insertionIndex: 0,
      },
      currentPlay: demoGame.table.at(-1)!,
      displayedHand: demoGame.hand,
      insertedCardId: selectedCardId,
      availableEndpoints: ["start" as const],
      selectionStatus: "Keep their order",
      showIsLegal: false,
      getCardProps: () => ({ onClick: vi.fn() }),
      canInsertAt: () => true,
      availableFlips: [false],
      onEndpoint: vi.fn(),
      onOrientation: vi.fn(),
      onContinue: vi.fn(),
      onInsertion: vi.fn(),
      onConfirmScout: vi.fn(),
      onShow: vi.fn(),
      onBack: vi.fn(),
      onCancel: vi.fn(),
    };

    const { rerender } = render(
      <ScoutWorkflowDialog
        {...baseProps}
        selectedIds={[]}
        isSelected={() => false}
      />,
    );
    const preview = screen.getByLabelText("Resulting hand preview");
    preview.scrollLeft = 420;
    fireEvent.scroll(preview);

    // Emulate layout/focus work resetting the scroller during the selection render.
    preview.scrollLeft = 0;
    rerender(
      <ScoutWorkflowDialog
        {...baseProps}
        selectedIds={[selectedCardId]}
        isSelected={(id) => id === selectedCardId}
      />,
    );

    expect(preview.scrollLeft).toBe(420);
    const selected = screen.getByRole("button", { name: /selected, Scouted card/i });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected.querySelector(".card-selected-marker")).toBeInTheDocument();
    expect(selected.querySelector(".card-inserted-marker")).toBeInTheDocument();

    const status = within(screen.getByRole("dialog")).getByRole("status");
    expect(status).toHaveTextContent("1 card selected");
    expect(status).toHaveTextContent("Keep their order");
  });
});
