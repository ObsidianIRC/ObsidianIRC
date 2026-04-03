import { beforeEach, describe, expect, it } from "vitest";
import ircClient from "../../src/lib/ircClient";
import useStore from "../../src/store";
import type { Channel, Message } from "../../src/types";

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "chan-1",
    name: "#test",
    isPrivate: false,
    serverId: "srv-1",
    unreadCount: 0,
    isMentioned: false,
    messages: [],
    users: [{ id: "alice-id", username: "alice", isOnline: true }],
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    type: "message",
    content: "hello",
    timestamp: new Date("2026-01-01T12:00:00.000Z"),
    userId: "alice",
    channelId: "chan-1",
    serverId: "srv-1",
    reactions: [],
    replyMessage: null,
    mentioned: [],
    ...overrides,
  };
}

function setupServer() {
  useStore.setState({
    servers: [
      {
        id: "srv-1",
        name: "TestServer",
        host: "irc.example.com",
        port: 6667,
        ssl: false,
        channels: [makeChannel()],
        privateChats: [],
        isConnected: true,
        isConnecting: false,
        capabilities: ["draft/chathistory"],
      },
    ],
    messages: {},
    activeBatches: {},
  } as any);
}

describe("chathistory batch — PART events", () => {
  beforeEach(() => {
    setupServer();
  });

  it("historical PART inside chathistory batch: member list unchanged, historical message created", () => {
    // Set up an active chathistory batch
    useStore.setState({
      activeBatches: {
        "srv-1": {
          batch42: {
            type: "chathistory",
            parameters: ["#test"],
            events: [],
            startTime: new Date(),
            messageCount: 0,
          },
        },
      },
    });

    ircClient.triggerEvent("PART", {
      serverId: "srv-1",
      username: "alice",
      channelName: "#test",
      reason: "bye",
      batchTag: "batch42",
      time: "2026-01-01T11:00:00.000Z",
    });

    const server = useStore.getState().servers.find((s) => s.id === "srv-1");
    const channel = server?.channels.find((c) => c.name === "#test");
    // member list must not change — alice is still in the channel
    expect(channel?.users.some((u) => u.username === "alice")).toBe(true);
    // a historical part message is created with the server timestamp
    const msgs = useStore.getState().messages["srv-1-chan-1"] ?? [];
    const partMsgs = msgs.filter((m) => m.type === "part");
    expect(partMsgs).toHaveLength(1);
    expect(partMsgs[0].timestamp).toEqual(new Date("2026-01-01T11:00:00.000Z"));
  });

  it("processes PART normally when not inside a chathistory batch", () => {
    // No active batches
    ircClient.triggerEvent("PART", {
      serverId: "srv-1",
      username: "alice",
      channelName: "#test",
      reason: "",
    });

    const server = useStore.getState().servers.find((s) => s.id === "srv-1");
    const channel = server?.channels.find((c) => c.name === "#test");
    expect(channel?.users.some((u) => u.username === "alice")).toBe(false);
  });
});

describe("chathistory batch — NICK events", () => {
  beforeEach(() => {
    setupServer();
  });

  it("historical NICK inside chathistory batch: member list unchanged, historical message created", () => {
    useStore.setState({
      activeBatches: {
        "srv-1": {
          batchNick: {
            type: "chathistory",
            parameters: ["#test"],
            events: [],
            startTime: new Date(),
            messageCount: 0,
          },
        },
      },
    });

    ircClient.triggerEvent("NICK", {
      serverId: "srv-1",
      mtags: { batch: "batchNick", time: "2026-01-01T11:00:00.000Z" },
      batchTag: "batchNick",
      oldNick: "alice",
      newNick: "alice2",
    });

    const server = useStore.getState().servers.find((s) => s.id === "srv-1");
    const channel = server?.channels.find((c) => c.name === "#test");
    // member list must not change — alice is still alice
    expect(channel?.users.some((u) => u.username === "alice")).toBe(true);
    expect(channel?.users.some((u) => u.username === "alice2")).toBe(false);
    // a historical nick message is created with the server timestamp
    const msgs = useStore.getState().messages["srv-1-chan-1"] ?? [];
    const nickMsgs = msgs.filter((m) => m.type === "nick");
    expect(nickMsgs).toHaveLength(1);
    expect(nickMsgs[0].timestamp).toEqual(new Date("2026-01-01T11:00:00.000Z"));
  });

  it("processes NICK normally when not in a chathistory batch", () => {
    ircClient.triggerEvent("NICK", {
      serverId: "srv-1",
      mtags: undefined,
      oldNick: "alice",
      newNick: "alice2",
    });

    const server = useStore.getState().servers.find((s) => s.id === "srv-1");
    const channel = server?.channels.find((c) => c.name === "#test");
    expect(channel?.users.some((u) => u.username === "alice2")).toBe(true);
    expect(channel?.users.some((u) => u.username === "alice")).toBe(false);
  });
});

describe("chathistory batch end — hasMoreHistory", () => {
  beforeEach(() => {
    setupServer();
    useStore.setState({
      messages: {
        "srv-1-chan-1": [makeMessage()],
      },
    });
  });

  it("sets hasMoreHistory=true when batch had messages", () => {
    useStore.setState({
      activeBatches: {
        "srv-1": {
          batchH: {
            type: "chathistory",
            parameters: ["#test"],
            events: [],
            startTime: new Date(),
            messageCount: 10,
          },
        },
      },
    });

    ircClient.triggerEvent("BATCH_END", {
      serverId: "srv-1",
      batchId: "batchH",
    });

    const server = useStore.getState().servers.find((s) => s.id === "srv-1");
    const channel = server?.channels.find((c) => c.name === "#test");
    expect(channel?.hasMoreHistory).toBe(true);
  });

  it("sets hasMoreHistory=false when batch had no messages (reached beginning)", () => {
    useStore.setState({
      activeBatches: {
        "srv-1": {
          batchEmpty: {
            type: "chathistory",
            parameters: ["#test"],
            events: [],
            startTime: new Date(),
            messageCount: 0,
          },
        },
      },
    });

    ircClient.triggerEvent("BATCH_END", {
      serverId: "srv-1",
      batchId: "batchEmpty",
    });

    const server = useStore.getState().servers.find((s) => s.id === "srv-1");
    const channel = server?.channels.find((c) => c.name === "#test");
    expect(channel?.hasMoreHistory).toBe(false);
  });

  it("sorts messages chronologically after batch ends", () => {
    const older = makeMessage({
      id: "old",
      timestamp: new Date("2026-01-01T10:00:00.000Z"),
    });
    const newer = makeMessage({
      id: "new",
      timestamp: new Date("2026-01-01T12:00:00.000Z"),
    });
    // Simulate BEFORE batch appending older messages after newer ones
    useStore.setState({
      messages: { "srv-1-chan-1": [newer, older] },
      activeBatches: {
        "srv-1": {
          batchSort: {
            type: "chathistory",
            parameters: ["#test"],
            events: [],
            startTime: new Date(),
            messageCount: 1,
          },
        },
      },
    });

    ircClient.triggerEvent("BATCH_END", {
      serverId: "srv-1",
      batchId: "batchSort",
    });

    const msgs = useStore.getState().messages["srv-1-chan-1"];
    expect(msgs?.[0].id).toBe("old");
    expect(msgs?.[1].id).toBe("new");
  });
});
