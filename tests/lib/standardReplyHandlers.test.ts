import { describe, expect, test, vi } from "vitest";
import {
  handleFail,
  handleNote,
  handleSuccess,
  handleWarn,
} from "../../src/lib/irc/handlers/auth";
import type { IRCClientContext } from "../../src/lib/irc/IRCClientContext";

function makeCtx() {
  const triggered: { event: string; data: unknown }[] = [];
  const ctx = {
    triggerEvent: vi.fn((event: string, data: unknown) =>
      triggered.push({ event, data }),
    ),
  } as unknown as IRCClientContext;
  return { ctx, triggered };
}

// Mirror the parser's contract: trailing param is stripped of its leading
// `:` and pushed onto parv as the last element when present.
function parsedFromWire(line: string): {
  parv: string[];
  trailing: string;
} {
  // line is the body after the source prefix and the verb (e.g. "AUTHENTICATE BANNED #foo :Reason")
  const colonIdx = line.indexOf(" :");
  let mainPart = line;
  let trailing = "";
  if (colonIdx !== -1) {
    trailing = line.substring(colonIdx + 2);
    mainPart = line.substring(0, colonIdx);
  }
  const parv = mainPart.split(" ").filter((p) => p.length > 0);
  if (trailing) parv.push(trailing);
  return { parv, trailing };
}

describe("standard-replies handlers — parsing", () => {
  test("FAIL preserves the description verbatim (no off-by-one)", () => {
    const { ctx, triggered } = makeCtx();
    const { parv, trailing } = parsedFromWire(
      "JOIN BANNED #foo :You are banned from this channel",
    );
    handleFail(ctx, "srv", "server", parv, undefined, trailing);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].event).toBe("FAIL");
    const data = triggered[0].data as {
      command: string;
      code: string;
      target?: string;
      context: string[];
      message: string;
    };
    expect(data.command).toBe("JOIN");
    expect(data.code).toBe("BANNED");
    expect(data.context).toEqual(["#foo"]);
    expect(data.target).toBe("#foo");
    expect(data.message).toBe("You are banned from this channel");
  });

  test("FAIL with no context: description is the trailing param, not parv[2]", () => {
    const { ctx, triggered } = makeCtx();
    const { parv, trailing } = parsedFromWire(
      "ACC REG_INVALID_EMAIL :That email is not valid",
    );
    handleFail(ctx, "srv", "server", parv, undefined, trailing);
    const data = triggered[0].data as {
      context: string[];
      target?: string;
      message: string;
    };
    expect(data.context).toEqual([]);
    expect(data.target).toBeUndefined();
    expect(data.message).toBe("That email is not valid");
  });

  test("FAIL with multiple context strings", () => {
    const { ctx, triggered } = makeCtx();
    const { parv, trailing } = parsedFromWire(
      "PRIVMSG CANNOT_SEND #foo alice :You are not in the channel",
    );
    handleFail(ctx, "srv", "server", parv, undefined, trailing);
    const data = triggered[0].data as {
      context: string[];
      message: string;
    };
    expect(data.context).toEqual(["#foo", "alice"]);
    expect(data.message).toBe("You are not in the channel");
  });

  test("WARN preserves description", () => {
    const { ctx, triggered } = makeCtx();
    const { parv, trailing } = parsedFromWire(
      "PRIVMSG MESSAGE_TOO_LONG :Your message was truncated",
    );
    handleWarn(ctx, "srv", "server", parv, undefined, trailing);
    expect((triggered[0].data as { message: string }).message).toBe(
      "Your message was truncated",
    );
  });

  test("NOTE preserves description", () => {
    const { ctx, triggered } = makeCtx();
    const { parv, trailing } = parsedFromWire(
      "REGISTER ACCOUNT_HELD :Your account is held for review",
    );
    handleNote(ctx, "srv", "server", parv, undefined, trailing);
    expect((triggered[0].data as { message: string }).message).toBe(
      "Your account is held for review",
    );
  });

  test("SUCCESS preserves description", () => {
    const { ctx, triggered } = makeCtx();
    const { parv, trailing } = parsedFromWire(
      "REGISTER REGISTRATION_SUCCESS alice :You are now registered",
    );
    handleSuccess(ctx, "srv", "server", parv, undefined, trailing);
    const data = triggered[0].data as {
      context: string[];
      message: string;
    };
    expect(data.context).toEqual(["alice"]);
    expect(data.message).toBe("You are now registered");
  });

  test("description starting with a printable character is not corrupted", () => {
    // Regression for the original `.substring(1)` bug which chopped the first
    // character off every description.
    const { ctx, triggered } = makeCtx();
    const { parv, trailing } = parsedFromWire(
      "JOIN BANNED #foo :Yikes, banned",
    );
    handleFail(ctx, "srv", "server", parv, undefined, trailing);
    expect((triggered[0].data as { message: string }).message).toBe(
      "Yikes, banned",
    );
  });
});
