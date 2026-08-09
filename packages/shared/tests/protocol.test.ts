import { describe, expect, it } from "vitest";
import { clientActionSchema, roomCodeSchema, sessionTokenSchema } from "../src/index.js";

describe("shared protocol validation", () => {
  it("normalizes room codes and excludes ambiguous characters", () => {
    expect(roomCodeSchema.parse(" abcd2 ")).toBe("ABCD2");
    expect(roomCodeSchema.safeParse("ABCI2").success).toBe(false);
    expect(roomCodeSchema.safeParse("ABCO2").success).toBe(false);
  });

  it("rejects short or punctuated session tokens", () => {
    expect(sessionTokenSchema.safeParse("short").success).toBe(false);
    expect(sessionTokenSchema.safeParse("a".repeat(32)).success).toBe(true);
    expect(sessionTokenSchema.safeParse(`${"a".repeat(31)}!`).success).toBe(false);
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
});
