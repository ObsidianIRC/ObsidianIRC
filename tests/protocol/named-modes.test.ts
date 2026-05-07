import { describe, expect, test, vi } from "vitest";
import {
  handleProp,
  handleRplChmodelist,
  handleRplProplist,
  handleRplUmodelist,
} from "../../src/lib/irc/handlers/named-modes";
import type { IRCClientContext } from "../../src/lib/irc/IRCClientContext";
import ircClient from "../../src/lib/ircClient";

function makeCtx() {
  const events: Array<{ name: string; payload: unknown }> = [];
  const ctx = {
    triggerEvent: vi.fn((name: string, payload: unknown) => {
      events.push({ name, payload });
    }),
    activeBatches: new Map(),
  } as unknown as IRCClientContext;
  return { ctx, events };
}

describe("named-modes protocol handlers", () => {
  test("RPL_CHMODELIST parses single-line burst", () => {
    const { ctx, events } = makeCtx();
    // Realistic parv: IRCClient already strips the leading `:` from
    // the trailing parameter, so the parser just sees the entries.
    handleRplChmodelist(
      ctx,
      "srv1",
      "obby.t3ks.com",
      ["myself", "5:op=o", "5:voice=v", "1:ban=b", "4:topiclock=t"],
      undefined,
    );
    expect(events).toHaveLength(1);
    const ev = events[0].payload as {
      isFinal: boolean;
      entries: Array<{ type: number; name: string; letter?: string }>;
    };
    expect(ev.isFinal).toBe(true);
    expect(ev.entries).toEqual([
      { type: 5, name: "op", letter: "o" },
      { type: 5, name: "voice", letter: "v" },
      { type: 1, name: "ban", letter: "b" },
      { type: 4, name: "topiclock", letter: "t" },
    ]);
  });

  test("RPL_CHMODELIST handles continuation marker (asterisk)", () => {
    const { ctx, events } = makeCtx();
    handleRplChmodelist(
      ctx,
      "srv1",
      "obby.t3ks.com",
      ["myself", "*", "5:op=o 4:topiclock=t"],
      undefined,
    );
    const ev = events[0].payload as { isFinal: boolean };
    expect(ev.isFinal).toBe(false);
  });

  test("RPL_CHMODELIST drops malformed and unknown-type entries", () => {
    const { ctx, events } = makeCtx();
    handleRplChmodelist(
      ctx,
      "srv1",
      "obby.t3ks.com",
      ["myself", "5:op=o", "garbage", "9:future=z", "4:noctcp=C"],
      undefined,
    );
    const ev = events[0].payload as {
      entries: Array<{ name: string }>;
    };
    expect(ev.entries.map((e) => e.name)).toEqual(["op", "noctcp"]);
  });

  test("RPL_UMODELIST parses name-only entries (no letter)", () => {
    const { ctx, events } = makeCtx();
    handleRplUmodelist(
      ctx,
      "srv1",
      "obby.t3ks.com",
      ["myself", "4:invisible=i 4:obsidianirc/futureflag"],
      undefined,
    );
    const ev = events[0].payload as {
      entries: Array<{ name: string; letter?: string }>;
    };
    expect(ev.entries).toEqual([
      { type: 4, name: "invisible", letter: "i" },
      { type: 4, name: "obsidianirc/futureflag", letter: undefined },
    ]);
  });

  test("PROP parses sign + name + optional param items", () => {
    const { ctx, events } = makeCtx();
    handleProp(
      ctx,
      "srv1",
      "alice!~a@host",
      ["#egypt", "+key=pyramids", "-topiclock", "+ban=*!*@spam.example"],
      undefined,
    );
    const ev = events[0].payload as {
      target: string;
      sender: string;
      items: Array<{ sign: string; name: string; param?: string }>;
    };
    expect(ev.target).toBe("#egypt");
    expect(ev.sender).toBe("alice");
    expect(ev.items).toEqual([
      { sign: "+", name: "key", param: "pyramids" },
      { sign: "-", name: "topiclock", param: undefined },
      { sign: "+", name: "ban", param: "*!*@spam.example" },
    ]);
  });

  test("PROP defaults to + when item has no explicit sign", () => {
    const { ctx, events } = makeCtx();
    handleProp(
      ctx,
      "srv1",
      "alice!~a@host",
      ["#chan", "key=pyramids"],
      undefined,
    );
    const ev = events[0].payload as {
      items: Array<{ sign: string; name: string }>;
    };
    expect(ev.items[0].sign).toBe("+");
  });

  test("RPL_PROPLIST flattens space-packed trailing items", () => {
    const { ctx, events } = makeCtx();
    handleRplProplist(
      ctx,
      "srv1",
      "obby.t3ks.com",
      ["myself", "#egypt", "topiclock", "noextmsg", "limit=5"],
      undefined,
    );
    const ev = events[0].payload as { channel: string; items: string[] };
    expect(ev.channel).toBe("#egypt");
    expect(ev.items).toEqual(["topiclock", "noextmsg", "limit=5"]);
  });
});

// sendNamedMode is on the IRCClient class proper. We test it by
// constructing a stub that captures sendRaw output, since hand-rolling
// the full IRCClient lifecycle inside a unit test is overkill and
// brittle. The decision logic (PROP vs MODE, name->letter mapping,
// drop-when-no-letter) is what matters.
describe("sendNamedMode outbound translation", () => {
  type Item = { sign: "+" | "-"; name: string; param?: string };
  type Registry = {
    supported: boolean;
    channelModes: Array<{ name: string; letter?: string }>;
    userModes: Array<{ name: string; letter?: string }>;
  };

  // Spy on sendRaw on the singleton ircClient so the real method runs
  // through its real `this`, exercising the shared codepath. Each
  // call resets the spy so tests are independent.
  function callSendNamedMode(
    target: string,
    items: Item[],
    registry?: Registry,
  ): string | null {
    let captured: string | null = null;
    const spy = vi
      .spyOn(ircClient, "sendRaw")
      .mockImplementation((_serverId: string, cmd: string) => {
        captured = cmd;
      });
    ircClient.sendNamedMode("srv1", target, items, registry);
    spy.mockRestore();
    return captured;
  }

  const fullRegistry: Registry = {
    supported: true,
    channelModes: [
      { name: "op", letter: "o" },
      { name: "voice", letter: "v" },
      { name: "topiclock", letter: "t" },
      { name: "ban", letter: "b" },
      { name: "obsidianirc/futureflag" }, // name-only
    ],
    userModes: [
      { name: "invisible", letter: "i" },
      { name: "wallops", letter: "w" },
    ],
  };

  test("emits MODE when every requested mode has a letter", () => {
    const out = callSendNamedMode(
      "#chan",
      [
        { sign: "+", name: "op", param: "alice" },
        { sign: "-", name: "topiclock" },
      ],
      fullRegistry,
    );
    expect(out).toBe("MODE #chan +o-t alice");
  });

  test("emits PROP when the cap is on and a name-only mode is requested", () => {
    const out = callSendNamedMode(
      "#chan",
      [
        { sign: "+", name: "obsidianirc/futureflag" },
        { sign: "+", name: "op", param: "bob" },
      ],
      fullRegistry,
    );
    expect(out).toBe("PROP #chan +obsidianirc/futureflag +op=bob");
  });

  test("drops name-only items when cap is unsupported and falls back to MODE", () => {
    const out = callSendNamedMode(
      "#chan",
      [
        { sign: "+", name: "obsidianirc/futureflag" },
        { sign: "+", name: "op", param: "bob" },
      ],
      { ...fullRegistry, supported: false },
    );
    expect(out).toBe("MODE #chan +o bob");
  });

  test("returns null (no send) when nothing is resolvable", () => {
    const out = callSendNamedMode(
      "#chan",
      [{ sign: "+", name: "obsidianirc/futureflag" }],
      { ...fullRegistry, supported: false },
    );
    expect(out).toBeNull();
  });

  test("user target uses userModes registry", () => {
    const out = callSendNamedMode(
      "alice",
      [{ sign: "+", name: "invisible" }],
      fullRegistry,
    );
    expect(out).toBe("MODE alice +i");
  });

  test("collapses repeated signs ('+', '+') into a single sign group", () => {
    const out = callSendNamedMode(
      "#chan",
      [
        { sign: "+", name: "op", param: "alice" },
        { sign: "+", name: "voice", param: "bob" },
      ],
      fullRegistry,
    );
    expect(out).toBe("MODE #chan +ov alice bob");
  });
});
