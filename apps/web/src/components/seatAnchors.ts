export interface Point {
  x: number;
  y: number;
}

function centerOf(root: Element, node: Element): Point {
  const rootRect = root.getBoundingClientRect();
  const rect = node.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - rootRect.left,
    y: rect.top + rect.height / 2 - rootRect.top,
  };
}

function isLaidOut(node: Element): boolean {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

export function readAnchor(
  root: Element | null,
  selector: string,
  fallback: Point,
): Point {
  if (!root) return fallback;
  const node = root.querySelector(selector);
  if (!node || !isLaidOut(node)) return fallback;
  return centerOf(root, node);
}

export function readSeat(
  root: Element | null,
  playerId: string,
  selfId: string,
): Point {
  const table = readAnchor(root, "[data-table-play], [data-table-felt]", {
    x: 200,
    y: 220,
  });
  const fallback =
    playerId === selfId
      ? { x: table.x, y: table.y + 160 }
      : { x: table.x, y: table.y - 140 };
  if (!root) return fallback;
  const nodes = [...root.querySelectorAll(`[data-seat="${playerId}"]`)];
  const laidOut = nodes.find(isLaidOut);
  return laidOut ? centerOf(root, laidOut) : fallback;
}

export function readTableAnchor(
  root: Element | null,
  end?: "start" | "end",
): Point {
  const felt = readAnchor(root, "[data-table-felt]", { x: 200, y: 220 });
  if (end === "start") {
    return readAnchor(root, "[data-table-end='start']", felt);
  }
  if (end === "end") {
    return readAnchor(root, "[data-table-end='end']", felt);
  }
  return readAnchor(root, "[data-table-play]", felt);
}

export function seatOffsetFromTable(
  root: Element | null,
  actorId: string,
  selfId: string,
): Point {
  const table = readTableAnchor(root);
  const seat = readSeat(root, actorId, selfId);
  return { x: seat.x - table.x, y: seat.y - table.y };
}
