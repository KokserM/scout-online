import { describe, expect, it } from "vitest";
import {
  clientActionSchema,
  roomCodeSchema,
  rulesModeSchema,
  sessionTokenSchema,
} from "../src/index.js";

describe("shared protocol validation", () => {
  it("normalizes room codes and excludes ambiguous characters", () => {
    expect(roomCodeSchema.parse(" abcd2 ")).toBe("ABCD2");
    expect(roomCodeSchema.safeParse("ABCI2").success).toBe(false);
    expect(roomCodeSchema.safeParse("ABCO2").success).toBe(false);
  });

  it("rejects short or punctuated session tokens", () => {
    expect(sessionTokenSchema.safeParse("short").success).toBe(false);
    expect(sessionTokenSchema.safeParse("a".repeat(32)).success).toBe(true);
    expect(sessionTokenSchema.safeParse(`${"a".repeat(31)}!`).success).toBe(
      false,
    );
  });

  it("rejects unknown fields and invalid action identifiers", () => {
    const result = clientActionSchema.safeParse({
      actionId: "not-a-uuid",
      type: "room:create",
      name: "Player",
      admin: true,
    });
    expect(result.success).toBe(false);
  });

  it("strictly validates rules modes and the host update action", () => {
    expect(rulesModeSchema.parse("official")).toBe("official");
    expect(rulesModeSchema.parse("vosu")).toBe("vosu");
    expect(rulesModeSchema.safeParse("custom").success).toBe(false);
    expect(
      clientActionSchema.parse({
        actionId: "57cd4af8-f2de-4bd1-a3e6-1854525e87a0",
        type: "host:set-rules-mode",
        rulesMode: "vosu",
      }),
    ).toEqual({
      actionId: "57cd4af8-f2de-4bd1-a3e6-1854525e87a0",
      type: "host:set-rules-mode",
      rulesMode: "vosu",
    });
  });

  it("requires a bounded Show value mode on wire actions", () => {
    const show = {
      actionId: "57cd4af8-f2de-4bd1-a3e6-1854525e87a0",
      type: "game:show",
      cardIds: ["1-7", "2-7"],
    };
    expect(clientActionSchema.safeParse(show).success).toBe(false);
    expect(
      clientActionSchema.parse({ ...show, valueMode: "opposite" }),
    ).toEqual({ ...show, valueMode: "opposite" });
    expect(
      clientActionSchema.safeParse({ ...show, valueMode: "mixed" }).success,
    ).toBe(false);

    const combined = {
      actionId: "57cd4af8-f2de-4bd1-a3e6-1854525e87a0",
      type: "game:scout-and-show",
      playId: "show_1",
      position: "start",
      cardIds: ["1-7"],
    };
    expect(clientActionSchema.safeParse(combined).success).toBe(false);
    expect(
      clientActionSchema.safeParse({
        ...combined,
        valueMode: "per-card",
      }).success,
    ).toBe(false);
  });

  it("accepts the largest engine hand while bounding Show payloads", () => {
    const cardIds = Array.from({ length: 13 }, (_, index) => `card-${index}`);
    const base = {
      actionId: "57cd4af8-f2de-4bd1-a3e6-1854525e87a0",
      cardIds,
      valueMode: "opposite",
    };
    expect(
      clientActionSchema.safeParse({ ...base, type: "game:show" }).success,
    ).toBe(true);
    expect(
      clientActionSchema.safeParse({
        ...base,
        type: "game:scout-and-show",
        playId: "show_1",
        position: "start",
      }).success,
    ).toBe(true);
    expect(
      clientActionSchema.safeParse({
        ...base,
        type: "game:show",
        cardIds: [...cardIds, "card-13"],
      }).success,
    ).toBe(false);
  });
});
