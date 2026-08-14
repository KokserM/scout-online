import { motion, useReducedMotion } from "framer-motion";
import { useLayoutEffect, useState } from "react";
import { readSeat, readTableAnchor, type Point } from "./seatAnchors";

export function FlyingScoutToken({
  ownerId,
  selfId,
  shell,
  fromEnd,
  pulseKey,
}: {
  ownerId: string;
  selfId: string;
  shell: Element | null;
  fromEnd?: "start" | "end";
  pulseKey: number;
}) {
  const reduceMotion = useReducedMotion();
  const [path, setPath] = useState<{ from: Point; to: Point }>();

  useLayoutEffect(() => {
    setPath({
      from: readTableAnchor(shell, fromEnd),
      to: readSeat(shell, ownerId, selfId),
    });
  }, [shell, ownerId, selfId, fromEnd, pulseKey]);

  if (!path) return null;

  return (
    <motion.span
      className="scout-token-fly"
      data-owner={ownerId}
      aria-hidden="true"
      key={pulseKey}
      initial={
        reduceMotion
          ? { x: path.to.x, y: path.to.y, opacity: 1 }
          : { x: path.from.x, y: path.from.y, opacity: 1, scale: 0.86 }
      }
      animate={{ x: path.to.x, y: path.to.y, opacity: 1, scale: 1 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.7, ease: [0.16, 0.84, 0.32, 1] }
      }
    >
      +1 SCOUT
    </motion.span>
  );
}
