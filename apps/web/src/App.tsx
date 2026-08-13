import { CircleHelp } from "lucide-react";
import { MotionConfig } from "framer-motion";
import { useState } from "react";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { GameScreen } from "./components/GameScreen";
import { HomeScreen } from "./components/HomeScreen";
import { LobbyScreen } from "./components/LobbyScreen";
import { RulesModal } from "./components/RulesModal";
import { useGrandstand } from "./hooks/useGrandstand";

export default function App() {
  const game = useGrandstand();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [homeConfirmOpen, setHomeConfirmOpen] = useState(false);
  const inRoom = !!game.state && game.screen !== "home" && game.screen !== "join";
  const errorTitle = game.error?.code.toLowerCase().includes("session")
    ? "This session was replaced."
    : game.error?.code.toLowerCase().includes("room")
      ? "Couldn’t open that room."
      : "Couldn’t make that move.";

  return (
    <MotionConfig reducedMotion="user">
    <div className="app">
      <header className="site-header">
        <button className="brand" onClick={() => inRoom ? setHomeConfirmOpen(true) : game.setScreen("home")} aria-label="Grandstand home">
          <span className="brand-mark">G</span>
          <span>GRANDSTAND</span>
        </button>
        <nav aria-label="Game options">
          <button className="header-action" aria-label="How to play" onClick={() => setRulesOpen(true)}><CircleHelp /> <span>How to play</span></button>
        </nav>
      </header>

      {game.error && (
        <div className="error-toast" role="alert">
          <span><b>{errorTitle}</b> {game.error.message}</span>
          <button onClick={game.dismissError}>Dismiss</button>
        </div>
      )}
      {!game.connected && game.screen === "lobby" && game.state && (
        <ConnectionBanner graceMs={game.state.reconnectGraceMs} variant="lobby" />
      )}

      {(game.screen === "home" || game.screen === "join") && (
        <HomeScreen mode={game.screen} name={game.name} onMode={game.setScreen} onDispatch={game.dispatch} onDemo={game.enterDemo} />
      )}
      {game.screen === "lobby" && game.state && <LobbyScreen state={game.state} connected={game.connected} dispatch={game.dispatch} />}
      {game.screen === "game" && game.state && <GameScreen state={game.state} connected={game.connected} dispatch={game.dispatch} readOnly={game.isDemo} />}

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <ConfirmDialog open={homeConfirmOpen} title="Leave the table?" description="Going home will leave your current room and may give up your seat." confirmLabel="Leave and go home" onCancel={() => setHomeConfirmOpen(false)} onConfirm={() => { setHomeConfirmOpen(false); game.dispatch({ type: "leave-room" }); }} />
    </div>
    </MotionConfig>
  );
}
