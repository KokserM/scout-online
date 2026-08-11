import {
  Bot,
  Check,
  Copy,
  Crown,
  Download,
  LogOut,
  Plus,
  Share2,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useRef, useState } from "react";
import type { ClientAction, GameState } from "../protocol/types";
import { AccessibleDialog } from "./AccessibleDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { RulesModeBadge, rulesModeName } from "./RulesModeBadge";

interface LobbyScreenProps {
  state: GameState;
  connected: boolean;
  dispatch: (action: ClientAction) => void;
}

export function getInviteUrl(roomCode: string, location = window.location) {
  const invite = new URL("/", location.origin);
  invite.searchParams.set("room", roomCode);
  return invite.toString();
}

export function LobbyScreen({ state, connected, dispatch }: LobbyScreenProps) {
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const qrRef = useRef<SVGSVGElement>(null);
  const self = state.players.find((player) => player.id === state.selfId);
  const humans = state.players.filter((player) => !player.isBot);
  const readyHumans = humans.filter((player) => player.ready).length;
  const startBlocker =
    state.players.length < 2
      ? "Add or invite at least one player."
      : readyHumans < humans.length
        ? `${humans.length - readyHumans} player${humans.length - readyHumans === 1 ? "" : "s"} still need${humans.length - readyHumans === 1 ? "s" : ""} to mark ready.`
        : undefined;
  const inviteUrl = getInviteUrl(state.roomCode);
  const copyInvite = async () => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      const input = document.createElement("textarea");
      input.value = inviteUrl;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const shareInvite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join my Grandstand table",
          text: `Room ${state.roomCode}`,
          url: inviteUrl,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }
    await copyInvite();
  };
  const downloadQr = () => {
    if (!qrRef.current) return;
    const source = new XMLSerializer().serializeToString(qrRef.current);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `grandstand-${state.roomCode}.svg`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  };

  return (
    <main className="lobby-shell">
      <section className="lobby-intro">
        <p className="eyebrow">PRIVATE TABLE</p>
        <h1>Gather your players.</h1>
        <p>Share this invite. Everyone marks ready before the host starts.</p>
        <button
          className="room-code"
          onClick={copyInvite}
          aria-label="Copy invite link"
        >
          {state.roomCode.split("").map((letter, index) => (
            <span key={`${letter}-${index}`}>{letter}</span>
          ))}
          {copied ? <Check /> : <Copy />}
        </button>
        <button
          className="button button--secondary invite-button"
          onClick={() => setInviteOpen(true)}
        >
          <Share2 /> Invite players
        </button>
        <span className="copy-status" aria-live="polite">
          {copied ? "Invite link copied" : ""}
        </span>
      </section>
      <section className="lobby-card">
        {self?.isHost ? (
          <fieldset className="rules-mode-picker">
            <legend>Rules mode</legend>
            <div className="segmented-picker">
              {(["official", "vosu"] as const).map((rulesMode) => (
                <label key={rulesMode}>
                  <input
                    type="radio"
                    name="rules-mode"
                    value={rulesMode}
                    checked={state.rulesMode === rulesMode}
                    onChange={() =>
                      dispatch({ type: "set-rules-mode", rulesMode })
                    }
                  />
                  <span>{rulesModeName(rulesMode)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="guest-mode">
            <span>Playing mode</span>
            <RulesModeBadge mode={state.rulesMode} />
            <small>Only the host can change this before the match.</small>
          </div>
        )}
        <div className="mode-comparison">
          <p>
            <strong>Official:</strong> active values only; Scout &amp; Show once
            per round.
          </p>
          <p>
            <strong>Võsu:</strong> choose ACTIVE or OPPOSITE for the whole Show;
            Scout &amp; Show is unlimited in 3–5 player games.
          </p>
          <p>
            In 2-player games, Scout and Scout &amp; Show both spend a Scout
            chip.
          </p>
        </div>
        <div className="section-heading">
          <h2>At the table</h2>
          <span>{state.players.length}/5</span>
        </div>
        <ul className="player-list">
          {state.players.map((player) => (
            <li key={player.id}>
              <span className="avatar">
                {player.name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <b>{player.name}</b>
                <small>
                  {player.isBot
                    ? `${player.botDifficulty === "easy" ? "Easy" : "Standard"} bot`
                    : player.ready
                      ? "Ready"
                      : "Choosing…"}
                </small>
              </span>
              {player.isHost && <Crown aria-label="Host" />}
              {player.isBot && <Bot aria-label="Bot" />}
              {player.connected ? (
                <Wifi className="status-online" />
              ) : (
                <WifiOff />
              )}
              {self?.isHost && player.isBot && (
                <button
                  className="icon-button"
                  aria-label={`Remove ${player.name}`}
                  onClick={() =>
                    dispatch({ type: "remove-bot", playerId: player.id })
                  }
                >
                  <Trash2 />
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          className={`button button--full ${self?.ready ? "button--secondary" : "button--primary"}`}
          onClick={() => dispatch({ type: "set-ready", ready: !self?.ready })}
        >
          {self?.ready ? (
            <>
              <Check /> Ready
            </>
          ) : (
            "I’m ready"
          )}
        </button>
        <p className="readiness-summary" role="status">
          {readyHumans} of {humans.length} human players ready.
        </p>
        {self?.isHost ? (
          <>
            <div className="bot-actions">
              <button
                className="button button--secondary"
                disabled={state.players.length >= 5}
                onClick={() =>
                  dispatch({ type: "add-bot", difficulty: "easy" })
                }
              >
                <Plus /> Easy bot
              </button>
              <button
                className="button button--secondary"
                disabled={state.players.length >= 5}
                onClick={() =>
                  dispatch({ type: "add-bot", difficulty: "standard" })
                }
              >
                <Plus /> Standard bot
              </button>
            </div>
            <button
              className="button button--primary button--full"
              disabled={!state.canStart}
              onClick={() => dispatch({ type: "start-game" })}
            >
              Start {rulesModeName(state.rulesMode)} match
            </button>
            {!state.canStart && (
              <p className="start-clarity">
                {startBlocker ?? "The match is not ready to start yet."}
              </p>
            )}
          </>
        ) : (
          <p className="waiting-copy">
            {state.canStart
              ? `Everyone is ready. Waiting for the host to start ${rulesModeName(state.rulesMode)}…`
              : "Mark ready, then wait for the other players and host."}
          </p>
        )}
        {state.activity.at(-1) && (
          <p className="lobby-activity" aria-live="polite">
            Latest: {state.activity.at(-1)?.message}
          </p>
        )}
        <button
          className="text-button leave-button"
          onClick={() => setLeaveOpen(true)}
        >
          <LogOut /> Leave table
        </button>
      </section>
      {inviteOpen && (
        <AccessibleDialog
          className="invite-dialog"
          labelledBy="invite-title"
          onClose={() => setInviteOpen(false)}
          closeOnBackdrop
        >
          <button
            className="icon-button modal-close"
            aria-label="Close invite"
            onClick={() => setInviteOpen(false)}
          >
            <X />
          </button>
          <p className="eyebrow">SCAN TO JOIN</p>
          <h2 id="invite-title">Invite players</h2>
          <p>
            Scan this room-only code with a phone camera or share the link
            below. Players will join this room in{" "}
            <strong>{rulesModeName(state.rulesMode)}</strong> mode.
          </p>
          <div className="invite-qr">
            <QRCodeSVG
              ref={qrRef}
              value={inviteUrl}
              size={256}
              level="M"
              marginSize={4}
              bgColor="#ffffff"
              fgColor="#10201c"
              title={`Join Grandstand room ${state.roomCode}`}
              data-testid="invite-qr"
              data-invite-url={inviteUrl}
            />
          </div>
          <p className="invite-code">
            Room <strong>{state.roomCode}</strong> ·{" "}
            <RulesModeBadge mode={state.rulesMode} />
          </p>
          <a className="invite-url" href={inviteUrl}>
            {inviteUrl}
          </a>
          <div className="invite-actions">
            <button className="button button--primary" onClick={copyInvite}>
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
            </button>
            <button className="button button--secondary" onClick={shareInvite}>
              <Share2 /> Share
            </button>
            <button className="button button--secondary" onClick={downloadQr}>
              <Download /> Download SVG
            </button>
          </div>
        </AccessibleDialog>
      )}
      <ConfirmDialog
        open={leaveOpen}
        title="Leave this lobby?"
        description={
          self?.isHost
            ? "You are the host. Another connected player will become host if you leave."
            : "You can rejoin later with the room invite if a seat is still available."
        }
        confirmLabel="Leave lobby"
        onCancel={() => setLeaveOpen(false)}
        onConfirm={() => dispatch({ type: "leave-room" })}
      />
    </main>
  );
}
