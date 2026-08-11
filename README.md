# GRANDSTAND

A polished, server-authoritative browser adaptation of the tabletop card game SCOUT,
presented with an original theatrical visual identity and procedural card artwork.

GRANDSTAND supports 2–5 players, mixed human/bot rooms, reconnecting sessions, the
official dedicated two-player variant, mobile and desktop play, and complete multi-round
scoring. It does not use or reproduce Oink Games artwork, logos, fonts, or trade dress.

New rooms default to **Official** rules. A host may instead select **Võsu** in the
lobby: every Show chooses either the active values or the opposite values uniformly,
Scout & Show is repeatable in 3–5 player rounds, and two-player Scout & Show is enabled
at a cost of one Scout chip. Võsu is a house-rule variant, not an official SCOUT ruleset
or an Oink Games product.

## Requirements

- Node.js 22 or newer
- pnpm 10

On Windows PowerShell:

```powershell
corepack enable
pnpm install
pnpm dev
```

If the bundled Corepack is unavailable or outdated:

```powershell
npx pnpm@10.15.0 install
npx pnpm@10.15.0 dev
```

Open `http://localhost:5173`. The API and Socket.IO server listen on port `3001`.
To play from another device, bind through the Vite host (enabled by default), use the
computer's LAN address, and allow the ports through the local firewall.

## Commands

```powershell
pnpm dev              # watch engine, server, and web app
pnpm test             # unit and integration tests
pnpm test:simulation  # bot/invariant stress suite
pnpm test:e2e         # Playwright browser tests
pnpm typecheck        # strict TypeScript checks
pnpm build            # production builds
```

Install Playwright browsers once before the E2E suite:

```powershell
pnpm exec playwright install chromium
```

## Workspace

- `packages/game-engine` — transport-independent pure rules and bots
- `packages/shared` — runtime-validated realtime protocol
- `apps/server` — authoritative Socket.IO room service
- `apps/web` — React/Vite game client
- `docs` — rules model, architecture, protocol, and testing details

The server owns deck order, card orientation, hand order, turns, legality, bots, and
scoring. Browsers submit intents and receive a recipient-specific projection. No
projection contains another player's hidden cards.

## Rules and fairness

The full implemented interpretation is in [docs/RULES.md](docs/RULES.md). In normal
3–5 player games, the number of rounds equals the player count. Two-player games use the
official two-packet deal, Scout chips, repeat-turn scouting, and two-round scoring.
Official is the room default. The optional, non-official Võsu mode changes only Show
value selection and Scout & Show availability/cost; setup, strength comparison, round
ending, and scoring formulas remain the same.

Production shuffling uses unbiased Fisher–Yates with a Web Crypto
`getRandomValues` source and rejection sampling. Initial-seat selection uses Node
`crypto.randomInt`. A seeded RNG is injectable only from in-process tests.

## Bots

Easy bots choose weighted legal actions and occasionally Scout conservatively. Standard
bots evaluate legal Shows, hand reduction, adjacency opportunities, Scout insertions,
and the value of Scout & Show. Bots receive public information plus only their own hand,
and all bot intents pass through the same validator as human actions.

Quick Play creates a local online room with one human and enough bots to begin
immediately.

## Reconnecting

The server issues an opaque reconnect token per human seat. The browser stores it
locally; a replacement socket restores the same seat and private hand. Other players see
connection status but never hidden state. Rooms are in memory for v1 behind a repository
interface, so restarting the server clears active rooms.

## Production

```powershell
pnpm build
$env:NODE_ENV = "production"
pnpm --filter @grandstand/server start
```

The production server serves `apps/web/dist`, the SPA fallback, `/health`, and
Socket.IO from one process. For the supported Railway deployment, connect this repository
as one GitHub service, set `NODE_ENV=production`, deploy with the checked-in
`railway.toml`, and generate a public domain. Railway supplies `PORT`; do not set it
manually. Same-origin deployments do not need `CORS_ORIGINS` or `VITE_SOCKET_URL`.

See [Railway deployment](docs/DEPLOYMENT.md) for the exact dashboard steps, configuration
details, verification checks, QR invites, scaling limits, and troubleshooting.

## Documentation

- [Rules model](docs/RULES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Protocol](docs/PROTOCOL.md)
- [Testing](docs/TESTING.md)
- [Railway deployment](docs/DEPLOYMENT.md)

## Known limitations

- Rooms are intentionally in-memory; a server restart ends active games.
- The included server is single-process; it has no shared Socket.IO adapter or durable
  room store for horizontal scaling.
- v1 has display-name sessions rather than user accounts or cross-device persistence.
- Audio is not included in v1; all gameplay feedback is visual and accessible without it.
- Automated browser coverage runs Chromium at desktop/mobile profiles. It does not claim
  cross-browser certification, production load tolerance, or a security audit.
