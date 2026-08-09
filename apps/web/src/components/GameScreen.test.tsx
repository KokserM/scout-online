import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoGame } from "../protocol/demo";
import { GameScreen } from "./GameScreen";

afterEach(cleanup);

describe("GameScreen action hints", () => {
  it("uses projected Show ranges instead of reclassifying card values", () => {
    const dispatch = vi.fn();
    const state = {
      ...demoGame,
      availableActions: {
        ...demoGame.availableActions,
        show: {
          enabled: true,
          ranges: [
            {
              // 3, 4, 4 is deliberately not a valid engine pattern. The UI
              // must still follow the authoritative projection it received.
              cardIds: ["c1", "c2", "c3"],
              kind: "run" as const,
              legal: true,
            },
          ],
        },
      },
    };
    render(<GameScreen state={state} connected dispatch={dispatch} />);

    fireEvent.click(screen.getByRole("button", { name: "3 over 8" }));
    fireEvent.click(screen.getAllByRole("button", { name: "4 over 7" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "4 over 7" })[0]!);

    const show = screen.getByRole("button", { name: "Show 3" });
    expect(show).toBeEnabled();
    expect(screen.getByText("run · legal Show")).toBeInTheDocument();
    fireEvent.click(show);
    expect(dispatch).toHaveBeenCalledWith({
      type: "show",
      cardIds: ["c1", "c2", "c3"],
    });
  });

  it("exposes every insertion gap once and confirms Scout before dispatch", () => {
    const dispatch = vi.fn();
    render(<GameScreen state={demoGame} connected dispatch={dispatch} />);

    fireEvent.click(screen.getByRole("button", { name: /^Scout$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Take left" }));
    fireEvent.click(screen.getByRole("button", { name: "Use value 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose a gap" }));

    const gaps = screen.getAllByRole("button", { name: /Insert at position/ });
    expect(gaps).toHaveLength(demoGame.hand.length + 1);
    expect(new Set(gaps.map((gap) => gap.getAttribute("aria-label"))).size).toBe(gaps.length);

    fireEvent.click(screen.getByRole("button", { name: "Insert at position 3" }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm Scout" })).toBeEnabled();
    expect(screen.getByLabelText("Resulting hand preview").children).toHaveLength(demoGame.hand.length + 1);

    fireEvent.click(screen.getByRole("button", { name: "Confirm Scout" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "scout",
      playId: "p1",
      position: "start",
      insertionIndex: 3,
      flipped: false,
    });
  });

  it("allows back and cancel without dispatching", async () => {
    const dispatch = vi.fn();
    render(<GameScreen state={demoGame} connected dispatch={dispatch} />);

    fireEvent.click(screen.getByRole("button", { name: /^Scout$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Take right" }));
    fireEvent.click(screen.getByRole("button", { name: "Use value 8" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose a gap" }));
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("heading", { name: "Which way is up?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Which way is up?" })).not.toBeInTheDocument());
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("previews and completes a projected Scout & Show option", () => {
    const dispatch = vi.fn();
    const state = {
      ...demoGame,
      availableActions: {
        ...demoGame.availableActions,
        scoutAndShow: {
          enabled: true,
          playId: "p1",
          options: Array.from({ length: demoGame.hand.length + 1 }, (_, insertAt) => ({
            position: "start" as const,
            insertAt,
            flipped: false,
            showRanges: [{ cardIds: ["t1"], kind: "single" as const, legal: true }],
          })),
        },
      },
    };
    render(<GameScreen state={state} connected dispatch={dispatch} />);

    fireEvent.click(screen.getByRole("button", { name: "Scout & Show" }));
    fireEvent.click(screen.getByRole("button", { name: "Take left" }));
    fireEvent.click(screen.getByRole("button", { name: "Use value 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose a gap" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert at position 2" }));

    expect(screen.getByRole("heading", { name: "Choose your Show." })).toBeInTheDocument();
    const preview = screen.getByLabelText("Resulting hand preview");
    expect(preview.children).toHaveLength(demoGame.hand.length + 1);
    fireEvent.click(preview.children[2] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Confirm Scout & Show 1" }));

    expect(dispatch).toHaveBeenCalledWith({
      type: "scout-and-show",
      playId: "p1",
      position: "start",
      insertionIndex: 2,
      flipped: false,
      cardIds: ["t1"],
    });
  });

  it("offers only projected legal orientations before Scout & Show insertion", () => {
    const state = {
      ...demoGame,
      availableActions: {
        ...demoGame.availableActions,
        scoutAndShow: {
          enabled: true,
          playId: "p1",
          options: [{
            position: "start" as const,
            insertAt: 0,
            flipped: true,
            showRanges: [{ cardIds: ["t1"], kind: "single" as const, legal: true }],
          }],
        },
      },
    };
    render(<GameScreen state={state} connected dispatch={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Scout & Show" }));
    fireEvent.click(screen.getByRole("button", { name: "Take left" }));

    expect(screen.getByRole("button", { name: "Use value 6" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use value 5" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a gap" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Use value 6" }));
    expect(screen.getByRole("button", { name: "Choose a gap" })).toBeEnabled();
  });
});

describe("GameScreen experience polish", () => {
  it("shows the full hand and orientation progress in an accessible dialog", () => {
    const dispatch = vi.fn();
    const state = {
      ...demoGame,
      phase: "orientation" as const,
      mustChooseOrientation: true,
      players: demoGame.players.map((player, index) => ({
        ...player,
        orientationChosen: index < 2,
      })),
    };
    render(<GameScreen state={state} connected dispatch={dispatch} />);

    const dialog = screen.getByRole("dialog", { name: "Which way is up?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText(`Full hand orientation preview, ${demoGame.hand.length} cards`).children).toHaveLength(demoGame.hand.length);
    expect(screen.getByText(`2 of ${demoGame.players.length} players locked`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lock this orientation" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "choose-orientation", flipped: false });
  });

  it("makes preview controls explicitly read-only", () => {
    const dispatch = vi.fn();
    render(<GameScreen state={demoGame} connected={false} dispatch={dispatch} readOnly />);

    expect(screen.getByText(/Demo preview · controls are read-only/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Scout$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Show" })).toBeDisabled();
    expect(screen.queryByText(/Connection lost/)).not.toBeInTheDocument();
  });

  it("cancels a safe workflow with Escape and restores keyboard focus", async () => {
    render(<GameScreen state={demoGame} connected dispatch={vi.fn()} />);
    const scout = screen.getByRole("button", { name: /^Scout$/ });
    scout.focus();
    fireEvent.click(scout);
    expect(screen.getByRole("dialog", { name: "Take from either end." })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Take from either end." })).not.toBeInTheDocument());
    await waitFor(() => expect(scout).toHaveFocus());
  });

  it("keeps detailed scoring semantics and names shared winners", () => {
    const state = {
      ...demoGame,
      phase: "final" as const,
      players: demoGame.players.map((player, index) => ({ ...player, score: index < 2 ? 20 : player.score })),
      roundScores: demoGame.players.map((player) => ({
        playerId: player.id,
        capturedCards: 3,
        scoutPoints: 2,
        cardsRemaining: 1,
        unusedScoutChips: 0,
        handPenaltyExempt: false,
        roundTotal: 4,
        cumulativeTotal: 20,
      })),
    };
    render(<GameScreen state={state} connected dispatch={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "You & Maya share the win." })).toBeInTheDocument();
    expect(screen.getAllByText("Captured").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Round").length).toBeGreaterThan(0);
  });
});
