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

import { TCPSocket } from "../../src/lib/socket";

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
