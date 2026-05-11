import { describe, expect, it } from "vitest";
import {
  buildIrcv3BearerPayload,
  buildOauthBearerPayload,
  chunkSaslPayload,
} from "../../src/lib/saslFrames";

function decodeB64(b64: string): string {
  const bin = atob(b64);
  let out = "";
  for (let i = 0; i < bin.length; i++) {
    const ch = bin.charCodeAt(i);
    out += ch === 0 ? "\\0" : String.fromCharCode(ch);
  }
  return out;
}

describe("buildIrcv3BearerPayload", () => {
  it("formats [authzid]\\0type\\0token with empty authzid by default", () => {
    const b64 = buildIrcv3BearerPayload({ token: "TOK" });
    expect(decodeB64(b64)).toBe("\\0jwt\\0TOK");
  });

  it("respects an explicit authzid", () => {
    const b64 = buildIrcv3BearerPayload({
      token: "TOK",
      authzid: "alice",
      tokenType: "oauth2",
    });
    expect(decodeB64(b64)).toBe("alice\\0oauth2\\0TOK");
  });

  it("emits the opaque frame with provider hint in authzid", () => {
    const b64 = buildIrcv3BearerPayload({
      token: "gho_abc",
      tokenType: "opaque",
      authzid: "github",
    });
    expect(decodeB64(b64)).toBe("github\\0opaque\\0gho_abc");
  });

  it("preserves multibyte UTF-8 in the token", () => {
    const b64 = buildIrcv3BearerPayload({ token: "héllo" });
    const bin = atob(b64);
    // 0x00 j w t 0x00 h é(2 bytes utf-8: c3 a9) l l o
    expect(bin.length).toBe(1 + 3 + 1 + 6);
  });
});

describe("buildOauthBearerPayload", () => {
  it("emits the RFC 7628 GS2 frame", () => {
    const b64 = buildOauthBearerPayload({ token: "TOK", authzid: "alice" });
    const decoded = atob(b64);
    expect(decoded).toBe("n,a=alice,\x01auth=Bearer TOK\x01\x01");
  });

  it("includes optional host/port hints", () => {
    const b64 = buildOauthBearerPayload({
      token: "TOK",
      host: "irc.example.com",
      port: 6697,
    });
    const decoded = atob(b64);
    expect(decoded).toBe(
      "n,a=,\x01port=6697\x01host=irc.example.com\x01auth=Bearer TOK\x01\x01",
    );
  });
});

describe("chunkSaslPayload", () => {
  it("returns the input as a single chunk when shorter than 400", () => {
    expect(chunkSaslPayload("abc")).toEqual(["abc"]);
  });

  it("splits at every 400-character boundary", () => {
    const s = "x".repeat(950);
    const chunks = chunkSaslPayload(s);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(400);
    expect(chunks[1].length).toBe(400);
    expect(chunks[2].length).toBe(150);
  });

  it("appends a + sentinel when the final chunk is exactly 400 chars", () => {
    const s = "x".repeat(800);
    const chunks = chunkSaslPayload(s);
    expect(chunks).toEqual(["x".repeat(400), "x".repeat(400), "+"]);
  });
});
