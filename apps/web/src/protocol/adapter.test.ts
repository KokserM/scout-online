import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bindConnectionLifecycle,
  SocketProtocol,
  type CreateSocket,
} from "./adapter";

function createFakeSocket() {
  const handlers = new Map<string, ((payload?: unknown) => void)[]>();
  const socket = {
    connected: true,
    auth: {} as Record<string, unknown>,
    connect: vi.fn(function (this: { connected: boolean }) {
      this.connected = true;
    }),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return socket;
    }),
    trigger(event: string, payload?: unknown) {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
  return socket;
}

function createProtocol(socket = createFakeSocket()) {
  const factory = vi.fn(() => socket) as unknown as CreateSocket;
  return {
    protocol: new SocketProtocol(factory),
    factory,
    socket,
  };
}

describe("SocketProtocol reconnect", () => {
  it("does not construct a second socket on repeated connect", () => {
    const { protocol, factory } = createProtocol();
    protocol.connect("token-a");
    protocol.connect("token-b");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("reconnects an existing disconnected socket without creating another", () => {
    const { protocol, factory, socket } = createProtocol();
    protocol.connect("token-a");
    socket.connected = false;
    socket.connect.mockClear();
    protocol.ensureConnected();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it("does not call connect when the existing socket is already up", () => {
    const { protocol, socket } = createProtocol();
    protocol.connect();
    socket.connected = true;
    socket.connect.mockClear();
    protocol.ensureConnected();
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it("does nothing when no socket has been created", () => {
    const { protocol, factory, socket } = createProtocol();
    protocol.ensureConnected();
    expect(factory).not.toHaveBeenCalled();
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it("clears auth and the outbox when the session is replaced", () => {
    const { protocol, socket } = createProtocol();
    const onError = vi.fn();
    protocol.on("error", onError);
    protocol.connect("token-a");
    socket.connected = false;
    protocol.dispatch({ type: "set-ready", ready: true });
    socket.trigger("session:replaced");
    expect(socket.auth).toEqual({});
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SESSION_REPLACED" }),
    );
    socket.connected = true;
    protocol.ensureConnected();
    expect(socket.emit).not.toHaveBeenCalled();
  });
});

describe("bindConnectionLifecycle", () => {
  afterEach(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  it("nudges reconnect on visible, persisted pageshow, and online", () => {
    const ensureConnected = vi.fn();
    const unbind = bindConnectionLifecycle(ensureConnected);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(ensureConnected).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(ensureConnected).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("pageshow"));
    expect(ensureConnected).toHaveBeenCalledTimes(1);
    const persisted = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(persisted, "persisted", { value: true });
    window.dispatchEvent(persisted);
    expect(ensureConnected).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event("online"));
    expect(ensureConnected).toHaveBeenCalledTimes(3);

    unbind();
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    expect(ensureConnected).toHaveBeenCalledTimes(3);
  });
});
