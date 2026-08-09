import { createServerApp } from "./app.js";
import { loadGameEngine } from "./game-engine-adapter.js";

const port = parsePort(process.env.PORT);
const host = process.env.HOST?.trim() || "0.0.0.0";
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const engine = await loadGameEngine();
const server = createServerApp({
  engine,
  ...(process.env.NODE_ENV === undefined ? {} : { nodeEnv: process.env.NODE_ENV }),
  allowedOrigins,
  allowDevLanOrigins: process.env.DEV_LAN_ORIGINS === "true",
});

server.httpServer.listen(port, host, () => {
  console.log(`Grandstand server listening on http://${host}:${port}`);
});

let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully`);
  const forcedExit = setTimeout(() => {
    console.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forcedExit.unref();
  void server
    .close()
    .then(() => {
      clearTimeout(forcedExit);
      process.exitCode = 0;
    })
    .catch((error: unknown) => {
      clearTimeout(forcedExit);
      console.error("Graceful shutdown failed", error);
      process.exitCode = 1;
    });
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

function parsePort(value: string | undefined): number {
  if (!value) return 3001;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return parsed;
}
