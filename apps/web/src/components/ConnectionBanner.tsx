import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function remainingReconnectMs(graceMs: number, disconnectedAt: number, now: number) {
  return Math.max(0, graceMs - (now - disconnectedAt));
}

export function ConnectionBanner({
  graceMs,
  variant,
}: {
  graceMs: number;
  variant: "game" | "lobby";
}) {
  const [remainingMs, setRemainingMs] = useState(graceMs);

  useEffect(() => {
    const disconnectedAt = Date.now();
    const tick = () =>
      setRemainingMs(remainingReconnectMs(graceMs, disconnectedAt, Date.now()));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [graceMs]);

  const reservedSeconds = Math.ceil(remainingMs / 1000);
  const reservedLabel =
    reservedSeconds === 1 ? "1 second" : `${reservedSeconds} seconds`;
  const message =
    remainingMs > 0
      ? variant === "lobby"
        ? `Connection lost. Reconnecting to your lobby… your seat is reserved for ${reservedLabel}.`
        : `Connection lost. Reconnecting… your seat is reserved for ${reservedLabel}.`
      : "Connection lost. Still trying… the table may continue without you";

  return (
    <div className="connection-banner" role="status" aria-live="assertive">
      <WifiOff /> {message}
    </div>
  );
}
