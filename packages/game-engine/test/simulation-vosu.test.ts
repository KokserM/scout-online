import { describe, expect, it } from "vitest";
import { simulate } from "./simulation-helper.js";

describe("Võsu invariant simulations", () => {
  it.each([2, 3, 4, 5] as const)(
    "completes 1,000 deterministic %i-player games",
    (count) => {
      for (let seed = 1; seed <= 1_000; seed += 1) {
        const game = simulate(count, seed * 10_000 + count, "vosu");
        expect(game.status.kind).toBe("ended");
        expect(game.roundNumber).toBe(game.totalRounds);
        if (game.status.kind === "ended") {
          expect(game.status.winners.length).toBeGreaterThan(0);
        }
      }
    },
    30_000,
  );
});
