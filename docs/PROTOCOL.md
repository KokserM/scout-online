# Realtime protocol

Socket.IO provides ordered delivery within a connection, rooms, and reconnect transport.
The application adds explicit `action:ack` events and action-ID replay handling across
transport retries. Every client payload is parsed with Zod before use.

## Identity

Creating or joining returns a room code, player ID, and opaque reconnect token. The
browser stores the token locally and presents it on a reconnect request. Tokens are
random capabilities and must not be logged or shared. A new connection for the same
session supersedes the old socket with `session:replaced` and a
`SESSION_REPLACED` error.

## Commands

Lobby commands cover room creation/join, ready state, bot management, start, rematch,
and leave. Gameplay commands contain:

- a UUID `actionId` allocated once and retained across retries;
- the room/session context associated with the socket;
- one discriminated engine intent (`CHOOSE_ORIENTATION`, `SHOW`, `SCOUT`,
  `SCOUT_AND_SHOW`, or `START_NEXT_ROUND`).

Rooms default to `rulesMode: "official"`. Only the host may send
`host:set-rules-mode`, and only while the room is in the lobby. The selected mode is
locked for the game and retained by rematch. `SHOW` and `SCOUT_AND_SHOW` require a
`valueMode` of exactly `"active"` or `"opposite"`; Official rejects `"opposite"` at the
engine boundary, while Võsu validates the complete contiguous range using that one
mode. Per-card or mixed modes do not exist in the wire model.

The client may reference its own card IDs and requested indices. Show card arrays are
bounded to 13, the largest reachable post-Scout hand; availability arrays and insertion
indices are likewise bounded to engine-reachable maxima. Those fields are untrusted
claims: the server verifies ownership, phase, turn, adjacency, orientation rights,
strength, and all resulting state.

## Responses

Commands use acknowledgements shaped as either success or a stable error code with a
human-readable message. Duplicate action IDs return the prior acknowledgement without
applying the command again. Invalid or stale commands never partially mutate state.
The browser sends one queued command at a time and removes it only after a matching
`action:ack` (or a terminal action error). Queue and replay caches are bounded.

`state` events are generated independently for each player and contain:

- public room, seat, connection, score, turn, Active Set, and history data;
- the locked rules mode and the Active Set's uniform Show value mode;
- that recipient's private hand and available-action hints;
- no other player's card identities, values, order, or orientation.

Connection-status events are public. Reconnect restores a fresh state projection.
Disconnect retains the seat during `reconnectGraceMs` (90 seconds by default). The
browser also nudges Socket.IO awake on `visibilitychange`, bfcache `pageshow`, and
`online` so a returning tab resumes the same seat. Expiry forfeits the reconnect
capability, converts an active seat to a bot, and causes future token use to receive
`SEAT_LOST` with instructions to join a new room. Repeating an acknowledged leave with
the same token and action ID remains idempotent.

## Compatibility and failures

Client action schemas are strict, so unknown fields and malformed events are rejected
with `BAD_PAYLOAD` and cannot terminate the server. A protocol version is available
for future migrations. Room-not-found, room-full, invalid-phase, not-your-turn,
illegal-action, and stale-action are distinct failures suitable for direct UX.
Additional stable failures include `RATE_LIMITED`, `SESSION_REPLACED`, `SEAT_LOST`,
and `BAD_SERVER_STATE`. Schema-invalid server state is surfaced by the browser rather
than silently discarded.

These controls are application boundaries, not user authentication or end-to-end
encryption. Reconnect tokens are bearer capabilities; transport confidentiality depends
on deploying the app behind HTTPS/WSS. Rooms and replay caches are process-local and are
lost on server restart.
