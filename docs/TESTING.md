# Testing

Run the full suite from the repository root:

```powershell
pnpm test
pnpm test:simulation
pnpm typecheck
pnpm build
pnpm test:e2e
```

If pnpm is not installed globally, the equivalent bootstrap command is:

```powershell
npx pnpm@10.15.0 install
```

## Test layers

- Engine unit tests cover deck uniqueness/filtering, Show classification and ranking,
  orientation locking, insertion, Scout, Scout & Show, round ending, scoring, rotation,
  and the dedicated two-player rules. Focused Võsu regressions cover active/opposite
  sets, runs, and singles; uniform-mode construction; Official rejection; repeatable
  combined actions; two-player chip/turn behavior; all-Scouted scoring; bots; public
  views; and invariants.
- Targeted rules-audit regressions exercise the complete Show strength ladder through
  authoritative actions; Scout tracking resets; partial, table-clearing, and
  scouted-card-excluding Scout & Show paths; own-Show Scout rejection; four- and
  five-player all-Scouted endings; mixed and cumulative scoring (including ties);
  explicitly chosen starting-seat rotation; two-player seat swapping and factory
  enforcement; and preservation of a non-flipped orientation choice.
- Invariant simulations run bot games for every supported player count with a generous
  move guard. They check card conservation, legal transitions, valid turns, and eventual
  completion.
- Server tests include service isolation plus real `socket.io-client` connections to a
  loopback HTTP/Socket.IO server backed by the real engine. They exercise Show, Scout,
  Scout & Show, repeated two-player Scout turns/chips, disconnect and reconnect,
  duplicate-session replacement, duplicate action IDs, leave-on-turn bot takeover,
  host transfer, both round transitions, final results, rematch, malformed payloads,
  turn authorization, forged cards/value modes, host-only lobby mode selection,
  post-start locking, Võsu rematch retention, and recipient-specific projections.
- Browser tests cover landing, create/join/ready/start, orientation, Quick Play, a real
  two-browser Show and repeat-turn Scout workflow, plus a three-browser Scout & Show
  regression that verifies right-scrolled range selection at 320×568, 390×844,
  430×932, 667×375, and 1440×900. General responsive checks also cover 375×667,
  768×1024, and 1280×720. They use overflow, scroll-position, geometry, visibility,
  and reachability checks rather than brittle golden screenshots. Real 2- and 3-player
  Võsu rooms run in both desktop and iPhone projects, asserting host/guest lobby state,
  opposite-mode dispatch, and the highlighted public table mode. QR invites and crowded
  mobile hands are exercised across the same acceptance viewport set.
  Deterministic result details and commands are component-tested; complete
  round/final/rematch behavior is verified at the real Socket.IO layer.

Production randomness is intentionally tested at the wrapper boundary rather than by
expecting fixed output. Deterministic rules tests inject a seeded RNG.

For a fast rules-only stress run:

```powershell
pnpm test:simulation
```

## Manual 18-invariant audit

This audit was performed against the rule implementation, protocol projections, and
the automated evidence named below. “Verified” means covered by deterministic tests or
the 8,000-game invariant run; it is not a mathematical proof of every possible game.

1. **Deck identity and filtering — verified.** The 45 unordered pairs are unique, and
   3/4/5-player filtering matches the documented deck sizes (`cards-and-rng.test.ts`).
2. **Fixed hand order and whole-hand orientation — verified.** Accept preserves the
   deal; flip reverses and flips the complete hand (`round.test.ts`,
   `rules-audit.test.ts`).
3. **Show ownership and contiguity — verified.** Only the actor's contiguous card IDs
   can be submitted (`legal-actions.test.ts`, `game-engine-adapter.test.ts`).
4. **Show pattern validity — verified.** Singles, equal-value sets, and ±1 runs are the
   only accepted patterns (`shows.test.ts`, `rules-audit.test.ts`).
5. **Show strength ordering — verified.** Length, then set over run, then rank, with
   strict inequality, is enforced at the action layer (`rules-audit.test.ts`).
6. **Show replacement and captures — verified.** The prior Active Set becomes the
   showing player's captures; the new Show remains on table (`round.test.ts`).
7. **Scout endpoint/orientation/insertion — verified.** Only an Active Set end can be
   taken, either orientation is legal, and each hand gap is represented once
   (`round.test.ts`, `GameScreen.test.tsx`).
8. **Scout privacy — verified.** Opponents do not receive the scouted card ID,
   orientation, or insertion location after it enters a hand
   (`game-engine-adapter.test.ts`, `real-socket.test.ts`).
9. **Standard Scout reward and turn advance — verified.** The Show owner gains one
   Scout point and play advances clockwise (`round.test.ts`).
10. **Scout & Show atomicity — verified.** It is once per round, validates against the
    reduced Show, supports table-clearing and scouted-card-excluding Shows, and resets
    all-Scouted tracking (`rules-audit.test.ts`, `real-socket.test.ts`).
11. **All-Scouted ending — verified.** Every opponent must Scout exactly once against
    the same Show; the owner is penalty-exempt (`rules-audit.test.ts`).
12. **Standard scoring — verified.** Captures plus Scout points minus remaining cards,
    including mixed and tied totals, is checked (`rules-audit.test.ts`).
13. **Round count and starter rotation — verified.** Standard games run one round per
    player from the selected initial seat (`rules-audit.test.ts`, `invariants.ts`).
14. **Two-player reserved packets — verified.** The filtered 44 cards are split once
    into two non-overlapping 22-card rounds and the starting seat swaps
    (`rules-audit.test.ts`, `invariants.ts`).
15. **Two-player chips and repeated turns — verified.** Scout spends one of three
    chips, awards no Scout point, and retains the turn for repeated Scouts
    (`round.test.ts`, `real-socket.test.ts`, `multiplayer.spec.ts`).
16. **Two-player ending and scoring — verified.** Empty hand or no legal action ends
    the round; captures, hand penalty, and unused chips are included
    (`round.test.ts`, `real-socket.test.ts`).
17. **State and card conservation — verified.** Valid actors, variants, Show
    classifications, card zones, totals, and all card IDs are asserted after
    transitions and across 8,000 completed games: 4,000 Official and 4,000 Võsu
    (`invariants.ts`,
    `simulation.test.ts`).
18. **Authority and session lifecycle — verified at loopback integration scope.**
    Out-of-turn/forged actions fail; projections exclude opponent hands and tokens;
    reconnect, session replacement, replay deduplication, leave takeover, host transfer,
    next round, final, and rematch preserve valid state (`app.test.ts`,
    `game-engine-adapter.test.ts`, `real-socket.test.ts`).

## CI and verification scope

`.github/workflows/qa.yml` gates pushes and pull requests on install, workspace
typecheck, all unit/integration tests, the explicit 8,000-game simulation command,
production builds, and Chromium Playwright tests.

The suite does not establish internet-scale reliability, multi-process consistency,
cross-browser parity, accessibility certification, penetration-test status, or
pixel-perfect rendering. Socket tests use a loopback server; rooms remain in memory.

## Last complete local verification

Verified on Windows on 2026-08-11 with Node.js 22.13.1 and pnpm 10.15.0:

```powershell
npx --yes pnpm@10.15.0 typecheck
npx --yes pnpm@10.15.0 test
npx --yes pnpm@10.15.0 test:simulation
npx --yes pnpm@10.15.0 build
npx --yes pnpm@10.15.0 test:e2e
```

- Typecheck: 4 workspace projects passed.
- Unit/integration: 22 files, 135 tests passed. This total includes the two simulation
  tests because the engine's normal test command discovers them.
- Explicit simulation gate: 1 file, 2 tests passed; the stress case completed exactly
  8,000 games (1,000 seeds for both Official and Võsu at each of 2, 3, 4, and 5
  players).
- Build: 4 workspace projects passed; Vite transformed 2,122 modules and emitted the
  production HTML, CSS, and JavaScript assets.
- Playwright: 22 project/test combinations discovered, 16 passed, and 6 were
  intentionally skipped by project guards. The responsive and Scout & Show regressions
  execute their acceptance viewport matrices inside desktop-project cases; the mobile
  project uses Chromium with iPhone touch and viewport emulation. The successful full
  run used four workers to avoid overloading the shared local development servers.

A local production start with `NODE_ENV=production` and `PORT=4179` also returned 200
from `/health`, `/`, a deep extensionless SPA route, the built JavaScript asset, and the
Socket.IO Engine.IO polling handshake. The health body was exactly `{"ok":true}`.
