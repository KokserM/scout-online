import { randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  playerStateSchema,
  type ActionAck,
  type Activity,
  type AvailableActions,
  type ClientAction,
  type PlayerState,
  type ProtocolErrorCode,
} from "@grandstand/shared";
import type { EnginePlayerView, GameEngine } from "./game-engine-adapter.js";
import {
  actionFingerprint,
  type Room,
  type RoomPlayer,
  type RoomRepository,
} from "./room-repository.js";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PLAYERS = 5;
const MAX_PROCESSED_ACTIONS = 50_000;
const MAX_BOT_TRANSITIONS = 10_000;

const lobbyAvailableActions: AvailableActions = {
  show: { enabled: false, disabledReason: "round-ended", ranges: [] },
  scout: {
    enabled: false,
    disabledReason: "round-ended",
    endpoints: [],
    insertionCount: 0,
    flipped: [],
  },
  scoutAndShow: {
    enabled: false,
    disabledReason: "round-ended",
    options: [],
  },
};

export class ServiceError extends Error {
  constructor(
    readonly code: ProtocolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface ActionResult {
  readonly room?: Room;
  readonly player?: RoomPlayer;
  readonly sessionToken?: string;
  readonly ack: ActionAck;
}

export interface RoomServiceOptions {
  reconnectGraceMs?: number;
  now?: () => number;
}

export class RoomService {
  readonly reconnectGraceMs: number;
  private readonly now: () => number;
  private readonly retiredSessions = new Map<
    string,
    { reason: "left" | "forfeited"; actions: Map<string, string> }
  >();

  constructor(
    private readonly repository: RoomRepository,
    private readonly engine: GameEngine,
    options: RoomServiceOptions = {},
  ) {
    this.reconnectGraceMs = options.reconnectGraceMs ?? 90_000;
    this.now = options.now ?? Date.now;
  }

  resume(token: string): { room: Room; player: RoomPlayer } | undefined {
    const session = this.repository.getBySessionToken(token);
    if (!session || session.player.isBot) {
      if (this.retiredSessions.get(token)?.reason === "forfeited") {
        throw new ServiceError(
          "SEAT_LOST",
          "Your reconnect grace period expired and a bot took over this seat. Rejoin a new room.",
        );
      }
      return undefined;
    }
    session.player.connected = true;
    delete session.player.disconnectedAt;
    session.room.updatedAt = this.now();
    this.repository.save(session.room);
    return session;
  }

  disconnect(token: string): Room | undefined {
    const session = this.repository.getBySessionToken(token);
    if (!session || session.player.isBot) return undefined;
    session.player.connected = false;
    session.player.disconnectedAt = this.now();
    session.room.updatedAt = this.now();
    this.repository.save(session.room);
    return session.room;
  }

  expireDisconnected(token: string): Room | undefined {
    const session = this.repository.getBySessionToken(token);
    if (
      !session ||
      session.player.connected ||
      session.player.disconnectedAt === undefined
    )
      return undefined;
    if (this.now() - session.player.disconnectedAt < this.reconnectGraceMs)
      return undefined;
    if (session.room.engineState !== undefined) {
      session.player.isBot = true;
      session.player.botDifficulty = "standard";
      session.player.connected = true;
      delete session.player.disconnectedAt;
      this.transferHostFromBot(session.room);
      session.room.activity.push(
        this.activity(`${session.player.name} is now controlled by a bot.`),
      );
      session.room.updatedAt = this.now();
      this.repository.save(session.room);
      this.retiredSessions.set(token, {
        reason: "forfeited",
        actions: new Map(),
      });
      this.runBots(session.room);
      return session.room;
    }
    const changed = this.removePlayer(session.room, session.player.id);
    this.retiredSessions.set(token, {
      reason: "forfeited",
      actions: new Map(),
    });
    return changed;
  }

  perform(token: string | undefined, action: ClientAction): ActionResult {
    if (
      action.type === "room:create" ||
      action.type === "room:quick-play" ||
      action.type === "room:join"
    ) {
      const existing = token
        ? this.repository.getBySessionToken(token)
        : undefined;
      if (existing) {
        const previous = existing.room.processedActions.get(action.actionId);
        if (
          previous?.playerId === existing.player.id &&
          previous.fingerprint === actionFingerprint(action)
        ) {
          return {
            room: existing.room,
            player: existing.player,
            ack: { actionId: action.actionId, ok: true, duplicate: true },
          };
        }
        if (previous)
          throw new ServiceError(
            "ACTION_CONFLICT",
            "The action ID is already in use",
          );
        throw new ServiceError(
          "INVALID_STATE",
          "Leave the current room before creating or joining another",
        );
      }
      if (action.type === "room:create") return this.createRoom(action);
      if (action.type === "room:quick-play")
        return this.createQuickPlay(action);
      return this.joinRoom(action);
    }

    if (!token)
      throw new ServiceError("UNAUTHENTICATED", "A valid session is required");
    const session = this.repository.getBySessionToken(token);
    if (!session || session.player.isBot) {
      const retired = this.retiredSessions.get(token);
      const fingerprint = actionFingerprint(action);
      if (retired?.actions.get(action.actionId) === fingerprint) {
        return {
          ack: { actionId: action.actionId, ok: true, duplicate: true },
        };
      }
      if (retired?.reason === "forfeited") {
        throw new ServiceError(
          "SEAT_LOST",
          "Your seat was forfeited after the reconnect grace period. Rejoin a new room.",
        );
      }
      throw new ServiceError(
        "UNAUTHENTICATED",
        "The session is invalid or expired",
      );
    }

    const fingerprint = actionFingerprint(action);
    const previous = session.room.processedActions.get(action.actionId);
    if (previous) {
      if (
        previous.playerId !== session.player.id ||
        previous.fingerprint !== fingerprint
      ) {
        throw new ServiceError(
          "ACTION_CONFLICT",
          "The action ID was already used for a different action",
        );
      }
      return {
        room: session.room,
        player: session.player,
        ack: { actionId: action.actionId, ok: true, duplicate: true },
      };
    }

    this.applyAuthenticated(session.room, session.player, action);
    if (action.type === "room:leave") {
      this.retiredSessions.set(token, {
        reason: "left",
        actions: new Map([[action.actionId, fingerprint]]),
      });
      const remainingRoom = this.repository.get(session.room.code);
      if (remainingRoom?.engineState !== undefined) this.runBots(remainingRoom);
      return {
        ...(remainingRoom ? { room: remainingRoom } : {}),
        player: session.player,
        ack: { actionId: action.actionId, ok: true, duplicate: false },
      };
    }
    this.rememberAction(
      session.room,
      action.actionId,
      session.player.id,
      fingerprint,
    );
    session.room.updatedAt = this.now();
    this.repository.save(session.room);
    this.runBots(session.room);
    return {
      room: session.room,
      player: session.player,
      ack: { actionId: action.actionId, ok: true, duplicate: false },
    };
  }

  stateFor(room: Room, playerId: string): PlayerState {
    const self = room.players.get(playerId);
    if (!self)
      throw new ServiceError(
        "UNAUTHENTICATED",
        "Player no longer belongs to this room",
      );
    if (room.engineState !== undefined)
      this.engine.assertState?.(room.engineState);
    const engineView =
      room.engineState === undefined
        ? undefined
        : this.engine.getPlayerView(room.engineState, playerId);
    const summaries = engineView?.players ?? {};
    const phase = engineView?.phase ?? "lobby";
    const players = [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      score: summaries[player.id]?.score ?? 0,
      handCount:
        player.id === playerId
          ? (engineView?.hand.length ?? 0)
          : (summaries[player.id]?.handCount ?? 0),
      connected: player.connected,
      ready: player.ready,
      isHost: player.id === room.hostId,
      isBot: player.isBot,
      ...(player.botDifficulty ? { botDifficulty: player.botDifficulty } : {}),
      capturedCount: summaries[player.id]?.capturedCount ?? 0,
      scoutPoints: summaries[player.id]?.scoutPoints ?? 0,
      scoutAndShowAvailable:
        summaries[player.id]?.scoutAndShowAvailable ?? false,
      scoutChips: summaries[player.id]?.scoutChips ?? 0,
      ...(phase === "orientation"
        ? {
            orientationChosen:
              !engineView?.pendingOrientationPlayerIds?.includes(player.id),
          }
        : {}),
    }));
    const canStart =
      phase === "lobby" &&
      players.length >= 2 &&
      players.length <= MAX_PLAYERS &&
      players.filter((player) => !player.isBot).every((player) => player.ready);

    return playerStateSchema.parse({
      roomCode: room.code,
      phase,
      selfId: playerId,
      hostId: room.hostId,
      players,
      hand: engineView?.hand ?? [],
      table: engineView?.table ?? [],
      ...(engineView?.activePlayerId
        ? { activePlayerId: engineView.activePlayerId }
        : {}),
      ...(engineView?.startingPlayerId
        ? { startingPlayerId: engineView.startingPlayerId }
        : {}),
      ...(engineView?.scoutTargetId
        ? { scoutTargetId: engineView.scoutTargetId }
        : {}),
      round: engineView?.round ?? 1,
      totalRounds: engineView?.totalRounds ?? Math.max(2, room.players.size),
      rulesMode: engineView?.rulesMode ?? room.rulesMode,
      variant:
        engineView?.variant ??
        (room.players.size === 2 ? "two-player" : "standard"),
      mustChooseOrientation:
        engineView?.pendingOrientationPlayerIds?.includes(playerId) ?? false,
      availableActions: engineView?.availableActions ?? lobbyAvailableActions,
      ...(engineView?.roundScores
        ? { roundScores: engineView.roundScores }
        : {}),
      ...(engineView?.roundOutcome
        ? { roundOutcome: engineView.roundOutcome }
        : {}),
      activity: [...room.activity, ...(engineView?.activity ?? [])].slice(-30),
      canStart,
      reconnectGraceMs: this.reconnectGraceMs,
    });
  }

  statesForConnectedPlayers(room: Room): ReadonlyMap<string, PlayerState> {
    const states = new Map<string, PlayerState>();
    for (const player of room.players.values()) {
      if (player.connected && !player.isBot)
        states.set(player.id, this.stateFor(room, player.id));
    }
    return states;
  }

  debugRooms(): readonly object[] {
    return this.repository.list().map((room) => ({
      code: room.code,
      hostId: room.hostId,
      rulesMode: room.rulesMode,
      phase:
        room.engineState === undefined
          ? "lobby"
          : this.engine.getPlayerView(room.engineState, room.hostId).phase,
      players: [...room.players.values()].map(
        ({ id, name, isBot, ready, connected }) => ({
          id,
          name,
          isBot,
          ready,
          connected,
        }),
      ),
      processedActionCount: room.processedActions.size,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    }));
  }

  private createRoom(
    action: Extract<ClientAction, { type: "room:create" }>,
  ): ActionResult {
    const player = this.newPlayer(action.name, false, true);
    const now = this.now();
    const room: Room = {
      code: this.newRoomCode(),
      hostId: player.id,
      rulesMode: "official",
      players: new Map([[player.id, player]]),
      processedActions: new Map(),
      activity: [this.activity(`${player.name} created the room.`)],
      createdAt: now,
      updatedAt: now,
    };
    this.rememberAction(
      room,
      action.actionId,
      player.id,
      actionFingerprint(action),
    );
    this.repository.save(room);
    return {
      room,
      player,
      sessionToken: player.token,
      ack: { actionId: action.actionId, ok: true, duplicate: false },
    };
  }

  private createQuickPlay(
    action: Extract<ClientAction, { type: "room:quick-play" }>,
  ): ActionResult {
    const result = this.createRoom({
      actionId: action.actionId,
      type: "room:create",
      name: action.name,
    });
    const room = result.room;
    if (!room)
      throw new ServiceError(
        "INTERNAL_ERROR",
        "Quick Play room was not created",
      );
    room.processedActions.set(action.actionId, {
      playerId: result.player?.id ?? "",
      fingerprint: actionFingerprint(action),
    });
    for (const name of ["Tempo", "Marquee"]) {
      const bot = this.newPlayer(name, true, true, "standard");
      room.players.set(bot.id, bot);
    }
    room.activity.push(
      this.activity("Two Standard bots joined for Quick Play."),
    );
    room.rulesMode = "official";
    room.engineState = this.engine.createGame(
      [...room.players.keys()],
      "official",
    );
    room.updatedAt = this.now();
    this.repository.save(room);
    this.runBots(room);
    return result;
  }

  private joinRoom(
    action: Extract<ClientAction, { type: "room:join" }>,
  ): ActionResult {
    const room = this.repository.get(action.roomCode);
    if (!room) throw new ServiceError("ROOM_NOT_FOUND", "Room not found");
    if (room.engineState !== undefined)
      throw new ServiceError("INVALID_STATE", "The game has already started");
    if (room.players.size >= MAX_PLAYERS)
      throw new ServiceError("ROOM_FULL", "The room is full");
    if (
      [...room.players.values()].some(
        (player) =>
          player.name.toLocaleLowerCase() === action.name.toLocaleLowerCase(),
      )
    ) {
      throw new ServiceError("NAME_TAKEN", "That name is already in use");
    }
    const player = this.newPlayer(action.name, false, false);
    room.players.set(player.id, player);
    room.activity.push(this.activity(`${player.name} joined the room.`));
    this.rememberAction(
      room,
      action.actionId,
      player.id,
      actionFingerprint(action),
    );
    room.updatedAt = this.now();
    this.repository.save(room);
    return {
      room,
      player,
      sessionToken: player.token,
      ack: { actionId: action.actionId, ok: true, duplicate: false },
    };
  }

  private applyAuthenticated(
    room: Room,
    player: RoomPlayer,
    action: Exclude<
      ClientAction,
      { type: "room:create" | "room:quick-play" | "room:join" }
    >,
  ): void {
    switch (action.type) {
      case "player:set-ready":
        this.requireLobby(room);
        player.ready = action.ready;
        return;
      case "host:add-bot": {
        this.requireHost(room, player);
        this.requireLobby(room);
        if (room.players.size >= MAX_PLAYERS)
          throw new ServiceError("ROOM_FULL", "The room is full");
        const botNumber =
          [...room.players.values()].filter((candidate) => candidate.isBot)
            .length + 1;
        const name = action.name ?? `Bot ${botNumber}`;
        if (
          [...room.players.values()].some(
            (candidate) =>
              candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
          )
        ) {
          throw new ServiceError("NAME_TAKEN", "That name is already in use");
        }
        const bot = this.newPlayer(name, true, true, action.difficulty);
        room.players.set(bot.id, bot);
        room.activity.push(this.activity(`${bot.name} was added.`));
        return;
      }
      case "host:remove-bot": {
        this.requireHost(room, player);
        this.requireLobby(room);
        const target = room.players.get(action.playerId);
        if (!target?.isBot)
          throw new ServiceError("INVALID_ACTION", "Only bots can be removed");
        room.players.delete(target.id);
        room.activity.push(this.activity(`${target.name} was removed.`));
        return;
      }
      case "host:set-rules-mode":
        this.requireHost(room, player);
        this.requireLobby(room);
        room.rulesMode = action.rulesMode;
        room.activity.push(
          this.activity(
            `Rules mode changed to ${action.rulesMode === "official" ? "Official" : "Võsu"}.`,
          ),
        );
        return;
      case "game:start":
        this.requireHost(room, player);
        this.requireLobby(room);
        if (room.players.size < 2)
          throw new ServiceError(
            "INVALID_STATE",
            "At least two players are required",
          );
        if (
          [...room.players.values()].some(
            (candidate) => !candidate.isBot && !candidate.ready,
          )
        ) {
          throw new ServiceError(
            "INVALID_STATE",
            "All human players must be ready",
          );
        }
        try {
          room.engineState = this.engine.createGame(
            [...room.players.keys()],
            room.rulesMode,
          );
        } catch (error: unknown) {
          throw new ServiceError(
            "INVALID_STATE",
            error instanceof Error ? error.message : "The game could not start",
          );
        }
        return;
      case "game:next-round":
        this.requireHost(room, player);
        this.requireEnginePhase(room, player.id, "round-results");
        room.engineState = this.applyEngineAction(
          room.engineState,
          player.id,
          action,
        );
        return;
      case "game:rematch":
        this.requireHost(room, player);
        this.requireEnginePhase(room, player.id, "final");
        delete room.engineState;
        for (const candidate of room.players.values())
          candidate.ready = candidate.isBot;
        room.activity.push(this.activity("The room is ready for a rematch."));
        return;
      case "game:choose-orientation":
      case "game:show":
      case "game:scout":
      case "game:scout-and-show":
        if (room.engineState === undefined)
          throw new ServiceError("INVALID_STATE", "The game has not started");
        {
          const scoutOwnerId =
            action.type === "game:scout" || action.type === "game:scout-and-show"
              ? this.peekScoutOwnerId(room, player.id)
              : undefined;
          room.engineState = this.applyEngineAction(
            room.engineState,
            player.id,
            action,
          );
          this.recordGameAction(room, player, action, scoutOwnerId);
        }
        return;
      case "room:leave":
        if (room.engineState === undefined) {
          this.removePlayer(room, player.id);
        } else {
          player.isBot = true;
          player.botDifficulty = "standard";
          player.connected = true;
          delete player.disconnectedAt;
          this.transferHostFromBot(room);
          room.activity.push(
            this.activity(`${player.name} left; a bot took over.`),
          );
          room.updatedAt = this.now();
          this.repository.save(room);
        }
        return;
    }
  }

  private runBots(room: Room): void {
    let transitions = 0;
    while (room.engineState !== undefined) {
      this.engine.assertState?.(room.engineState);
      const viewer =
        room.players.get(room.hostId) ?? room.players.values().next().value;
      if (!viewer) return;
      const view = this.engine.getPlayerView(room.engineState, viewer.id);
      const botId =
        view.phase === "orientation"
          ? view.pendingOrientationPlayerIds?.find(
              (playerId) => room.players.get(playerId)?.isBot,
            )
          : view.activePlayerId;
      if (!botId) return;
      const bot = room.players.get(botId);
      if (!bot?.isBot) return;
      const action = this.engine.chooseBotAction(
        room.engineState,
        bot.id,
        bot.botDifficulty ?? "standard",
      );
      if (!action) {
        throw new ServiceError(
          "INTERNAL_ERROR",
          `Bot ${bot.id} had the turn but produced no legal action`,
        );
      }
      const previous = room.engineState;
      const next = this.engine.applyAction(previous, bot.id, action);
      if (next === previous) {
        throw new ServiceError(
          "INTERNAL_ERROR",
          "Bot action did not advance authoritative state",
        );
      }
      this.engine.assertState?.(next);
      const scoutOwnerId =
        action.type === "game:scout" || action.type === "game:scout-and-show"
          ? this.engine.getPlayerView(previous, bot.id).scoutTargetId
          : undefined;
      room.engineState = next;
      if (
        action.type === "game:choose-orientation" ||
        action.type === "game:show" ||
        action.type === "game:scout" ||
        action.type === "game:scout-and-show"
      ) {
        this.recordGameAction(room, bot, action, scoutOwnerId);
      }
      room.updatedAt = this.now();
      this.repository.save(room);
      transitions += 1;
      if (transitions >= MAX_BOT_TRANSITIONS) {
        throw new ServiceError(
          "INTERNAL_ERROR",
          "Bot drain exceeded its invariant guard before reaching a human turn or completion",
        );
      }
    }
  }

  private removePlayer(room: Room, playerId: string): Room | undefined {
    const player = room.players.get(playerId);
    if (!player) return room;
    room.players.delete(playerId);
    room.activity.push(this.activity(`${player.name} left the room.`));
    if (room.players.size === 0) {
      this.repository.delete(room.code);
      return undefined;
    }
    if (room.hostId === playerId) {
      const nextHost =
        [...room.players.values()].find((candidate) => !candidate.isBot)?.id ??
        room.players.keys().next().value;
      if (nextHost === undefined)
        throw new ServiceError(
          "INTERNAL_ERROR",
          "Room has no replacement host",
        );
      room.hostId = nextHost;
    }
    room.updatedAt = this.now();
    this.repository.save(room);
    return room;
  }

  private requireHost(room: Room, player: RoomPlayer): void {
    if (room.hostId !== player.id)
      throw new ServiceError("FORBIDDEN", "Only the host can do that");
  }

  private peekScoutOwnerId(room: Room, viewerId: string): string | undefined {
    if (room.engineState === undefined) return undefined;
    return this.engine.getPlayerView(room.engineState, viewerId).scoutTargetId;
  }

  private recordGameAction(
    room: Room,
    player: RoomPlayer,
    action: Extract<
      ClientAction,
      {
        type:
          | "game:choose-orientation"
          | "game:show"
          | "game:scout"
          | "game:scout-and-show";
      }
    >,
    scoutOwnerId?: string,
  ): void {
    if (action.type === "game:choose-orientation") {
      room.activity.push(
        this.activity(`${player.name} locked their hand orientation.`),
      );
      return;
    }
    const view =
      room.engineState === undefined
        ? undefined
        : this.engine.getPlayerView(room.engineState, player.id);
    if (action.type === "game:scout") {
      room.activity.push(
        this.activity(
          `${player.name} scouted the ${action.position === "start" ? "left" : "right"} card.`,
        ),
      );
      this.recordScoutConsequence(room, player, view, scoutOwnerId);
      this.recordCompletionActivity(room, view);
      return;
    }
    const values = view?.table
      .at(-1)
      ?.cards.map((card) =>
        action.valueMode === "opposite" ? card.bottom : card.top,
      )
      .join("–");
    const mode =
      room.rulesMode === "vosu"
        ? ` using ${action.valueMode.toUpperCase()} values`
        : "";
    room.activity.push(
      this.activity(
        action.type === "game:scout-and-show"
          ? `${player.name} scouted, then showed${values ? ` ${values}` : ""}${mode}.`
          : `${player.name} showed${values ? ` ${values}` : ""}${mode}.`,
        "good",
      ),
    );
    if (action.type === "game:scout-and-show") {
      this.recordScoutConsequence(room, player, view, scoutOwnerId);
    }
    this.recordCompletionActivity(room, view);
  }

  private recordScoutConsequence(
    room: Room,
    player: RoomPlayer,
    view: EnginePlayerView | undefined,
    scoutOwnerId: string | undefined,
  ): void {
    if (view?.variant === "two-player") {
      room.activity.push(this.activity(`${player.name} spent a Scout chip.`));
      return;
    }
    const ownerName = scoutOwnerId
      ? room.players.get(scoutOwnerId)?.name
      : undefined;
    if (ownerName) {
      room.activity.push(this.activity(`${ownerName} gained +1 Scout.`, "good"));
    }
  }

  private recordCompletionActivity(
    room: Room,
    view: EnginePlayerView | undefined,
  ): void {
    const phase = view?.phase;
    if (phase === "round-results" || phase === "final") {
      const line = this.roundEndMessage(room, view?.roundOutcome);
      if (line) room.activity.push(this.activity(line, "warning"));
    }
    if (phase === "final") {
      room.activity.push(this.activity("Match complete.", "warning"));
    }
  }

  private roundEndMessage(
    room: Room,
    outcome: EnginePlayerView["roundOutcome"],
  ): string | undefined {
    if (!outcome) return undefined;
    const name = room.players.get(outcome.winnerId)?.name ?? "A player";
    if (outcome.reason === "empty-hand") {
      return `${name} went out with an empty hand.`;
    }
    if (outcome.reason === "all-scouted") {
      return `Everyone Scouted ${name}’s Show. It stood unbeaten.`;
    }
    return `${name} takes the round — no Show left and no Scout chips.`;
  }

  private transferHostFromBot(room: Room): void {
    if (!room.players.get(room.hostId)?.isBot) return;
    const human = [...room.players.values()].find(
      (candidate) => !candidate.isBot,
    );
    if (human) room.hostId = human.id;
  }

  private requireLobby(room: Room): void {
    if (room.engineState !== undefined)
      throw new ServiceError(
        "INVALID_STATE",
        "This action is only available in the lobby",
      );
  }

  private requireEnginePhase(
    room: Room,
    viewerId: string,
    phase: "round-results" | "final",
  ): void {
    if (
      room.engineState === undefined ||
      this.engine.getPlayerView(room.engineState, viewerId).phase !== phase
    ) {
      throw new ServiceError(
        "INVALID_STATE",
        `This action requires the ${phase} phase`,
      );
    }
  }

  private applyEngineAction(
    state: unknown,
    playerId: string,
    action: Extract<ClientAction, { type: `game:${string}` }>,
  ): unknown {
    try {
      return this.engine.applyAction(state, playerId, action);
    } catch (error: unknown) {
      throw new ServiceError(
        "INVALID_ACTION",
        error instanceof Error ? error.message : "The action is not legal",
      );
    }
  }

  private newPlayer(
    name: string,
    isBot: boolean,
    ready: boolean,
    botDifficulty?: "easy" | "standard",
  ): RoomPlayer {
    return {
      id: randomUUID(),
      token: randomBytes(32).toString("base64url"),
      name,
      isBot,
      ...(botDifficulty ? { botDifficulty } : {}),
      ready,
      connected: true,
    };
  }

  private newRoomCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = "";
      for (let index = 0; index < 5; index += 1)
        code += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]!;
      if (!this.repository.get(code)) return code;
    }
    throw new ServiceError("INTERNAL_ERROR", "Unable to allocate a room code");
  }

  private rememberAction(
    room: Room,
    actionId: string,
    playerId: string,
    fingerprint: string,
  ): void {
    room.processedActions.set(actionId, { playerId, fingerprint });
    while (room.processedActions.size > MAX_PROCESSED_ACTIONS) {
      const oldest = room.processedActions.keys().next().value;
      if (oldest === undefined) break;
      room.processedActions.delete(oldest);
    }
  }

  private activity(
    message: string,
    tone: Activity["tone"] = "neutral",
  ): Activity {
    return { id: randomUUID(), message, tone };
  }
}
