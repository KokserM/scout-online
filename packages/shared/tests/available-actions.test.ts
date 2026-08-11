import { describe, expect, it } from "vitest";
import { availableActionsSchema } from "../src/index.js";

describe("available action protocol", () => {
  it("preserves separate authoritative value-mode hints for one selection", () => {
    const baseRange = {
      cardIds: ["mine-1"],
      kind: "single" as const,
      legal: true,
    };
    const payload = {
      show: {
        enabled: true,
        ranges: [
          { ...baseRange, valueMode: "active" },
          { ...baseRange, valueMode: "opposite" },
        ],
      },
      scout: {
        enabled: false,
        disabledReason: "no-active-show",
        endpoints: [],
        insertionCount: 0,
        flipped: [],
      },
      scoutAndShow: {
        enabled: false,
        disabledReason: "no-active-show",
        options: [],
      },
    };

    const parsed = availableActionsSchema.parse(payload);
    expect(parsed.show.ranges.map((range) => range.valueMode)).toEqual([
      "active",
      "opposite",
    ]);
    expect(
      availableActionsSchema.safeParse({
        ...payload,
        show: {
          ...payload.show,
          ranges: [{ ...baseRange, valueMode: "mixed" }],
        },
      }).success,
    ).toBe(false);
  });

  it("accepts compact action availability and rejects unknown fields", () => {
    const payload = {
      show: {
        enabled: true,
        ranges: [
          {
            cardIds: ["mine-1", "mine-2"],
            kind: "run",
            valueMode: "opposite",
            legal: true,
          },
        ],
      },
      scout: {
        enabled: true,
        playId: "show_1",
        endpoints: ["start", "end"],
        insertionCount: 3,
        flipped: [false, true],
      },
      scoutAndShow: {
        enabled: false,
        disabledReason: "already-used",
        playId: "show_1",
        options: [],
      },
    };
    expect(availableActionsSchema.parse(payload)).toEqual(payload);
    expect(
      availableActionsSchema.safeParse({
        ...payload,
        opponentHand: ["secret"],
      }).success,
    ).toBe(false);
  });

  it("bounds projected ranges and combined choices", () => {
    const oversized = {
      show: {
        enabled: true,
        ranges: Array.from({ length: 183 }, () => ({
          cardIds: ["mine"],
          kind: "single",
          valueMode: "active",
          legal: true,
        })),
      },
      scout: {
        enabled: false,
        disabledReason: "no-active-show",
        endpoints: [],
        insertionCount: 0,
        flipped: [],
      },
      scoutAndShow: {
        enabled: false,
        disabledReason: "no-active-show",
        options: [],
      },
    };
    expect(availableActionsSchema.safeParse(oversized).success).toBe(false);
  });
});
