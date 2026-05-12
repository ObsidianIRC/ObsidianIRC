import { describe, expect, test, vi } from "vitest";
import { handleChghost, handleSetname } from "../../src/lib/irc/handlers/users";
import type { IRCClientContext } from "../../src/lib/irc/IRCClientContext";
import { getHostFromNuh, getUserFromNuh } from "../../src/lib/irc/utils";

// ── Utility function tests ────────────────────────────────────────────────────

describe("getUserFromNuh", () => {
  test("extracts ident from a full NUH", () => {
    expect(getUserFromNuh(":alice!~u@bery6muzcsynw.irc")).toBe("~u");
  });

  test("extracts ident without leading colon", () => {
    expect(getUserFromNuh("alice!~u@bery6muzcsynw.irc")).toBe("~u");
  });

  test("returns empty string when no ! present", () => {
    expect(getUserFromNuh("alice")).toBe("");
  });
});

describe("getHostFromNuh", () => {
  test("extracts host from a full NUH", () => {
    expect(getHostFromNuh(":alice!~u@bery6muzcsynw.irc")).toBe(
      "bery6muzcsynw.irc",
    );
  });

  test("extracts host without leading colon", () => {
    expect(getHostFromNuh("alice!~u@mush.room")).toBe("mush.room");
  });

  test("returns empty string when no @ present", () => {
    expect(getHostFromNuh("alice")).toBe("");
  });
});

// ── Protocol handler tests ────────────────────────────────────────────────────
// We test the handler functions directly against a mock IRCClientContext.
// All imports in the handler file are type-only (erased at runtime), so this
// avoids transitively pulling in ircUtils.tsx -> dompurify.

type TestCtx = IRCClientContext & {
  events: Array<{ event: string; data: unknown }>;
};

function makeCtx(ourNick: string): TestCtx {
  const events: Array<{ event: string; data: unknown }> = [];
  return {
    nicks: new Map([["s1", ourNick]]),
    myIdents: new Map(),
    myHosts: new Map(),
    currentUsers: new Map(),
    servers: new Map(),
    pongTimeouts: new Map(),
    reconnectionTimeouts: new Map(),
    rateLimitedServers: new Map(),
    capNegotiationComplete: new Map(),
    activeBatches: new Map(),
    sendRaw: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: test helper needs generic signature
    triggerEvent(event: string, data: any) {
      events.push({ event, data });
    },
    isRateLimitError: vi.fn(() => false),
    startWebSocketPing: vi.fn(),
    userOnConnect: vi.fn(),
    onCapLs: vi.fn(),
    onCapAck: vi.fn(),
    onCapNew: vi.fn(),
    onCapDel: vi.fn(),
    events,
  } as unknown as TestCtx;
}

describe("handleChghost — self-prefix tracking", () => {
  test("updates myIdents and myHosts when CHGHOST is for our nick", () => {
    const ctx = makeCtx("alice");
    handleChghost(
      ctx,
      "s1",
      ":alice!~u@bery6muzcsynw.irc",
      ["~u", "mush.room"],
      undefined,
    );
    expect(ctx.myIdents.get("s1")).toBe("~u");
    expect(ctx.myHosts.get("s1")).toBe("mush.room");
  });

  test("does not touch myIdents/myHosts for another user's CHGHOST", () => {
    const ctx = makeCtx("alice");
    ctx.myIdents.set("s1", "~u");
    ctx.myHosts.set("s1", "alice.host");

    handleChghost(
      ctx,
      "s1",
      ":bob!~u@pjux5q38e6a8i.irc",
      ["~u", "chess.board"],
      undefined,
    );

    expect(ctx.myIdents.get("s1")).toBe("~u");
    expect(ctx.myHosts.get("s1")).toBe("alice.host");
  });

  test("emits CHGHOST event regardless of self/other", () => {
    const ctx = makeCtx("alice");
    handleChghost(
      ctx,
      "s1",
      ":bob!~u@pjux5q38e6a8i.irc",
      ["~u", "chess.board"],
      undefined,
    );
    expect(ctx.events).toHaveLength(1);
    expect(ctx.events[0].event).toBe("CHGHOST");
  });
});

describe("handleSetname — registration-burst prefix parsing", () => {
  test("includes ident and host when source is a full NUH", () => {
    const ctx = makeCtx("alice");
    handleSetname(
      ctx,
      "s1",
      ":alice!~u@bery6muzcsynw.irc",
      [":Real Name"],
      undefined,
    );
    const data = ctx.events[0].data as { ident?: string; host?: string };
    expect(data.ident).toBe("~u");
    expect(data.host).toBe("bery6muzcsynw.irc");
  });

  test("ident and host are undefined when source has no NUH", () => {
    const ctx = makeCtx("alice");
    handleSetname(ctx, "s1", "ergo.test", [":Real Name"], undefined);
    const data = ctx.events[0].data as { ident?: string; host?: string };
    expect(data.ident).toBeUndefined();
    expect(data.host).toBeUndefined();
  });

  test("emits SETNAME event with user and realname", () => {
    const ctx = makeCtx("alice");
    handleSetname(ctx, "s1", ":alice!~u@bery6muzcsynw.irc", [":r"], undefined);
    const data = ctx.events[0].data as { user: string; realname: string };
    expect(ctx.events[0].event).toBe("SETNAME");
    expect(data.user).toBe("alice");
    expect(data.realname).toBe(":r");
  });
});
