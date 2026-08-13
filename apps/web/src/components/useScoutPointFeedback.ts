import { useEffect, useRef, useState } from "react";
import type { GameState } from "../protocol/types";

const AWARD_MS = 1200;

export interface ScoutPointFeedback {
  selfAward: boolean;
  opponentAwardIds: readonly string[];
  caption?: string;
  chipToast?: string;
  pulseKey: number;
}

const idle: ScoutPointFeedback = {
  selfAward: false,
  opponentAwardIds: [],
  pulseKey: 0,
};

export function useScoutPointFeedback(state: GameState): ScoutPointFeedback {
  const previousRef = useRef<GameState | undefined>(undefined);
  const [feedback, setFeedback] = useState<ScoutPointFeedback>(idle);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = state;
    if (!previous) return;
    if (previous.round !== state.round || state.phase !== "playing") {
      setFeedback((current) =>
        current.selfAward ||
        current.opponentAwardIds.length ||
        current.caption ||
        current.chipToast
          ? { ...idle, pulseKey: current.pulseKey }
          : current,
      );
      return;
    }

    if (state.variant === "two-player") {
      const spender = state.players.find((player) => {
        const before =
          previous.players.find((entry) => entry.id === player.id)?.scoutChips ??
          0;
        return player.scoutChips < before;
      });
      if (!spender) return;
      setFeedback((current) => ({
        selfAward: false,
        opponentAwardIds: [],
        chipToast: `${spender.name} spent a Scout chip.`,
        pulseKey: current.pulseKey + 1,
      }));
      const timer = window.setTimeout(
        () => setFeedback((current) => ({ ...idle, pulseKey: current.pulseKey })),
        AWARD_MS,
      );
      return () => window.clearTimeout(timer);
    }

    const gained = state.players.filter((player) => {
      const before =
        previous.players.find((entry) => entry.id === player.id)?.scoutPoints ??
        0;
      return player.scoutPoints > before;
    });
    if (!gained.length) return;

    const selfGained = gained.some((player) => player.id === state.selfId);
    const owners = gained.filter((player) => player.id !== state.selfId);
    const youScouted = previous.activePlayerId === state.selfId && !selfGained;
    setFeedback((current) => ({
      selfAward: selfGained,
      opponentAwardIds: owners.map((player) => player.id),
      ...(youScouted && owners[0]
        ? { caption: `${owners[0].name} earns +1 Scout` }
        : {}),
      pulseKey: current.pulseKey + 1,
    }));
    const timer = window.setTimeout(
      () => setFeedback((current) => ({ ...idle, pulseKey: current.pulseKey })),
      AWARD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state]);

  return feedback;
}
