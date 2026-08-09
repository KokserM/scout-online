import { z } from "zod";

const boundedText = (min: number, max: number) =>
  z.string().trim().min(min).max(max).refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
    message: "Control characters are not allowed",
  });

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{5}$/, "Invalid room code");
export const sessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/u, "Invalid session token");
export const playerNameSchema = boundedText(1, 24);
export const actionIdSchema = z.string().uuid();
export const entityIdSchema = z.string().uuid();
export const cardIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/u);
export const playIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,96}$/u);

const actionBase = { actionId: actionIdSchema };
const playerId = entityIdSchema;

export const clientActionSchema = z.discriminatedUnion("type", [
  z.object({ ...actionBase, type: z.literal("room:create"), name: playerNameSchema }).strict(),
  z.object({ ...actionBase, type: z.literal("room:quick-play"), name: playerNameSchema }).strict(),
  z
    .object({ ...actionBase, type: z.literal("room:join"), roomCode: roomCodeSchema, name: playerNameSchema })
    .strict(),
  z.object({ ...actionBase, type: z.literal("player:set-ready"), ready: z.boolean() }).strict(),
  z
    .object({
      ...actionBase,
      type: z.literal("host:add-bot"),
      name: playerNameSchema.optional(),
      difficulty: z.enum(["easy", "standard"]).default("standard"),
    })
    .strict(),
  z.object({ ...actionBase, type: z.literal("host:remove-bot"), playerId }).strict(),
  z.object({ ...actionBase, type: z.literal("game:start") }).strict(),
  z.object({ ...actionBase, type: z.literal("game:choose-orientation"), flipped: z.boolean() }).strict(),
  z
    .object({
      ...actionBase,
      type: z.literal("game:show"),
      cardIds: z.array(cardIdSchema).min(1).max(10),
    })
    .strict(),
  z
    .object({
      ...actionBase,
      type: z.literal("game:scout"),
      playId: playIdSchema,
      position: z.enum(["start", "end"]),
      insertAt: z.number().int().nonnegative().max(20).optional(),
      flipped: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ...actionBase,
      type: z.literal("game:scout-and-show"),
      playId: playIdSchema,
      position: z.enum(["start", "end"]),
      insertAt: z.number().int().nonnegative().max(20).optional(),
      flipped: z.boolean().optional(),
      cardIds: z.array(cardIdSchema).min(1).max(10),
    })
    .strict(),
  z.object({ ...actionBase, type: z.literal("game:next-round") }).strict(),
  z.object({ ...actionBase, type: z.literal("game:rematch") }).strict(),
  z.object({ ...actionBase, type: z.literal("room:leave") }).strict(),
]);

export type ClientAction = z.infer<typeof clientActionSchema>;
export type GameAction = Extract<ClientAction, { type: `game:${string}` }>;

export const cardSchema = z
  .object({
    id: cardIdSchema,
    top: z.number().int().min(1).max(10),
    bottom: z.number().int().min(1).max(10),
    suit: z.enum(["coral", "gold", "mint", "sky", "violet"]),
  })
  .strict();

export const publicPlayerSchema = z
  .object({
    id: entityIdSchema,
    name: playerNameSchema,
    score: z.number().int(),
    handCount: z.number().int().nonnegative(),
    connected: z.boolean(),
    ready: z.boolean(),
    isHost: z.boolean(),
    isBot: z.boolean(),
    botDifficulty: z.enum(["easy", "standard"]).optional(),
    capturedCount: z.number().int().nonnegative(),
    scoutPoints: z.number().int().nonnegative(),
    scoutAndShowAvailable: z.boolean(),
    scoutChips: z.number().int().nonnegative(),
    orientationChosen: z.boolean().optional(),
  })
  .strict();

export const playSchema = z
  .object({ id: playIdSchema, playerId: entityIdSchema, cards: z.array(cardSchema) })
  .strict();

export const activitySchema = z
  .object({
    id: entityIdSchema,
    message: boundedText(1, 160),
    tone: z.enum(["neutral", "good", "warning"]).optional(),
  })
  .strict();

export const roundScoreSchema = z
  .object({
    playerId: entityIdSchema,
    capturedCards: z.number().int().nonnegative(),
    scoutPoints: z.number().int().nonnegative(),
    cardsRemaining: z.number().int().nonnegative(),
    unusedScoutChips: z.number().int().nonnegative(),
    handPenaltyExempt: z.boolean(),
    roundTotal: z.number().int(),
    cumulativeTotal: z.number().int(),
  })
  .strict();

export const actionDisabledReasonSchema = z.enum([
  "round-ended",
  "orientations-pending",
  "not-active-player",
  "no-legal-show",
  "no-active-show",
  "own-active-show",
  "no-scout-chips",
  "wrong-variant",
  "already-used",
  "no-combined-show",
]);

const availabilityBase = {
  enabled: z.boolean(),
  disabledReason: actionDisabledReasonSchema.optional(),
};

export const showRangeHintSchema = z
  .object({
    cardIds: z.array(cardIdSchema).min(1).max(13),
    kind: z.enum(["single", "run", "set"]),
    legal: z.boolean(),
  })
  .strict();

export const availableActionsSchema = z
  .object({
    show: z
      .object({
        ...availabilityBase,
        ranges: z.array(showRangeHintSchema).max(210),
      })
      .strict(),
    scout: z
      .object({
        ...availabilityBase,
        playId: playIdSchema.optional(),
        endpoints: z.array(z.enum(["start", "end"])).max(2),
        insertionCount: z.number().int().nonnegative().max(21),
        flipped: z.array(z.boolean()).max(2),
      })
      .strict(),
    scoutAndShow: z
      .object({
        ...availabilityBase,
        playId: playIdSchema.optional(),
        options: z
          .array(
            z
              .object({
                position: z.enum(["start", "end"]),
                insertAt: z.number().int().nonnegative().max(20),
                flipped: z.boolean(),
                showRanges: z
                  .array(showRangeHintSchema)
                  .max(231),
              })
              .strict(),
          )
          .max(84),
      })
      .strict(),
  })
  .strict();

export const playerStateSchema = z
  .object({
    roomCode: roomCodeSchema,
    phase: z.enum(["lobby", "orientation", "playing", "round-results", "final"]),
    selfId: entityIdSchema,
    hostId: entityIdSchema,
    players: z.array(publicPlayerSchema),
    hand: z.array(cardSchema),
    table: z.array(playSchema),
    activePlayerId: entityIdSchema.optional(),
    startingPlayerId: entityIdSchema.optional(),
    scoutTargetId: entityIdSchema.optional(),
    round: z.number().int().positive(),
    totalRounds: z.number().int().min(2).max(5),
    variant: z.enum(["standard", "two-player"]),
    mustChooseOrientation: z.boolean(),
    availableActions: availableActionsSchema,
    roundScores: z.array(roundScoreSchema).optional(),
    activity: z.array(activitySchema),
    canStart: z.boolean(),
    reconnectGraceMs: z.number().int().nonnegative(),
  })
  .strict();

export type Card = z.infer<typeof cardSchema>;
export type PublicPlayer = z.infer<typeof publicPlayerSchema>;
export type Play = z.infer<typeof playSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type RoundScore = z.infer<typeof roundScoreSchema>;
export type ActionDisabledReason = z.infer<typeof actionDisabledReasonSchema>;
export type ShowRangeHint = z.infer<typeof showRangeHintSchema>;
export type AvailableActions = z.infer<typeof availableActionsSchema>;
export type PlayerState = z.infer<typeof playerStateSchema>;

export const protocolErrorCodeSchema = z.enum([
  "BAD_PAYLOAD",
  "UNAUTHENTICATED",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "NAME_TAKEN",
  "FORBIDDEN",
  "INVALID_STATE",
  "INVALID_ACTION",
  "ACTION_CONFLICT",
  "SEAT_LOST",
  "SESSION_REPLACED",
  "RATE_LIMITED",
  "BAD_SERVER_STATE",
  "INTERNAL_ERROR",
]);

export const protocolErrorSchema = z
  .object({
    actionId: actionIdSchema.optional(),
    code: protocolErrorCodeSchema,
    message: boundedText(1, 160),
  })
  .strict();

export const actionAckSchema = z
  .object({
    actionId: actionIdSchema,
    ok: z.boolean(),
    duplicate: z.boolean(),
  })
  .strict();

export type ProtocolError = z.infer<typeof protocolErrorSchema>;
export type ProtocolErrorCode = z.infer<typeof protocolErrorCodeSchema>;
export type ActionAck = z.infer<typeof actionAckSchema>;

export interface ClientToServerEvents {
  "game:action": (payload: unknown) => void;
}

export interface ServerToClientEvents {
  "game:state": (state: PlayerState) => void;
  "game:error": (error: ProtocolError) => void;
  "action:ack": (ack: ActionAck) => void;
  "session:token": (token: string) => void;
  "session:replaced": () => void;
}

export interface InterServerEvents {}

export interface SocketData {
  sessionToken?: string;
  playerId?: string;
  roomCode?: string;
}
