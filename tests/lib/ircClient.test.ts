import { beforeEach, describe, expect, test, vi } from "vitest";
import { IRCClient } from "../../src/lib/ircClient";
import type { Server } from "../../src/types";

interface WebSocketEventMap {
  open: Event;
  message: MessageEvent;
  close: CloseEvent;
  error: ErrorEvent;
}

interface WebSocketInstance extends EventTarget {
  readyState: number;
  url: string;
  onopen: ((event: WebSocketEventMap["open"]) => void) | null;
  onmessage: ((event: WebSocketEventMap["message"]) => void) | null;
  onclose: ((event: WebSocketEventMap["close"]) => void) | null;
  onerror: ((event: WebSocketEventMap["error"]) => void) | null;
  send(data: string): void;
  close(): void;
}

// Mock WebSocket
class MockWebSocket implements WebSocket {
  private onOpenCallback: ((event: WebSocketEventMap["open"]) => void) | null =
    null;
  private onMessageCallback:
    | ((event: WebSocketEventMap["message"]) => void)
    | null = null;
  private onCloseCallback:
    | ((event: WebSocketEventMap["close"]) => void)
    | null = null;
  private onErrorCallback:
    | ((event: WebSocketEventMap["error"]) => void)
    | null = null;
  private eventTarget: EventTarget;

  // Required WebSocket properties
  public readyState: number = WebSocket.CONNECTING;
  public bufferedAmount = 0;
  public extensions = "";
  public protocol = "";
  public binaryType: BinaryType = "blob";
  public url: string;
  public sentMessages: string[] = [];

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocol = Array.isArray(protocols) ? protocols[0] : protocols || "";
    this.eventTarget = new EventTarget();
  }

  addEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (event: WebSocketEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.eventTarget.addEventListener(type, listener as EventListener, options);
  }

  removeEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (event: WebSocketEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void {
    this.eventTarget.removeEventListener(
      type,
      listener as EventListener,
      options,
    );
  }

  dispatchEvent(event: Event): boolean {
    return this.eventTarget.dispatchEvent(event);
  }

  set onopen(callback: (event: WebSocketEventMap["open"]) => void) {
    this.onOpenCallback = callback;
  }

  set onmessage(callback: (event: WebSocketEventMap["message"]) => void) {
    this.onMessageCallback = callback;
  }

  set onclose(callback: (event: WebSocketEventMap["close"]) => void) {
    this.onCloseCallback = callback;
  }

  set onerror(callback: (event: WebSocketEventMap["error"]) => void) {
    this.onErrorCallback = callback;
  }

  send(message: string): void {
    this.sentMessages.push(message);
  }

  close(): void {
    if (this.onCloseCallback) {
      this.onCloseCallback(new CloseEvent("close"));
    }
  }

  // Helper methods for testing
  simulateOpen(): void {
    if (this.onOpenCallback) {
      this.onOpenCallback(new Event("open"));
    }
  }

  simulateMessage(data: string): void {
    if (this.onMessageCallback) {
      this.onMessageCallback(new MessageEvent("message", { data }));
    }
  }

  simulateError(error: Error): void {
    if (this.onErrorCallback) {
      this.onErrorCallback(new ErrorEvent("error", { error }));
    }
  }
}

interface WebSocketConstructor {
  new (url: string): WebSocketInstance;
  readonly CONNECTING: 0;
  readonly OPEN: 1;
  readonly CLOSING: 2;
  readonly CLOSED: 3;
  prototype: WebSocketInstance;
}

// Replace global WebSocket with mock
const MockWebSocketClass = MockWebSocket as unknown as WebSocketConstructor;
vi.stubGlobal("WebSocket", MockWebSocketClass);

describe("IRCClient", () => {
  let client: IRCClient;

  beforeEach(() => {
    client = new IRCClient();
    vi.clearAllMocks();
  });

  describe("connect", () => {
    test("should connect to IRC server successfully", async () => {
      // Create a promise that will resolve when the connection is fully established
      const mockSocket = new MockWebSocket("ws://irc.example.com:443");
      vi.spyOn(global, "WebSocket").mockImplementation(() => mockSocket);

      const connectionPromise = client.connect(
        "irc.example.com",
        443,
        "testuser",
      );

      // Simulate successful connection
      mockSocket.simulateOpen();

      const server = await connectionPromise;

      expect(server).toBeDefined();
      expect(server.name).toBe("irc.example.com");
      expect(server.isConnected).toBe(true);

      // Verify sent messages
      expect(mockSocket.sentMessages).toContain("CAP LS 302");
      expect(mockSocket.sentMessages).toContain("NICK testuser");
      expect(mockSocket.sentMessages).toContain("USER testuser 0 * :testuser");
    });

    test("should handle connection errors", async () => {
      const mockSocket = new MockWebSocket("ws://irc.example.com:443");
      vi.spyOn(global, "WebSocket").mockImplementation(() => mockSocket);

      const connectionPromise = client.connect(
        "irc.example.com",
        443,
        "testuser",
      );

      // Simulate error before connection completes
      mockSocket.simulateError(new Error("Connection failed"));

      await expect(connectionPromise).rejects.toThrow("Failed to connect");
    });
  });

  describe("message handling", () => {
    test("should handle PRIVMSG correctly", async () => {
      const mockSocket = new MockWebSocket("ws://irc.example.com:443");
      vi.spyOn(global, "WebSocket").mockImplementation(() => mockSocket);

      const connectionPromise = client.connect(
        "irc.example.com",
        443,
        "testuser",
      );

      mockSocket.simulateOpen();
      const server = await connectionPromise;

      // Set up event listener
      let receivedMessage: unknown;
      const messagePromise = new Promise<void>((resolve) => {
        client.on("PRIVMSG", (msg) => {
          receivedMessage = msg;
          resolve();
        });
      });

      // Simulate receiving a PRIVMSG
      mockSocket.simulateMessage(
        "@time=2023-01-01T12:00:00.000Z :nick!user@host PRIVMSG #channel :Hello, world!\r\n",
      );

      await messagePromise;

      expect(receivedMessage).toEqual({
        serverId: server.id,
        messageTags: expect.any(Object),
        sender: "nick",
        channelName: "#channel",
        message: "Hello, world!",
        timestamp: expect.any(Date),
      });
    });
  });

  describe("channel operations", () => {
    let mockSocket: MockWebSocket;
    let server: Server;

    beforeEach(async () => {
      mockSocket = new MockWebSocket("ws://irc.example.com:443");
      vi.spyOn(global, "WebSocket").mockImplementation(() => mockSocket);

      const connectionPromise = client.connect(
        "irc.example.com",
        443,
        "testuser",
      );

      mockSocket.simulateOpen();
      server = await connectionPromise;
    });

    test("should join channel successfully", async () => {
      const channel = client.joinChannel(server.id, "#testchannel");

      expect(channel).toBeDefined();
      expect(channel.name).toBe("#testchannel");
      expect(mockSocket.sentMessages).toContain("JOIN #testchannel");
    });

    test("should leave channel successfully", async () => {
      const channel = client.joinChannel(server.id, "#testchannel");
      client.leaveChannel(server.id, "#testchannel");

      expect(mockSocket.sentMessages).toContain("PART #testchannel");
      expect(client.getServers()[0].channels).not.toContain(channel);
    });
  });
});
