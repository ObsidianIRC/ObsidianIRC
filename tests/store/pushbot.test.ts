import { beforeEach, describe, expect, it } from "vitest";
import ircClient from "../../src/lib/ircClient";
import useStore from "../../src/store";

function setupServer() {
  useStore.setState({
    servers: [
      {
        id: "srv-1",
        name: "TestServer",
        host: "irc.example.com",
        port: 6667,
        channels: [],
        privateChats: [],
        isConnected: true,
        users: [],
      },
    ],
  });
}

function encodeBotCmds(commands: unknown): string {
  const json = JSON.stringify({ version: 1, commands });
  // browser-style btoa via Buffer for tests
  return Buffer.from(json, "utf8").toString("base64").replace(/=+$/, "");
}

describe("pushbot store handler", () => {
  beforeEach(() => {
    setupServer();
  });

  it("caches commands when TAGMSG carries +draft/bot-cmds", () => {
    ircClient.triggerEvent("TAGMSG", {
      serverId: "srv-1",
      sender: "Weather",
      channelName: "ourNick",
      mtags: {
        "+draft/bot-cmds": encodeBotCmds([
          { name: "forecast", description: "Look up the weather" },
        ]),
      },
      timestamp: new Date(),
    });

    const server = useStore.getState().servers[0];
    expect(server.botCommands).toBeDefined();
    expect(server.botCommands?.weather).toEqual([
      { name: "forecast", description: "Look up the weather" },
    ]);
  });

  it("invalidates the cache on +draft/bot-cmds-changed", () => {
    useStore.setState((s) => ({
      servers: s.servers.map((srv) => ({
        ...srv,
        botCommands: { weather: [{ name: "forecast" }] },
      })),
    }));

    ircClient.triggerEvent("TAGMSG", {
      serverId: "srv-1",
      sender: "Weather",
      channelName: "ourNick",
      mtags: { "+draft/bot-cmds-changed": "1" },
      timestamp: new Date(),
    });

    const server = useStore.getState().servers[0];
    expect(server.botCommands?.weather).toBeUndefined();
  });

  it("ignores TAGMSGs without bot-cmds tags", () => {
    ircClient.triggerEvent("TAGMSG", {
      serverId: "srv-1",
      sender: "Weather",
      channelName: "#general",
      mtags: { "+typing": "active" },
      timestamp: new Date(),
    });
    const server = useStore.getState().servers[0];
    expect(server.botCommands).toBeUndefined();
  });
});
