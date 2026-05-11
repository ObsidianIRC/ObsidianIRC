import { describe, expect, test } from "vitest";
import {
  escapeTagValue,
  parseMessageTags,
  unescapeTagValue,
} from "../../src/lib/ircUtils";

describe("escapeTagValue / unescapeTagValue", () => {
  test("round-trips printable ASCII", () => {
    const original = "hello world; foo=bar\\baz\r\n";
    expect(unescapeTagValue(escapeTagValue(original))).toBe(original);
  });

  test("escapes per IRCv3 message-tags spec", () => {
    expect(escapeTagValue(";")).toBe("\\:");
    expect(escapeTagValue(" ")).toBe("\\s");
    expect(escapeTagValue("\\")).toBe("\\\\");
    expect(escapeTagValue("\r")).toBe("\\r");
    expect(escapeTagValue("\n")).toBe("\\n");
  });

  test("unescape handles stray backslashes by stripping them", () => {
    expect(unescapeTagValue("\\x")).toBe("x");
    expect(unescapeTagValue("\\")).toBe("\\");
  });

  test("base64 round-trips without escape changes", () => {
    const b64 = "SGVsbG8sIFdvcmxkIQ==";
    expect(escapeTagValue(b64)).toBe(b64);
  });
});

describe("parseMessageTags", () => {
  test("parses simple tags", () => {
    expect(parseMessageTags("@a=b;c=d")).toEqual({ a: "b", c: "d" });
  });

  test("decodes escape sequences", () => {
    expect(parseMessageTags("@k=a\\sb\\:c")).toEqual({ k: "a b;c" });
  });

  test("handles flag tags (no value)", () => {
    expect(parseMessageTags("@bot;account=x")).toEqual({
      bot: "",
      account: "x",
    });
  });

  test("preserves base64 in value", () => {
    const b64 = "SGVsbG8=";
    expect(parseMessageTags(`@+webxdc/payload=${b64}`)).toEqual({
      "+webxdc/payload": b64,
    });
  });
});
