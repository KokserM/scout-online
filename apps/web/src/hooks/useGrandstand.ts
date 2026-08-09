import { useCallback, useEffect, useMemo, useState } from "react";
import { SocketProtocol } from "../protocol/adapter";
import { demoGame } from "../protocol/demo";
import type { ClientAction, GameState, Screen, ServerError } from "../protocol/types";

const SESSION_KEY = "grandstand.session";
const NAME_KEY = "grandstand.name";

export function useGrandstand() {
  const protocol = useMemo(() => new SocketProtocol(), []);
  const [screen, setScreen] = useState<Screen>(() =>
    new URLSearchParams(window.location.search).has("room") ? "join" : "home",
  );
  const [state, setState] = useState<GameState>();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<ServerError>();
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || "");
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    const offState = protocol.on("state", (next) => {
      setIsDemo(false);
      setError(undefined);
      setState(next);
      setScreen(next.phase === "lobby" ? "lobby" : "game");
    });
    const offConnection = protocol.on("connection", setConnected);
    const offError = protocol.on("error", (nextError) => {
      setError(nextError);
      if (
        nextError.code === "SESSION_REPLACED" ||
        nextError.code === "SEAT_LOST" ||
        nextError.code === "UNAUTHENTICATED"
      ) {
        localStorage.removeItem(SESSION_KEY);
        setState(undefined);
        setScreen("home");
      }
    });
    protocol.connect(localStorage.getItem(SESSION_KEY) || undefined);
    return () => {
      offState();
      offConnection();
      offError();
      protocol.disconnect();
    };
  }, [protocol]);

  const dispatch = useCallback(
    (action: ClientAction) => {
      if (isDemo) {
        if (action.type === "leave-room") {
          setState(undefined);
          setScreen("home");
          setIsDemo(false);
        }
        return;
      }
      protocol.dispatch(action);
      if (action.type === "leave-room") {
        localStorage.removeItem(SESSION_KEY);
        setState(undefined);
        setScreen("home");
        setIsDemo(false);
      }
      if ("name" in action) {
        localStorage.setItem(NAME_KEY, action.name);
        setName(action.name);
      }
    },
    [isDemo, protocol],
  );

  const enterDemo = useCallback(() => {
    setState(demoGame);
    setScreen("game");
    setError(undefined);
    setIsDemo(true);
  }, []);

  return {
    screen,
    setScreen,
    state,
    setState,
    connected,
    error,
    dismissError: () => setError(undefined),
    name,
    dispatch,
    enterDemo,
    isDemo,
  };
}
