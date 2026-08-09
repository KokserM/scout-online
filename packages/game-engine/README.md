# `@grandstand/game-engine`

A server-authoritative, dependency-free TypeScript implementation of SCOUT for
two to five players.

## Main API

- `createGame`, `chooseGameHandOrientation`, `applyGameAction`, and
  `startNextRound` drive complete games.
- `createGame(playerIds, rng, initialStartingPlayerId?)` optionally selects the first
  round's starting seat; subsequent rounds rotate clockwise from it.
- `createRoundFromDeck`, `createRoundFromHands`, `chooseHandOrientation`, and
  `applyRoundAction` support lower-level integrations and tests.
- `createScoutDeck`, `deckForPlayerCount`, `classifyShow`, `compareShows`, and
  `enumerateLegalShows` expose the core rules.
- `CryptoRandomSource` is the production CSPRNG. `SeededRandomSource` and
  `SequenceRandomSource` provide reproducible tests and simulations.
- `toPublicRoundView` and `toPrivatePlayerView` prevent hidden hand leakage.
- `chooseBotAction` accepts only a sanitized private view and a random source.
- `assertRoundInvariants` and `assertGameInvariants` detect card loss,
  duplication, stale shows, invalid counters, and malformed game flow.

All state transitions return new objects. A rejected action leaves the supplied
state untouched, including the two-step Scout & Show action.

## Commands

```powershell
pnpm --filter @grandstand/game-engine build
pnpm --filter @grandstand/game-engine typecheck
pnpm --filter @grandstand/game-engine test
pnpm --filter @grandstand/game-engine test:simulation
```
