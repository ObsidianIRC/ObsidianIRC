import { describe, expect, it } from "vitest";
import {
  buildServerConnectionUrl,
  getServerConnectionFields,
} from "../../src/lib/serverConnectionUrl";

describe("serverConnectionUrl", () => {
  it("splits ircs urls into hostname and port fields", () => {
    expect(
      getServerConnectionFields("ircs://irc.h4ks.com:6697", "6697", false),
    ).toEqual({
      host: "irc.h4ks.com",
      port: "6697",
      useWebSocket: false,
    });
  });

  it("splits wss urls into hostname and port fields", () => {
    expect(
      getServerConnectionFields("wss://irc.h4ks.com:443", "443", true),
    ).toEqual({
      host: "irc.h4ks.com",
      port: "443",
      useWebSocket: true,
    });
  });

  it("extracts a trailing port from plain host input", () => {
    expect(
      getServerConnectionFields("irc.h4ks.com:6697", "443", false),
    ).toEqual({
      host: "irc.h4ks.com",
      port: "6697",
      useWebSocket: false,
    });
  });

  it("builds ircs endpoints for tauri raw connections", () => {
    expect(
      buildServerConnectionUrl("ircs://irc.h4ks.com:6697", 6697, {
        isTauri: true,
        useWebSocket: false,
      }),
    ).toBe("ircs://irc.h4ks.com:6697");
  });

  it("builds wss endpoints for tauri websocket mode", () => {
    expect(
      buildServerConnectionUrl("irc.h4ks.com", 443, {
        isTauri: true,
        useWebSocket: true,
      }),
    ).toBe("wss://irc.h4ks.com:443");
  });

  it("always builds wss endpoints on web", () => {
    expect(
      buildServerConnectionUrl("ircs://irc.h4ks.com:6697", 443, {
        isTauri: false,
        useWebSocket: false,
      }),
    ).toBe("wss://irc.h4ks.com:443");
  });
});
