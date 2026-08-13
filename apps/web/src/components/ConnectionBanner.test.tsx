import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionBanner, remainingReconnectMs } from "./ConnectionBanner";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("remainingReconnectMs", () => {
  it("counts down to zero without going negative", () => {
    expect(remainingReconnectMs(90_000, 1_000, 1_000)).toBe(90_000);
    expect(remainingReconnectMs(90_000, 1_000, 31_000)).toBe(60_000);
    expect(remainingReconnectMs(90_000, 1_000, 100_000)).toBe(0);
  });
});

describe("ConnectionBanner", () => {
  it("shows a live grace countdown and then a still-trying warning", () => {
    vi.useFakeTimers();
    render(<ConnectionBanner graceMs={1_000} variant="game" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /Reconnecting… your seat is reserved for 1 second/,
    );
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      /Still trying… the table may continue without you/,
    );
  });
});
