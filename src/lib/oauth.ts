// OAuth2 / OIDC client used to obtain a bearer token that the IRC server
// will accept via SASL IRCV3BEARER. We support any IdP that publishes an
// OIDC discovery document and issues JWT access or ID tokens (Logto, Auth0,
// Keycloak, Okta, ...).
//
// Flow:
//  1. discoverOidc(issuer) -- caches metadata
//  2. beginOauthLogin(config) -- opens a popup, waits for postMessage from
//     /oauth/callback, exchanges the auth code for tokens, returns them
//  3. caller stores the result on its ServerConfig.oauth and reconnects
//
// The redirect URI must be registered with the IdP. If the caller doesn't
// override it we use `<origin>/oauth/callback`, which the SPA serves via
// the OAuthCallback component.

import type { ServerOAuthConfig } from "../types";

export interface OidcMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri?: string;
  end_session_endpoint?: string;
  // Some providers omit this; we tolerate.
  code_challenge_methods_supported?: string[];
}

export interface OAuthTokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

export interface OAuthLoginResult {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  scope?: string;
}

const discoveryCache = new Map<string, OidcMetadata>();

export function defaultRedirectUri(): string {
  return `${window.location.origin}/oauth/callback`;
}

export async function discoverOidc(issuer: string): Promise<OidcMetadata> {
  const trimmed = issuer.replace(/\/+$/, "");
  const cached = discoveryCache.get(trimmed);
  if (cached) return cached;
  const url = `${trimmed}/.well-known/openid-configuration`;
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) {
    throw new Error(`OIDC discovery failed (${res.status}) at ${url}`);
  }
  const meta = (await res.json()) as OidcMetadata;
  if (!meta.authorization_endpoint || !meta.token_endpoint) {
    throw new Error("OIDC metadata missing endpoints");
  }
  discoveryCache.set(trimmed, meta);
  return meta;
}

// Crockford-safe base64url with no padding.
function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 32 bytes of randomness encoded base64url -- yields 43 chars.
export function generateCodeVerifier(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const enc = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return base64UrlEncode(new Uint8Array(digest));
}

export function buildAuthorizeUrl(
  meta: OidcMetadata,
  params: {
    clientId: string;
    redirectUri: string;
    scope: string;
    state: string;
    codeChallenge: string;
  },
): string {
  const u = new URL(meta.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("scope", params.scope);
  u.searchParams.set("state", params.state);
  u.searchParams.set("code_challenge", params.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export async function exchangeCodeForToken(args: {
  meta: OidcMetadata;
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: args.clientId,
    code_verifier: args.codeVerifier,
  });
  const res = await fetch(args.meta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    credentials: "omit",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${txt}`);
  }
  return (await res.json()) as OAuthTokenResponse;
}

const POPUP_W = 480;
const POPUP_H = 720;

export interface OAuthCallbackMessage {
  type: "obsidianirc:oauth-callback";
  state: string;
  code?: string;
  error?: string;
  errorDescription?: string;
}

// Run the full authorization-code-with-PKCE dance via a popup. Returns the
// tokens. Caller is responsible for storing them on the server config.
export async function beginOauthLogin(
  cfg: Pick<
    ServerOAuthConfig,
    "issuer" | "clientId" | "scopes" | "redirectUri"
  >,
): Promise<OAuthLoginResult> {
  const meta = await discoverOidc(cfg.issuer);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await deriveCodeChallenge(codeVerifier);
  const state = generateCodeVerifier();
  const scope = cfg.scopes?.trim() || "openid";
  const redirectUri = cfg.redirectUri?.trim() || defaultRedirectUri();
  const url = buildAuthorizeUrl(meta, {
    clientId: cfg.clientId,
    redirectUri,
    scope,
    state,
    codeChallenge,
  });

  const left = window.screenX + (window.outerWidth - POPUP_W) / 2;
  const top = window.screenY + (window.outerHeight - POPUP_H) / 2;
  const popup = window.open(
    url,
    "obsidianirc-oauth",
    `width=${POPUP_W},height=${POPUP_H},left=${left},top=${top},popup=yes`,
  );
  if (!popup) {
    throw new Error(
      "Popup was blocked. Allow popups for this site and try again.",
    );
  }

  const code = await new Promise<string>((resolve, reject) => {
    let closed = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearInterval(closeTimer);
    };
    const onMessage = (event: MessageEvent) => {
      // Same-origin only; the callback page is served by the SPA.
      if (event.origin !== window.location.origin) return;
      const data = event.data as OAuthCallbackMessage | undefined;
      if (!data || data.type !== "obsidianirc:oauth-callback") return;
      if (data.state !== state) {
        cleanup();
        reject(new Error("OAuth state mismatch (possible CSRF)"));
        return;
      }
      cleanup();
      try {
        popup.close();
      } catch {}
      if (data.error) {
        reject(
          new Error(
            data.errorDescription
              ? `${data.error}: ${data.errorDescription}`
              : data.error,
          ),
        );
      } else if (data.code) {
        resolve(data.code);
      } else {
        reject(new Error("OAuth callback returned no code"));
      }
    };
    window.addEventListener("message", onMessage);
    const closeTimer = setInterval(() => {
      if (popup.closed && !closed) {
        closed = true;
        cleanup();
        reject(new Error("OAuth popup was closed before completing"));
      }
    }, 500);
  });

  const tokens = await exchangeCodeForToken({
    meta,
    clientId: cfg.clientId,
    redirectUri,
    code,
    codeVerifier,
  });
  const expiresAt = tokens.expires_in
    ? Math.floor(Date.now() / 1000) + tokens.expires_in
    : undefined;
  return {
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token,
    tokenExpiresAt: expiresAt,
    scope: tokens.scope,
  };
}

// Provider presets surfaced in the UI dropdown. "custom" lets the admin type
// any issuer URL.
export interface OAuthProviderPreset {
  id: string;
  label: string;
  // Either a fully-qualified issuer (e.g. "https://accounts.google.com") or
  // null for providers where the admin must paste their tenant URL (Logto).
  issuer: string | null;
  defaultScopes: string;
  // Helper text shown under the issuer field when this preset is picked.
  hint?: string;
}

export const OAUTH_PRESETS: OAuthProviderPreset[] = [
  {
    id: "custom",
    label: "Custom OIDC provider",
    issuer: null,
    defaultScopes: "openid",
    hint: "Any IdP that publishes /.well-known/openid-configuration and issues JWT access tokens.",
  },
  {
    id: "logto",
    label: "Logto",
    issuer: null,
    defaultScopes: "openid",
    hint: "Paste your tenant URL, e.g. https://my-tenant.logto.app/oidc",
  },
  {
    id: "auth0",
    label: "Auth0",
    issuer: null,
    defaultScopes: "openid profile",
    hint: "Issuer is https://<your-tenant>.us.auth0.com/",
  },
  {
    id: "keycloak",
    label: "Keycloak",
    issuer: null,
    defaultScopes: "openid",
    hint: "Issuer is https://<host>/realms/<realm>",
  },
];
