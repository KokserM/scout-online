import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoGame } from "../protocol/demo";
import { GameScreen } from "./GameScreen";

afterEach(cleanup);

describe("GameScreen action hints", () => {
  it("requires an explicit authoritative mode when both Võsu modes are legal", () => {
    const dispatch = vi.fn();
    const dualRanges = ["c1", "c2"].flatMap((cardId) =>
      (["active", "opposite"] as const).map((valueMode) => ({
        cardIds: [cardId],
        kind: "single" as const,
        valueMode,
        legal: true,
      })),
    );
    render(
      <GameScreen
        state={{
          ...demoGame,
          rulesMode: "vosu",
          availableActions: {
            ...demoGame.availableActions,
            show: { enabled: true, ranges: dualRanges },
          },
        }}
        connected
        dispatch={dispatch}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "active 3, opposite 8" }),
    );
    const picker = screen.getByRole("group", {
      name: "Choose values for this Show",
    });
    expect(
      within(picker).getByRole("radio", { name: "ACTIVE" }),
    ).not.toBeChecked();
    expect(
      within(picker).getByRole("radio", { name: "OPPOSITE" }),
    ).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Show 1" })).toBeDisabled();

    fireEvent.click(within(picker).getByRole("radio", { name: "OPPOSITE" }));
    fireEvent.click(screen.getByRole("button", { name: "Show 1" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "show",
      cardIds: ["c1"],
      valueMode: "opposite",
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: "active 4, opposite 7" })[0]!,
    );
    const repeatedPicker = screen.getByRole("group", {
      name: "Choose values for this Show",
    });
    expect(
      within(repeatedPicker).getByRole("radio", { name: "OPPOSITE" }),
    ).not.toBeChecked();
  });

  it("previews one chosen value mode across the entire selected range", () => {
    render(
      <GameScreen
        state={{
          ...demoGame,
          rulesMode: "vosu",
          availableActions: {
            ...demoGame.availableActions,
            show: {
              enabled: true,
              ranges: (["active", "opposite"] as const).map((valueMode) => ({
                cardIds: ["c1", "c2"],
                kind: "run" as const,
                valueMode,
                legal: true,
              })),
            },
          },
        }}
        connected
        dispatch={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "active 3, opposite 8" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "active 4, opposite 7" })[0]!,
    );
    const picker = screen.getByRole("group", {
      name: "Choose values for this Show",
    });
    fireEvent.click(within(picker).getByRole("radio", { name: "OPPOSITE" }));

    const oppositePreviews = screen.getAllByRole("button", {
      name: /effective Show value \d+ from opposite, selected/i,
    });
    expect(oppositePreviews).toHaveLength(2);
    expect(
      oppositePreviews.every((card) =>
        card.querySelector(".game-card")?.classList.contains(
          "is-effective-opposite",
        ),
      ),
    ).toBe(true);
    expect(
      document.querySelector(".is-selected .is-effective-active"),
    ).not.toBeInTheDocument();

    fireEvent.click(within(picker).getByRole("radio", { name: "ACTIVE" }));
    expect(
      screen.getAllByRole("button", {
        name: /effective Show value \d+ from active, selected/i,
      }),
    ).toHaveLength(2);
    expect(
      document.querySelector(".is-selected .is-effective-opposite"),
    ).not.toBeInTheDocument();
  });

  it("auto-selects the only legal authoritative Võsu mode", () => {
    const dispatch = vi.fn();
    render(
      <GameScreen
        state={{
          ...demoGame,
          rulesMode: "vosu",
          availableActions: {
            ...demoGame.availableActions,
            show: {
              enabled: true,
              ranges: [
                {
                  cardIds: ["c1"],
                  kind: "single",
                  valueMode: "active",
                  legal: false,
                },
                {
                  cardIds: ["c1"],
                  kind: "single",
                  valueMode: "opposite",
                  legal: true,
                },
              ],
            },
          },
        }}
        connected
        dispatch={dispatch}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "active 3, opposite 8" }),
    );
    expect(
      screen.queryByRole("group", { name: "Choose values for this Show" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 1" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "show",
      cardIds: ["c1"],
      valueMode: "opposite",
    });
  });

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
              valueMode: "active" as const,
              legal: true,
            },
          ],
        },
      },
    };
    render(<GameScreen state={state} connected dispatch={dispatch} />);

    fireEvent.click(
      screen.getByRole("button", { name: "active 3, opposite 8" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "active 4, opposite 7" })[0]!,
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "active 4, opposite 7" })[0]!,
    );

    const show = screen.getByRole("button", { name: "Show 3" });
    expect(show).toBeEnabled();
    expect(screen.getByText("run · legal Show")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("3 cards selected");
    expect(screen.getByRole("status")).toHaveTextContent("run · legal Show");
    fireEvent.click(show);
    expect(dispatch).toHaveBeenCalledWith({
      type: "show",
      cardIds: ["c1", "c2", "c3"],
      valueMode: "active",
    });
  });

  it("reports projected too-weak and invalid selections with their counts", () => {
    const state = {
      ...demoGame,
      availableActions: {
        ...demoGame.availableActions,
        show: {
          enabled: true,
          ranges: [
            {
              cardIds: ["c1"],
              kind: "single" as const,
              valueMode: "active" as const,
              legal: false,
            },
          ],
        },
      },
    };
    render(<GameScreen state={state} connected dispatch={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "active 3, opposite 8" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 card selected");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Valid pattern, but too weak",
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "active 4, opposite 7" })[0]!,
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 cards selected");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Not a valid Show pattern",
    );
  });

  it("exposes every insertion gap once and confirms Scout before dispatch", () => {
    const dispatch = vi.fn();
    render(<GameScreen state={demoGame} connected dispatch={dispatch} />);

    fireEvent.click(screen.getByRole("button", { name: /^Scout$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Take left" }));
    fireEvent.click(screen.getByRole("button", { name: "Use value 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose a gap" }));
    expect(
      screen
        .getByLabelText("Scouted card to insert")
        .querySelector(".card-inserted-marker"),
    ).toHaveTextContent("SCOUTED");

    const gaps = screen.getAllByRole("button", { name: /Insert at position/ });
    expect(gaps).toHaveLength(demoGame.hand.length + 1);
    expect(
      new Set(gaps.map((gap) => gap.getAttribute("aria-label"))).size,
    ).toBe(gaps.length);

    fireEvent.click(
      screen.getByRole("button", { name: "Insert at position 3" }),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm Scout" })).toBeEnabled();
    const resultPreview = screen.getByLabelText("Resulting hand preview");
    expect(resultPreview.children).toHaveLength(demoGame.hand.length + 1);
    expect(resultPreview.querySelectorAll(".is-inserted")).toHaveLength(1);
    expect(screen.getByText(/card marked SCOUTED/i)).toBeInTheDocument();

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
    expect(
      screen.getByRole("heading", {
        name: "Set the Scouted card’s orientation.",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          name: "Set the Scouted card’s orientation.",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("preserves prior choices on Back and clears transient Show state", async () => {
    const state = {
      ...demoGame,
      availableActions: {
        ...demoGame.availableActions,
        scoutAndShow: {
          enabled: true,
          playId: "p1",
          options: Array.from(
            { length: demoGame.hand.length + 1 },
            (_, insertAt) => ({
              position: "start" as const,
              insertAt,
              flipped: false,
              showRanges: [
                {
                  cardIds: ["t1"],
                  kind: "single" as const,
                  valueMode: "active" as const,
                  legal: true,
                },
              ],
            }),
          ),
        },
      },
    };
    render(<GameScreen state={state} connected dispatch={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Scout & Show" }));
    fireEvent.click(screen.getByRole("button", { name: "Take left" }));
    fireEvent.click(screen.getByRole("button", { name: "Use value 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose a gap" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Insert at position 2" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /active 5, opposite 6, Scouted card/i,
      }),
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("status"),
    ).toHaveTextContent("1 card selected");

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(
      screen.getByRole("heading", { name: "Where does it go?" }),
    ).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("button", { name: "Use value 5" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(
      screen.getByRole("heading", { name: "Take from either end." }),
    ).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Take from either end." }),
      ).not.toBeInTheDocument(),
    );
  });

  it("previews and completes a projected Scout & Show option", () => {
    const dispatch = vi.fn();
    const state = {
      ...demoGame,
      rulesMode: "vosu" as const,
      availableActions: {
        ...demoGame.availableActions,
        scoutAndShow: {
          enabled: true,
          playId: "p1",
          options: Array.from(
            { length: demoGame.hand.length + 1 },
            (_, insertAt) => ({
              position: "start" as const,
              insertAt,
              flipped: false,
              showRanges: [
                {
                  cardIds: ["t1"],
                  kind: "single" as const,
                  valueMode: "active" as const,
                  legal: true,
                },
                {
                  cardIds: ["t1"],
                  kind: "single" as const,
                  valueMode: "opposite" as const,
                  legal: true,
                },
              ],
            }),
          ),
        },
      },
    };
    render(<GameScreen state={state} connected dispatch={dispatch} />);

    fireEvent.click(screen.getByRole("button", { name: "Scout & Show" }));
    fireEvent.click(screen.getByRole("button", { name: "Take left" }));
    fireEvent.click(screen.getByRole("button", { name: "Use value 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose a gap" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Insert at position 2" }),
    );

    expect(
      screen.getByRole("heading", { name: "Choose your Show." }),
    ).toBeInTheDocument();
    const preview = screen.getByLabelText("Resulting hand preview");
    expect(preview.children).toHaveLength(demoGame.hand.length + 1);
    expect(preview.querySelectorAll(".is-inserted")).toHaveLength(1);
    fireEvent.click(preview.children[2] as HTMLElement);
    expect(
      within(preview.children[2] as HTMLElement).getByText("SCOUTED"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("status"),
    ).toHaveTextContent("1 card selected");
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("radio", {
        name: "OPPOSITE",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm Scout & Show 1" }),
    );

    expect(dispatch).toHaveBeenCalledWith({
      type: "scout-and-show",
      playId: "p1",
      position: "start",
      insertionIndex: 2,
      flipped: false,
      cardIds: ["t1"],
      valueMode: "opposite",
    });
  });

  it("offers both Scout orientations before Scout & Show insertion", () => {
    const state = {
      ...demoGame,
      availableActions: {
        ...demoGame.availableActions,
        scoutAndShow: {
          enabled: true,
          playId: "p1",
          options: [
            {
              position: "start" as const,
              insertAt: 0,
              flipped: true,
              showRanges: [
                {
                  cardIds: ["t1"],
                  kind: "single" as const,
                  valueMode: "active" as const,
                  legal: true,
                },
              ],
            },
          ],
        },
      },
    };
    render(<GameScreen state={state} connected dispatch={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Scout & Show" }));
    fireEvent.click(screen.getByRole("button", { name: "Take left" }));

    expect(
      screen.getByText(
        /newly Scouted card may use either available orientation now/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/small OPPOSITE number is only a reference/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use value 6" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use value 5" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a gap" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Use value 5" }));
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
    expect(dialog).toHaveTextContent(
      /large upright number is its active value for Show/i,
    );
    expect(dialog).toHaveTextContent(
      /small OPPOSITE number beneath it is a reference, not another choice/i,
    );
    expect(
      screen
        .getByLabelText(
          `Full hand orientation preview, ${demoGame.hand.length} cards`,
        )
        .querySelectorAll(".card-wrap"),
    ).toHaveLength(demoGame.hand.length);
    expect(
      screen.getByText(`2 of ${demoGame.players.length} players locked`),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Lock this orientation" }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "choose-orientation",
      flipped: false,
    });
  });

  it("explains locked active values in first-round and contextual help", () => {
    render(
      <GameScreen
        state={{ ...demoGame, round: 1 }}
        connected
        dispatch={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/the large upright number is active for Show/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /small OPPOSITE number is a reference and cannot be selected/i,
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Show contextual help" }),
    );
    const help = screen.getByRole("dialog", { name: "It’s your move." });
    expect(help).toHaveTextContent(/cannot be chosen for Show/i);
    expect(help).toHaveTextContent(
      /newly Scouted card may choose either orientation/i,
    );
  });

  it("makes preview controls explicitly read-only", () => {
    const dispatch = vi.fn();
    render(
      <GameScreen
        state={demoGame}
        connected={false}
        dispatch={dispatch}
        readOnly
      />,
    );

    expect(
      screen.getByText(/Demo preview · controls are read-only/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Scout$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Show" })).toBeDisabled();
    expect(screen.queryByText(/Connection lost/)).not.toBeInTheDocument();
  });

  it("cancels a safe workflow with Escape and restores keyboard focus", async () => {
    render(<GameScreen state={demoGame} connected dispatch={vi.fn()} />);
    const scout = screen.getByRole("button", { name: /^Scout$/ });
    scout.focus();
    fireEvent.click(scout);
    expect(
      screen.getByRole("dialog", { name: "Take from either end." }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Take from either end." }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(scout).toHaveFocus());
  });

  it("keeps detailed scoring semantics and names shared winners", () => {
    const state = {
      ...demoGame,
      phase: "final" as const,
      players: demoGame.players.map((player, index) => ({
        ...player,
        score: index < 2 ? 20 : player.score,
      })),
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

    expect(
      screen.getByRole("heading", { name: "You & Maya share the win." }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Captured").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Round").length).toBeGreaterThan(0);
  });

  it("flies +1 SCOUT to the self seat when the local scoutPoints count increases", () => {
    const { container, rerender } = render(
      <GameScreen state={demoGame} connected dispatch={vi.fn()} />,
    );
    expect(screen.queryByText("+1 SCOUT")).not.toBeInTheDocument();
    rerender(
      <GameScreen
        state={{
          ...demoGame,
          players: demoGame.players.map((player) =>
            player.id === "you"
              ? { ...player, scoutPoints: player.scoutPoints + 1 }
              : player,
          ),
        }}
        connected
        dispatch={vi.fn()}
      />,
    );
    const token = container.querySelector(".scout-token-fly");
    expect(token).toHaveTextContent("+1 SCOUT");
    expect(token).toHaveAttribute("data-owner", "you");
  });

  it("flies +1 SCOUT to the owner seat and captions when you Scout their Show", () => {
    const { container, rerender } = render(
      <GameScreen state={demoGame} connected dispatch={vi.fn()} />,
    );
    rerender(
      <GameScreen
        state={{
          ...demoGame,
          players: demoGame.players.map((player) =>
            player.id === "maya"
              ? { ...player, scoutPoints: player.scoutPoints + 1 }
              : player,
          ),
        }}
        connected
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Maya earns +1 Scout").length).toBeGreaterThan(0);
    const token = container.querySelector(".scout-token-fly");
    expect(token).toHaveTextContent("+1 SCOUT");
    expect(token).toHaveAttribute("data-owner", "maya");
    expect(
      screen.getByRole("article", { name: /Maya, 5 cards left, Show/ }),
    ).toHaveTextContent("18 pts");
  });

  it("does not spawn a Scout token when a two-player chip is spent", () => {
    const twoPlayer = {
      ...demoGame,
      variant: "two-player" as const,
      players: demoGame.players.slice(0, 2).map((player) => ({
        ...player,
        scoutChips: 3,
        scoutPoints: 0,
      })),
    };
    const { container, rerender } = render(
      <GameScreen state={twoPlayer} connected dispatch={vi.fn()} />,
    );
    rerender(
      <GameScreen
        state={{
          ...twoPlayer,
          players: twoPlayer.players.map((player) =>
            player.id === "you" ? { ...player, scoutChips: 2 } : player,
          ),
        }}
        connected
        dispatch={vi.fn()}
      />,
    );
    expect(container.querySelector(".scout-token-fly")).not.toBeInTheDocument();
    expect(screen.queryByText("+1 SCOUT")).not.toBeInTheDocument();
    expect(screen.getByText("You spent a Scout chip.")).toBeInTheDocument();
  });

  it("keeps the +1 SCOUT text when motion is reduced", () => {
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
    const { container, rerender } = render(
      <GameScreen state={demoGame} connected dispatch={vi.fn()} />,
    );
    rerender(
      <GameScreen
        state={{
          ...demoGame,
          players: demoGame.players.map((player) =>
            player.id === "maya"
              ? { ...player, scoutPoints: player.scoutPoints + 1 }
              : player,
          ),
        }}
        connected
        dispatch={vi.fn()}
      />,
    );
    expect(container.querySelector(".scout-token-fly")).toHaveTextContent("+1 SCOUT");
    window.matchMedia = matchMedia;
  });

  it("counts Võsu Scout awards on the Show owner and keeps Scout & Show available", () => {
    const vosu = {
      ...demoGame,
      rulesMode: "vosu" as const,
    };
    const { rerender } = render(
      <GameScreen state={vosu} connected dispatch={vi.fn()} />,
    );
    expect(screen.getByText("Scout gives the Show owner +1 and passes · Scout & Show unlimited")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Scout & Show/ })).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: /Maya, 5 cards left, Show/ }),
    ).toHaveTextContent("17 pts");

    rerender(
      <GameScreen
        state={{
          ...vosu,
          players: vosu.players.map((player) =>
            player.id === "maya"
              ? { ...player, scoutPoints: player.scoutPoints + 1 }
              : player,
          ),
        }}
        connected
        dispatch={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("article", { name: /Maya, 5 cards left, Show/ }),
    ).toHaveTextContent("18 pts");
    expect(screen.getAllByText("Maya earns +1 Scout").length).toBeGreaterThan(0);
  });

  it("offers Scout & Show in two-player Võsu but not in official two-player", () => {
    const twoPlayer = {
      ...demoGame,
      variant: "two-player" as const,
      players: demoGame.players.slice(0, 2).map((player) => ({
        ...player,
        scoutChips: 3,
        scoutPoints: 0,
      })),
    };
    const { rerender } = render(
      <GameScreen
        state={{ ...twoPlayer, rulesMode: "official" }}
        connected
        dispatch={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Scout & Show/ })).not.toBeInTheDocument();

    rerender(
      <GameScreen
        state={{ ...twoPlayer, rulesMode: "vosu" }}
        connected
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Scout & Show/ })).toBeInTheDocument();
  });
});
