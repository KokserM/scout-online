# Architecture

GRANDSTAND is a pnpm workspace with three independently testable layers.

## Packages

- `packages/game-engine` — pure, deterministic TypeScript rules. It has no React,
  Socket.IO, Node transport, or DOM dependency. Random setup accepts an RNG interface;
  production supplies a cryptographically secure implementation.
- `packages/shared` — Zod schemas and inferred wire types. This is the trust-boundary
  contract shared by browser and server.
- `apps/server` — authoritative room/session service and Socket.IO transport. It owns
  every full game state and calls the engine for transitions.
- `apps/web` — React/Vite presentation. It renders only the per-player projection sent
  by the server and submits action requests; client hints never authorize a move.

## State flow

```text
browser intent
  -> Zod event validation
  -> session/room/action-id validation
  -> pure engine transition
  -> invariant check
  -> per-recipient projection
  -> Socket.IO room delivery
```

The engine state machine uses explicit lobby/setup/play/result phases. Transport code
does not directly mutate hands, scores, turns, or cards.

Each room starts in Official mode. A lobby-only, host-authorized command may select the
non-official Võsu variant; that value is copied into game and round state, projected to
every recipient, locked after start, and retained through rematch. Show actions carry
one uniform `valueMode`. The engine, rather than the browser hint, classifies every card
in the range under that mode and rejects opposite mode in Official games. This type
shape makes mixed per-card values unrepresentable.

## Information boundaries

The room repository stores authoritative state. Before every broadcast, the server
creates a separate projection for each session. A player's projection contains their
ordered cards and orientations; opponent entries contain only public fields and hand
counts. The full object is never emitted and the browser is not asked to hide secrets.

Bots receive the same kind of view: public state plus their own private hand. Their
chosen intents pass through the same validation and engine transition as human intents.
Standard bots rank legal Shows, captures, Scout insertion adjacency, Scout & Show
follow-ups, and two-player chip cost. Easy bots deliberately retain randomized,
fallible choices. Both policies consume mode-specific legal-action projections, so
Võsu opposite Shows and repeatable combined actions use no hidden authority. Neither
policy accepts authoritative opponent hands or deck order.

## Room lifecycle

Rooms live behind a repository interface and are in memory in v1. A reconnect token
identifies a seat independently from a transient socket. Disconnect marks a seat offline
and starts a grace period; reconnect replaces the old socket and restores only that
seat's projection. This interface can later be implemented with Redis without changing
the protocol or game engine.

An active-game leave immediately retires the human capability and converts the seat to
a Standard bot. A network disconnect only marks the seat offline during the configured
grace period; expiry then performs the same conversion. Bot turns are drained until a
human turn or a result phase. Every bot transition is invariant-checked, must change
state, and is protected by an explicit failure guard rather than a silent turn cap.
Opening the same token in another tab replaces and disconnects the older socket.

The browser keeps a bounded acknowledged outbox. A command receives its UUID once and
retains it across transport retries. The server keeps a substantially larger bounded
room-lifetime replay cache and retired-session leave tombstones.

## Randomness

Production Fisher–Yates draws from `CryptoRandomSource`, which uses Web Crypto
`getRandomValues`; rejection sampling removes modulo bias. In Node 22 this is backed by
the platform CSPRNG. Tests can inject a deterministic seeded generator.
Randomness is used only during setup; action transitions are deterministic.
The initial starting seat is selected server-side with Node `crypto.randomInt`, then
rotates clockwise in subsequent rounds and is included in each projection.

## Network boundary

Production browser origins must be listed in `CORS_ORIGINS`. Development permits
loopback origins; private-LAN origins additionally require `DEV_LAN_ORIGINS=true`.
Per-socket and per-session action windows limit abusive traffic, payloads are capped,
and malformed inbound or outbound protocol objects become explicit errors.

## Development-only inspection

Development exposes `/debug/rooms`, a token-free room summary used for diagnostics.
It does not expose hands, decks, reconnect tokens, or an authoritative-state mutation
endpoint. The route is not registered in production. Deterministic engine injection is
available to in-process tests only, not through the network protocol.

## Deployment limits

The v1 repository is in-memory and intended for one server process. There is no shared
room state, durable recovery, account identity, or horizontal Socket.IO adapter.
The supported Railway layout therefore uses one service with one replica: that process
serves the production SPA, health endpoint, and Socket.IO on the Railway-provided port.
Every redeploy, restart, crash, or container replacement discards active rooms.
Reverse-proxy TLS, process supervision, firewalling, and origin configuration are
deployment responsibilities rather than guarantees supplied by this repository.
See [Railway deployment](DEPLOYMENT.md) for the concrete configuration and checks.

Võsu is an application house-rule variant, not an official SCOUT mode and not an Oink
Games product or endorsement.
