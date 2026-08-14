import { afterEach, describe, expect, it, vi } from "vitest";
import { readSeat, readTableAnchor, seatOffsetFromTable } from "./seatAnchors";

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return this;
    },
  };
}

function mockBox(node: Element, box: DOMRect) {
  vi.spyOn(node, "getBoundingClientRect").mockReturnValue(box);
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("seatAnchors", () => {
  it("reads laid-out seat and table centers relative to the shell", () => {
    const shell = document.createElement("div");
    const table = document.createElement("div");
    table.setAttribute("data-table-play", "");
    const seat = document.createElement("article");
    seat.setAttribute("data-seat", "maya");
    shell.append(table, seat);
    document.body.append(shell);
    mockBox(shell, rect(0, 0, 400, 600));
    mockBox(table, rect(150, 200, 100, 40));
    mockBox(seat, rect(180, 20, 40, 20));

    expect(readTableAnchor(shell)).toEqual({ x: 200, y: 220 });
    expect(readSeat(shell, "maya", "you")).toEqual({ x: 200, y: 30 });
    expect(seatOffsetFromTable(shell, "maya", "you")).toEqual({ x: 0, y: -190 });
  });

  it("skips a hidden self score and uses the laid-out fallback seat", () => {
    const shell = document.createElement("div");
    const hidden = document.createElement("div");
    hidden.className = "table-score";
    hidden.setAttribute("data-seat", "you");
    const visible = document.createElement("span");
    visible.className = "self-seat-anchor";
    visible.setAttribute("data-seat", "you");
    shell.append(hidden, visible);
    document.body.append(shell);
    mockBox(shell, rect(0, 0, 400, 600));
    mockBox(hidden, rect(0, 0, 0, 0));
    mockBox(visible, rect(196, 500, 8, 8));

    expect(readSeat(shell, "you", "you")).toEqual({ x: 200, y: 504 });
  });

  it("falls back when a seat node is missing", () => {
    expect(readSeat(null, "maya", "you")).toEqual({ x: 200, y: 80 });
    expect(readSeat(null, "you", "you")).toEqual({ x: 200, y: 380 });
  });
});
