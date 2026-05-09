import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  defaultRedirectUri,
  deriveCodeChallenge,
  discoverOidc,
  generateCodeVerifier,
  getBuiltinOAuthConfig,
} from "../../src/lib/oauth";

describe("generateCodeVerifier / deriveCodeChallenge", () => {
  it("produces a 43-char base64url string with no padding", () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("derives an S256 challenge of the same shape", async () => {
    const v = generateCodeVerifier();
    const c = await deriveCodeChallenge(v);
    expect(c).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Must be deterministic for the same verifier.
    expect(await deriveCodeChallenge(v)).toBe(c);
  });

  it("matches a known RFC 7636 vector", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expected = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(await deriveCodeChallenge(verifier)).toBe(expected);
  });
});

describe("buildAuthorizeUrl", () => {
  it("includes PKCE + state + scope params", () => {
    const url = buildAuthorizeUrl(
      {
        issuer: "https://idp.example/",
        authorization_endpoint: "https://idp.example/oauth/authorize",
        token_endpoint: "https://idp.example/oauth/token",
      },
      {
        clientId: "abc",
        redirectUri: "https://app.example/oauth/callback",
        scope: "openid profile",
        state: "STATE",
        codeChallenge: "CHAL",
      },
    );
    const u = new URL(url);
    expect(u.searchParams.get("client_id")).toBe("abc");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://app.example/oauth/callback",
    );
    expect(u.searchParams.get("scope")).toBe("openid profile");
    expect(u.searchParams.get("state")).toBe("STATE");
    expect(u.searchParams.get("code_challenge")).toBe("CHAL");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("defaultRedirectUri", () => {
  it("derives <origin>/oauth/callback from window.location", () => {
    expect(defaultRedirectUri()).toBe(
      `${window.location.origin}/oauth/callback`,
    );
  });
});

describe("getBuiltinOAuthConfig", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns undefined when issuer is missing", () => {
    vi.stubGlobal("__DEFAULT_OAUTH_ISSUER__", undefined);
    vi.stubGlobal("__DEFAULT_OAUTH_CLIENT_ID__", "abc");
    expect(getBuiltinOAuthConfig()).toBeUndefined();
  });

  it("returns undefined when client_id is missing", () => {
    vi.stubGlobal("__DEFAULT_OAUTH_ISSUER__", "https://idp.example/");
    vi.stubGlobal("__DEFAULT_OAUTH_CLIENT_ID__", undefined);
    expect(getBuiltinOAuthConfig()).toBeUndefined();
  });

  it("returns the baked-in config when both issuer and client_id are set", () => {
    vi.stubGlobal("__DEFAULT_OAUTH_PROVIDER_LABEL__", "Logto");
    vi.stubGlobal("__DEFAULT_OAUTH_ISSUER__", "https://my.logto.app/oidc");
    vi.stubGlobal("__DEFAULT_OAUTH_CLIENT_ID__", "spa-id");
    vi.stubGlobal("__DEFAULT_OAUTH_SCOPES__", "openid profile");
    vi.stubGlobal(
      "__DEFAULT_OAUTH_REDIRECT_URI__",
      "https://app.example/oauth/callback",
    );
    expect(getBuiltinOAuthConfig()).toEqual({
      providerLabel: "Logto",
      issuer: "https://my.logto.app/oidc",
      clientId: "spa-id",
      scopes: "openid profile",
      redirectUri: "https://app.example/oauth/callback",
    });
  });

  it("falls back to a generic provider label", () => {
    vi.stubGlobal("__DEFAULT_OAUTH_PROVIDER_LABEL__", undefined);
    vi.stubGlobal("__DEFAULT_OAUTH_ISSUER__", "https://idp.example/");
    vi.stubGlobal("__DEFAULT_OAUTH_CLIENT_ID__", "abc");
    expect(getBuiltinOAuthConfig()?.providerLabel).toBe("OAuth");
  });
});

describe("discoverOidc", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    fetchMock.mockReset();
  });

  it("hits /.well-known/openid-configuration and returns parsed metadata", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        issuer: "https://idp.example/",
        authorization_endpoint: "https://idp.example/oauth/authorize",
        token_endpoint: "https://idp.example/oauth/token",
      }),
    });
    const meta = await discoverOidc("https://idp.example/test/");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://idp.example/test/.well-known/openid-configuration",
    );
    expect(meta.token_endpoint).toBe("https://idp.example/oauth/token");
  });

  it("rejects when the document misses required endpoints", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ issuer: "https://idp.example/missing/" }),
    });
    await expect(
      discoverOidc("https://idp.example/missing/"),
    ).rejects.toThrow();
  });
});
