# GRANDSTAND rules model

GRANDSTAND implements the rules of SCOUT with original presentation. The engine is the
normative source of truth; this document records the interpretation used by that engine.

## Rules modes

Every room, game, round, and player-facing state declares a rules mode. `official` is
the default and follows the rules below. `vosu` is an optional house-rule variant named
**Võsu**. It is not an official SCOUT ruleset and is not endorsed by or affiliated with
Oink Games.

Võsu changes exactly these rules:

1. Each Show chooses one value mode, **ACTIVE** or **OPPOSITE**, for the complete
   contiguous Show. The choice cannot vary per card. Validity, rank, and comparison all
   use that one mode.
2. In 3–5 player rounds, Scout & Show is not consumed and may be used repeatedly.
3. In two-player rounds, Scout & Show is enabled. Like Scout, it costs the actor one
   Scout chip and awards no Scout point; unlike Scout, its successful Show passes play
   to the opponent.

All setup, hand-orientation, Show-strength, capture, all-Scouted, round-count, and
scoring rules are otherwise unchanged.

## Cards and visible values

The deck has one immutable card for each unordered pair `(low, high)` where
`1 <= low < high <= 10`, for 45 unique cards. Orientation selects which endpoint is
active. In the interface, the large upright number labeled **ACTIVE** is the card's
normal playable value. The small **OPPOSITE** number beneath it is an opposite-side
reference. Official play never selects it; Võsu may select it only as one uniform mode
for an entire Show. A hand is an ordered array. Its order is fixed by the deal.

Before play, each player either accepts the dealt hand or rotates the whole hand. A
whole-hand rotation reverses card order and flips every card, matching a physical
180-degree rotation. After locking, dealt cards cannot move or flip individually.
Official players always use active values. Võsu players choose once per Show, never
independently per card.
Scouting is the only exception: a newly Scouted card may choose either orientation only
while it is inserted into any gap. That orientation is then locked with the rest of the
hand.

## Setup

| Players | Deck | Cards each | Rounds |
| --- | --- | --- | --- |
| 3 | Remove every card containing 10 (36 cards) | 12 | 3 |
| 4 | Remove 9/10 (44 cards) | 11 | 4 |
| 5 | All 45 cards | 9 | 5 |

The deck and every initial card orientation are randomized on the server. A game may
explicitly choose any seated player as the initial starting seat; otherwise the first
seat remains the default. The starting seat advances clockwise from that chosen seat
each round, so every player starts once.

## Show

A Show removes one contiguous interval from the acting hand. Official uses each card's
active value. Võsu uses either every active value or every opposite value, as declared
by the action. One card is always legal in either Võsu mode.
Two or more cards must be:

- a **set**: all visible values equal; or
- a **run**: values differ by exactly one in strictly ascending or descending order.

Strength compares lexicographically:

1. more cards;
2. for equal lengths above one, set over run;
3. rank, where a set uses its repeated value, a run uses its maximum, and a single uses
   its value.

Equal strength never wins. If no Active Set exists, any valid Show is permitted.
Otherwise the Show must be strictly stronger. Replaced Active Set cards go to the
showing player's capture pile, one point each. Newly shown cards become the ordered
Active Set and the showing player becomes its owner.

## Scout

When an Active Set exists, a player may take exactly its leftmost or rightmost card.
During that card's insertion, the player may choose either orientation and insert it
into any hand gap. After insertion, only its new active value is playable, just like the
other locked cards in hand. The Active Set otherwise keeps its order. If its last card
is taken, the table becomes empty.

In games of 3–5 players, the Active Set owner gains one Scout point and turn passes
clockwise.

## Scout & Show (3–5 players)

In Official mode, once per round each player may perform a Scout followed immediately
by a Show in one
atomic, server-validated turn. The Show is evaluated against the reduced Active Set and
need not include the scouted card. If the Scout clears the table, any valid Show is
allowed. A successful combined action establishes a new Active Set owner and resets
all-Scouted tracking; it cannot end the round based on Scouts against the replaced
Show. The ability is consumed only by a successfully applied combined action. In Võsu,
the same combined action is unlimited and the resulting Show may uniformly use ACTIVE
or OPPOSITE values.

## Round end and scoring (3–5 players)

The round ends immediately when a Show empties a hand.

It also ends before an Active Set owner's next turn when every other player has taken
exactly one turn since that Show and each only Scouted. Any successful Show establishes
a new owner and restarts this tracking.

Round score is:

`captured cards + Scout points - cards remaining`

The owner of an Active Set that ended the round by surviving all opponents receives no
remaining-hand penalty. Active Set cards are not captures. After one round per player,
the highest cumulative score wins; ties are shared.

## Dedicated two-player game

Two-player mode lasts two rounds. Official never enables Scout & Show. Võsu enables it
at the same one-chip cost as Scout; it awards no Scout point and a successful combined
Show passes the turn.
All two-seat rounds, including rounds created through low-level engine factories, must
use this dedicated variant; the standard 3–5-player rules are invalid with two seats.

At game creation, remove 9/10, shuffle the 44 remaining cards once, and split them into
two reserved 22-card packets. Round one uses the first packet and round two uses the
second without reshuffling the combined deck. Each packet deals 11 cards to each player.
The starting seat swaps in round two, including when either seat was explicitly chosen
to start round one.

Each player starts each round with three Scout chips. Scouting spends the actor's chip,
awards no point to the opponent, and does not advance the turn. The same player may
Scout repeatedly, then must Show. A successful Show passes the turn.

The round ends when a Show empties a hand, or when the active player has no legal Show
and no Scout chips. Scoring is:

`captured cards - cards remaining + unused Scout chips`

The Active Set remains non-captured. Highest total after round two wins; ties are shared.

## Explicit edge decisions

- Public history may identify which visible end was scouted, but never broadcasts the
  card's chosen hidden orientation or insertion gap to opponents.
- The authoritative action contains hand indices/card IDs only as claims to validate;
  the engine derives cards, values, captures, and scores from state.
- A two-player player with chips remaining is not stuck merely because no Show exists:
  they may Scout if an Active Set exists. The no-action ending requires no legal Show
  and no legal Scout due to zero chips (or no Active Set).
- Actions resolve fully before round-end checks. There is no ordinary pass action.

## Engine conformance traceability

- Deck filtering, dealing, and initial orientation are implemented by
  `cards.ts` and `round.ts`; deterministic setup and orientation regressions live in
  `cards-and-rng.test.ts`, `round.test.ts`, and `rules-audit.test.ts`.
- Show validity and strength are classified in `shows.ts` and enforced by
  `round.ts`; `shows.test.ts` covers the pure ordering and `rules-audit.test.ts`
  exercises the full rulebook ladder through authoritative actions.
- Scout, Scout & Show, unbeaten tracking, round endings, and per-round scoring are
  applied in `round.ts`; focused normal and edge sequences live in `round.test.ts`
  and `rules-audit.test.ts`.
- Starting-seat rotation, reserved two-player packets, cumulative totals, and tied
  winners are implemented in `game.ts`; `views-bot-game.test.ts`,
  `simulation.test.ts`, and `rules-audit.test.ts` cover those game-level rules.
- Card conservation and variant/state consistency are checked by `invariants.ts`
  during deterministic simulations for every supported player count.
