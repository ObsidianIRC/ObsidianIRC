import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

import {
  createSocket,
  resetSocketFactory,
  resolveSocketProtocol,
  resolveSocketTarget,
  setSocketFactory,
  TCPSocket,
} from "../../src/lib/socket";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function flushMicrotasks(iterations = 5): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

function getClientId(socket: TCPSocket): string {
  return (socket as unknown as { clientId: string }).clientId;
}

describe("TCPSocket", () => {
  let connectDeferred: ReturnType<typeof createDeferred<void>>;
  let unlistenMock: ReturnType<typeof vi.fn>;
  let tcpMessageListener:
    | ((event: {
        payload: {
          id: string;
          event: {
            message?: { data: number[] };
            error?: string;
            connected?: boolean;
          };
        };
      }) => void)
    | undefined;

  beforeEach(() => {
    connectDeferred = createDeferred<void>();
    unlistenMock = vi.fn();
    tcpMessageListener = undefined;

    listenMock.mockImplementation(async (_eventName, handler) => {
      tcpMessageListener = handler;
      return unlistenMock;
    });

    invokeMock.mockImplementation((command: string, payload?: unknown) => {
      switch (command) {
        case "connect":
          return connectDeferred.promise;
        case "listen":
          return Promise.resolve();
        case "disconnect":
          return Promise.resolve(payload);
        case "send":
          return Promise.resolve(payload);
        default:
          return Promise.resolve();
      }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetSocketFactory();
  });

  test("allows a custom socket factory to be injected", () => {
    const fakeSocket = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
    };

    const factory = vi.fn(() => fakeSocket);
    setSocketFactory(factory);

    const socket = createSocket("ircs://irc.example.com:6697");

    expect(factory).toHaveBeenCalledWith({
      url: "ircs://irc.example.com:6697",
      protocol: "ircs",
    });
    expect(socket).toBe(fakeSocket);
  });

  test("reset restores the default websocket routing", () => {
    const sentinelFactory = vi.fn(() => {
      throw new Error("custom factory should have been reset");
    });

    class MockSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readyState = MockSocket.CONNECTING;
      onopen = null;
      onmessage = null;
      onerror = null;
      onclose = null;

      constructor(public url: string) {
        super();
      }

      send() {}
      close() {}
    }

    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;

    setSocketFactory(sentinelFactory);
    resetSocketFactory();

    const socket = createSocket("wss://irc.example.com/webirc");

    expect(sentinelFactory).not.toHaveBeenCalled();
    expect(socket.constructor.name).toBe("WebSocketWrapper");

    if (originalWebSocket) {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  test("resolveSocketProtocol preserves current supported routing", () => {
    expect(resolveSocketProtocol("wss://irc.example.com/webirc")).toBe("wss");
    expect(resolveSocketProtocol("irc://irc.example.com:6667")).toBe("irc");
    expect(resolveSocketProtocol("ircs://irc.example.com:6697")).toBe("ircs");
    expect(() => resolveSocketProtocol("https://example.com/socket")).toThrow(
      "Unsupported socket protocol",
    );
  });

  test("resolveSocketTarget preserves secure websocket paths and query strings", () => {
    expect(
      resolveSocketTarget("wss://irc.example.com/webirc?token=abc", 443),
    ).toEqual({
      url: "wss://irc.example.com:443/webirc?token=abc",
      host: "irc.example.com",
      port: 443,
      protocol: "wss",
    });
  });

  test("resolveSocketTarget upgrades ws urls to the secure websocket transport", () => {
    expect(resolveSocketTarget("ws://irc.example.com/socket?x=1", 443)).toEqual(
      {
        url: "wss://irc.example.com:443/socket?x=1",
        host: "irc.example.com",
        port: 443,
        protocol: "wss",
      },
    );
  });

  test("resolveSocketTarget keeps irc and ircs parsing in the transport seam", () => {
    expect(
      resolveSocketTarget("ircs://irc.libera.chat:6697/#chat", 443),
    ).toEqual({
      url: "ircs://irc.libera.chat:6697",
      host: "irc.libera.chat",
      port: 6697,
      protocol: "ircs",
    });
  });

  test("close during connect suppresses a later onopen", async () => {
    const socket = new TCPSocket("irc://irc.example.com:6667");
    const onopen = vi.fn();
    const onclose = vi.fn();
    socket.onopen = onopen;
    socket.onclose = onclose;

    socket.close();

    expect(socket.readyState).toBe(2);

    connectDeferred.resolve();
    await flushMicrotasks();

    expect(invokeMock).toHaveBeenCalledWith("disconnect", {
      clientId: getClientId(socket),
    });
    expect(onopen).not.toHaveBeenCalled();
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(socket.readyState).toBe(3);
  });

  test("local close only emits onclose once when backend close arrives late", async () => {
    const socket = new TCPSocket("irc://irc.example.com:6667");
    const onclose = vi.fn();
    socket.onclose = onclose;

    connectDeferred.resolve();
    await flushMicrotasks();

    socket.close();
    await flushMicrotasks();

    tcpMessageListener?.({
      payload: {
        id: getClientId(socket),
        event: { connected: false },
      },
    });

    expect(onclose).toHaveBeenCalledTimes(1);
    expect(unlistenMock).toHaveBeenCalledTimes(1);
    expect(socket.readyState).toBe(3);
  });
});
