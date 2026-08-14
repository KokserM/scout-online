import { useEffect, useRef, useState } from "react";
import type { Card, GameState } from "../protocol/types";

const AWARD_MS = 1200;
const ARRIVE_MS = 700;

export interface ShowDealMotion {
  playId: string;
  actorId: string;
  cardIds: readonly string[];
}

export interface ScoutPeelMotion {
  removedCardId: string;
  scoutId: string;
  fromEnd: "start" | "end";
  card: Card;
}

export interface ScoutAwardMotion {
  ownerId: string;
}

export interface TableMotion {
  showDeal?: ShowDealMotion;
  scoutPeel?: ScoutPeelMotion;
  scoutAward?: ScoutAwardMotion;
  caption?: string;
  chipToast?: string;
  pulseKey: number;
  pulsingPlayerId?: string;
}

const idle: TableMotion = { pulseKey: 0 };

function currentPlay(state: GameState) {
  return state.table.at(-1);
}

export function useTableMotion(state: GameState): TableMotion {
  const previousRef = useRef<GameState | undefined>(undefined);
  const [motion, setMotion] = useState<TableMotion>(idle);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = state;
    if (!previous) return;
    if (previous.round !== state.round || state.phase !== "playing") {
      setMotion((current) =>
        current.showDeal ||
        current.scoutPeel ||
        current.scoutAward ||
        current.caption ||
        current.chipToast
          ? { ...idle, pulseKey: current.pulseKey }
          : current,
      );
      return;
    }

    const beforePlay = currentPlay(previous);
    const afterPlay = currentPlay(state);
    const showDeal =
      afterPlay && afterPlay.id !== beforePlay?.id
        ? {
            playId: afterPlay.id,
            actorId: afterPlay.playerId,
            cardIds: afterPlay.cards.map((card) => card.id),
          }
        : undefined;
    const scoutPeel = (() => {
      const removed =
        beforePlay &&
        afterPlay &&
        beforePlay.id === afterPlay.id &&
        afterPlay.cards.length < beforePlay.cards.length
          ? beforePlay.cards.find(
              (card) => !afterPlay.cards.some((entry) => entry.id === card.id),
            )
          : beforePlay && !afterPlay && beforePlay.cards.length === 1
            ? beforePlay.cards[0]
            : undefined;
      if (!beforePlay || !removed) return undefined;
      return {
        removedCardId: removed.id,
        scoutId: previous.activePlayerId ?? state.selfId,
        fromEnd: beforePlay.cards[0]?.id === removed.id ? "start" : "end",
        card: removed,
      } satisfies ScoutPeelMotion;
    })();

    if (state.variant === "two-player") {
      const spender = state.players.find((player) => {
        const chips =
          previous.players.find((entry) => entry.id === player.id)?.scoutChips ??
          0;
        return player.scoutChips < chips;
      });
      if (!spender && !showDeal && !scoutPeel) return;
      setMotion((current) => ({
        ...idle,
        ...(showDeal ? { showDeal } : {}),
        ...(scoutPeel ? { scoutPeel } : {}),
        ...(spender
          ? { chipToast: `${spender.name} spent a Scout chip.` }
          : {}),
        pulseKey: current.pulseKey + 1,
      }));
      const timer = window.setTimeout(
        () => setMotion((current) => ({ ...idle, pulseKey: current.pulseKey })),
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
    const owner = gained[0];
    const youScouted =
      !!owner &&
      owner.id !== state.selfId &&
      previous.activePlayerId === state.selfId;
    if (!showDeal && !scoutPeel && !owner) return;

    setMotion((current) => ({
      ...idle,
      ...(showDeal ? { showDeal } : {}),
      ...(scoutPeel ? { scoutPeel } : {}),
      ...(owner ? { scoutAward: { ownerId: owner.id } } : {}),
      ...(youScouted ? { caption: `${owner.name} earns +1 Scout` } : {}),
      pulseKey: current.pulseKey + 1,
    }));

    const arrive = owner
      ? window.setTimeout(() => {
          setMotion((current) =>
            current.scoutAward?.ownerId === owner.id
              ? { ...current, pulsingPlayerId: owner.id }
              : current,
          );
        }, ARRIVE_MS)
      : undefined;
    const timer = window.setTimeout(
      () => setMotion((current) => ({ ...idle, pulseKey: current.pulseKey })),
      AWARD_MS,
    );
    return () => {
      if (arrive !== undefined) window.clearTimeout(arrive);
      window.clearTimeout(timer);
    };
  }, [state]);

  return motion;
}
