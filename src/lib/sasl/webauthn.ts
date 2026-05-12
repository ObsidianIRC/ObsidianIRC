// WebAuthn helpers for the DRAFT-WEBAUTHN-BIO mechanism and 2FA enrolment.
// Uses the platform `navigator.credentials` API; works in modern browsers
// and Tauri's WebView wrappers (WebKit2GTK, WKWebView, WebView2).

import { Buffer } from "buffer";

// SASL transport always uses standard Base64 (padded); the byte fields
// inside our JSON payloads use Base64url (no padding) to match what
// browser-side WebAuthn returns.
export function b64uEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function b64uDecode(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 ? 4 - (padded.length % 4) : 0;
  const buf = Buffer.from(padded + "=".repeat(pad), "base64");
  const out = new Uint8Array(buf.length);
  out.set(buf);
  return out;
}

export function bytesToB64Std(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Buffer.from(bytes).toString("base64");
}

export function b64StdDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

// True if WebAuthn is usable in this runtime.
export function isWebAuthnAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.credentials !== "undefined" &&
    typeof PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials.create === "function" &&
    typeof navigator.credentials.get === "function"
  );
}

// Server-issued enrolment challenge (decoded JSON from
// NOTE 2FA REGISTRATION_CHALLENGE webauthn <Base64(JSON)>).
interface CreationOptionsBlob {
  challenge: string; // base64url
  rpId: string;
  rpName?: string;
  userId: string; // base64url, opaque per-account handle
  userName: string;
  userVerification: "required" | "preferred" | "discouraged";
  pubKeyCredParams?: PublicKeyCredentialParameters[];
}

// Run the WebAuthn create() ceremony with the server-issued options and
// return the JSON the server expects in `2FA ADD webauthn <name> <data>`.
export async function webauthnRegister(
  blob: CreationOptionsBlob,
): Promise<{ clientDataJSON: string; attestationObject: string }> {
  if (!isWebAuthnAvailable())
    throw new Error("WebAuthn is not available in this environment");

  const params: PublicKeyCredentialParameters[] =
    blob.pubKeyCredParams && blob.pubKeyCredParams.length > 0
      ? blob.pubKeyCredParams
      : [{ type: "public-key", alg: -7 }];

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: b64uDecode(blob.challenge),
      rp: { id: blob.rpId, name: blob.rpName ?? blob.rpId },
      user: {
        id: b64uDecode(blob.userId),
        name: blob.userName,
        displayName: blob.userName,
      },
      pubKeyCredParams: params,
      authenticatorSelection: {
        userVerification: blob.userVerification,
        residentKey: "preferred",
        requireResidentKey: false,
      },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!cred) throw new Error("WebAuthn create() returned null");

  const r = cred.response as AuthenticatorAttestationResponse;
  return {
    clientDataJSON: b64uEncode(r.clientDataJSON),
    attestationObject: b64uEncode(r.attestationObject),
  };
}

// Server-issued challenge for SASL login (decoded from the AUTHENTICATE
// step-4 message), as PublicKeyCredentialRequestOptions-shaped JSON.
interface RequestOptionsBlob {
  version?: number;
  challenge: string; // base64url
  rpId: string;
  timeout?: number;
  userVerification: "required" | "preferred" | "discouraged";
  allowCredentials?: { type: "public-key"; id: string }[];
}

// Run the WebAuthn get() ceremony and return the assertion JSON the
// server expects on the wire.
export async function webauthnAssert(blob: RequestOptionsBlob): Promise<{
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  userHandle?: string;
}> {
  if (!isWebAuthnAvailable())
    throw new Error("WebAuthn is not available in this environment");

  const allow = (blob.allowCredentials ?? []).map((c) => ({
    type: "public-key" as const,
    id: b64uDecode(c.id),
  }));

  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: b64uDecode(blob.challenge),
      rpId: blob.rpId,
      timeout: blob.timeout ?? 60_000,
      userVerification: blob.userVerification,
      allowCredentials: allow.length > 0 ? allow : undefined,
    },
  })) as PublicKeyCredential | null;

  if (!cred) throw new Error("WebAuthn get() returned null");

  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    credentialId: b64uEncode(cred.rawId),
    authenticatorData: b64uEncode(r.authenticatorData),
    clientDataJSON: b64uEncode(r.clientDataJSON),
    signature: b64uEncode(r.signature),
    userHandle: r.userHandle ? b64uEncode(r.userHandle) : undefined,
  };
}
