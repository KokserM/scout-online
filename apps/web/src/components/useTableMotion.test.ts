import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoGame } from "../protocol/demo";
import { useTableMotion } from "./useTableMotion";

afterEach(() => {
  vi.useRealTimers();
});

describe("useTableMotion", () => {
  it("detects a new Show deal from a play id change", () => {
    const { result, rerender } = renderHook(
      ({ state }) => useTableMotion(state),
      { initialProps: { state: demoGame } },
    );
    const nextPlay = {
      id: "p2",
      playerId: "you",
      valueMode: "active" as const,
      cards: [{ id: "n1", top: 9, bottom: 2, suit: "coral" as const }],
    };
    rerender({
      state: { ...demoGame, table: [...demoGame.table, nextPlay] },
    });
    expect(result.current.showDeal).toEqual({
      playId: "p2",
      actorId: "you",
      cardIds: ["n1"],
    });
  });

  it("detects a scout peel and later pulses the awarded owner", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ state }) => useTableMotion(state),
      { initialProps: { state: demoGame } },
    );
    const play = demoGame.table[0]!;
    rerender({
      state: {
        ...demoGame,
        table: [{ ...play, cards: play.cards.slice(1) }],
        players: demoGame.players.map((player) =>
          player.id === "maya"
            ? { ...player, scoutPoints: player.scoutPoints + 1 }
            : player,
        ),
      },
    });
    expect(result.current.scoutPeel).toMatchObject({
      removedCardId: "t1",
      scoutId: "you",
      fromEnd: "start",
    });
    expect(result.current.scoutAward).toEqual({ ownerId: "maya" });
    expect(result.current.caption).toBe("Maya earns +1 Scout");
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(result.current.pulsingPlayerId).toBe("maya");
  });

  it("does not award a Scout token when a two-player chip is spent", () => {
    const twoPlayer = {
      ...demoGame,
      variant: "two-player" as const,
      players: demoGame.players.slice(0, 2).map((player) => ({
        ...player,
        scoutChips: 3,
        scoutPoints: 0,
      })),
    };
    const { result, rerender } = renderHook(
      ({ state }) => useTableMotion(state),
      { initialProps: { state: twoPlayer } },
    );
    rerender({
      state: {
        ...twoPlayer,
        players: twoPlayer.players.map((player) =>
          player.id === "you" ? { ...player, scoutChips: 2 } : player,
        ),
      },
    });
    expect(result.current.scoutAward).toBeUndefined();
    expect(result.current.chipToast).toBe("You spent a Scout chip.");
  });

  it("does not fire awards across a round change", () => {
    const { result, rerender } = renderHook(
      ({ state }) => useTableMotion(state),
      { initialProps: { state: demoGame } },
    );
    rerender({
      state: {
        ...demoGame,
        round: demoGame.round + 1,
        players: demoGame.players.map((player) =>
          player.id === "maya"
            ? { ...player, scoutPoints: player.scoutPoints + 1 }
            : player,
        ),
      },
    });
    expect(result.current.scoutAward).toBeUndefined();
    expect(result.current.showDeal).toBeUndefined();
  });
});
