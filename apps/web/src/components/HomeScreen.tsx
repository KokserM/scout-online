import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { ClientAction, Screen } from "../protocol/types";

interface HomeScreenProps {
  mode: Screen;
  name: string;
  onMode: (screen: Screen) => void;
  onDispatch: (action: ClientAction) => void;
  onDemo: () => void;
}

export function HomeScreen({ mode, name: savedName, onMode, onDispatch, onDemo }: HomeScreenProps) {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(() =>
    (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase(),
  );

  const submitJoin = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && code.length === 5) onDispatch({ type: "join-room", name: name.trim(), roomCode: code });
  };

  if (mode === "join") {
    return (
      <main className="entry-shell">
        <button className="text-button back-link" onClick={() => onMode("home")}>← Back to entrance</button>
        <motion.form className="entry-card" onSubmit={submitJoin} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <p className="eyebrow">YOUR SEAT IS WAITING</p>
          <h1>Join the table.</h1>
          <label>Display name<input autoFocus maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" /></label>
          <label>Room code<input className="code-input" maxLength={5} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ""))} placeholder="F7K2M" /></label>
          <button className="button button--primary" disabled={!name.trim() || code.length !== 5}>Take my seat <ArrowRight /></button>
        </motion.form>
      </main>
    );
  }

  const quickPlay = () => name.trim() && onDispatch({ type: "quick-play", name: name.trim() });
  const create = () => name.trim() && onDispatch({ type: "create-room", name: name.trim() });

  return (
    <main className="landing">
      <section className="hero">
        <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>THE SHARPEST TABLE IN TOWN</motion.p>
        <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          Read the room.<br /><em>Rule the hand.</em>
        </motion.h1>
        <p className="hero-copy"><b>Build sets and runs without rearranging your hand.</b> A quick card contest about timing, nerve, and making the hand you were dealt work beautifully.</p>
        <div className="name-field">
          <label htmlFor="player-name">Your display name</label>
          <input id="player-name" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter a name" />
        </div>
        <div className="hero-actions">
          <button className="button button--primary" disabled={!name.trim()} onClick={quickPlay}><Sparkles /> Quick play</button>
          <button className="button button--secondary" disabled={!name.trim()} onClick={create}><Users /> Create room</button>
          <button className="text-button" onClick={() => onMode("join")}>Join with a code <ArrowRight /></button>
        </div>
        <button className="demo-link" onClick={onDemo}>Preview a table <span>· read-only demo</span></button>
      </section>
      <aside className="hero-art" aria-hidden="true">
        <div className="hero-disc"><span>G</span><small>PLAY BOLDLY</small></div>
        <div className="art-card art-card--one">7</div>
        <div className="art-card art-card--two">4</div>
        <div className="art-card art-card--three">9</div>
      </aside>
    </main>
  );
}
