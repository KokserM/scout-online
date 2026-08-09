import { useEffect, useReducer, useRef, type KeyboardEvent, type PointerEvent } from "react";

interface SelectionState {
  start?: number;
  end?: number;
  anchor?: number;
  active: number;
}

type SelectionAction =
  | { type: "toggle"; index: number }
  | { type: "drag"; from: number; to: number }
  | { type: "move"; index: number; extend: boolean }
  | { type: "reset"; length: number };

const initialState = (length: number): SelectionState => ({ active: length ? 0 : -1 });

export function handRangeSelectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  if (action.type === "reset") return initialState(action.length);
  if (action.type === "drag") {
    return {
      start: Math.min(action.from, action.to),
      end: Math.max(action.from, action.to),
      anchor: action.from,
      active: action.to,
    };
  }
  if (action.type === "move") {
    if (!action.extend) return { ...state, active: action.index, anchor: action.index };
    const anchor = state.anchor ?? state.active;
    return {
      start: Math.min(anchor, action.index),
      end: Math.max(anchor, action.index),
      anchor,
      active: action.index,
    };
  }

  const { index } = action;
  if (state.start === undefined || state.end === undefined) {
    return { start: index, end: index, anchor: index, active: index };
  }
  if (index === state.start) {
    if (state.start === state.end) return { active: index, anchor: index };
    return { ...state, start: state.start + 1, active: index, anchor: state.start + 1 };
  }
  if (index === state.end) {
    return { ...state, end: state.end - 1, active: index, anchor: state.end - 1 };
  }
  if (index === state.start - 1) {
    return { ...state, start: index, active: index, anchor: state.end };
  }
  if (index === state.end + 1) {
    return { ...state, end: index, active: index, anchor: state.start };
  }
  return { start: index, end: index, anchor: index, active: index };
}

export function useHandRangeSelection(ids: readonly string[], resetKey: string) {
  const [state, send] = useReducer(handRangeSelectionReducer, ids.length, initialState);
  const drag = useRef<{ pointerId: number; start: number } | undefined>(undefined);
  const suppressClick = useRef(false);
  const previousResetKey = useRef(resetKey);

  useEffect(() => {
    if (previousResetKey.current !== resetKey) {
      previousResetKey.current = resetKey;
      drag.current = undefined;
      send({ type: "reset", length: ids.length });
    }
  }, [ids.length, resetKey]);

  const selectedIds =
    state.start === undefined || state.end === undefined ? [] : ids.slice(state.start, state.end + 1);

  const toggle = (index: number) => send({ type: "toggle", index });
  const getCardProps = (index: number) => ({
    tabIndex: state.active === index ? 0 : -1,
    onClick: () => {
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      toggle(index);
    },
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button > 0) return;
      drag.current = { pointerId: event.pointerId ?? 0, start: index };
      suppressClick.current = true;
      send({ type: "toggle", index });
    },
    onPointerEnter: (event: PointerEvent<HTMLButtonElement>) => {
      if (!drag.current || drag.current.pointerId !== (event.pointerId ?? 0)) return;
      send({ type: "drag", from: drag.current.start, to: index });
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      if (drag.current?.pointerId === (event.pointerId ?? 0)) drag.current = undefined;
    },
    onPointerCancel: () => {
      drag.current = undefined;
      suppressClick.current = false;
    },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        toggle(index);
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const next = Math.max(0, Math.min(ids.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
      send({ type: "move", index: next, extend: event.shiftKey });
      const parent = event.currentTarget.parentElement;
      requestAnimationFrame(() => {
        (parent?.children[next] as HTMLElement | undefined)?.focus();
      });
    },
  });

  return {
    selectedIds,
    isSelected: (id: string) => selectedIds.includes(id),
    getCardProps,
    clear: () => send({ type: "reset", length: ids.length }),
  };
}
