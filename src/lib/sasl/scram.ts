// SCRAM-SHA-256 (RFC 7677) client.  Uses Web Crypto: works in browsers,
// Tauri WebView (WebKit/WebView2), and node (vitest provides crypto.subtle).

import { Buffer } from "buffer";

const ENC = new TextEncoder();
const DEC = new TextDecoder();

function bytesToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function strToBytes(s: string): Uint8Array {
  return ENC.encode(s);
}

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

// SCRAM allows '=' and ',' inside usernames only when escaped as =3D / =2C.
function escapeUsername(u: string): string {
  return u.replace(/=/g, "=3D").replace(/,/g, "=2C");
}

// Random nonce: alnum-only to keep it printable & comma-free.
function randomNonce(bytes = 18): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  const alpha =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (const b of buf) s += alpha[b % alpha.length];
  return s;
}

async function hmacSha256(
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, data);
  return new Uint8Array(sig);
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const out = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(out);
}

async function pbkdf2Sha256(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    strToBytes(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    k,
    256,
  );
  return new Uint8Array(bits);
}

export interface ScramState {
  username: string;
  password: string;
  clientNonce: string;
  clientFirstBare: string;
  serverFirst?: string;
  combinedNonce?: string;
  serverSignature?: Uint8Array;
}

// Build the GS2 header + client-first-message-bare and remember the bare part
// so we can build AuthMessage in step 2.
export function scramStart(
  username: string,
  password: string,
): {
  state: ScramState;
  message: string;
} {
  const cnonce = randomNonce();
  const bare = `n=${escapeUsername(username)},r=${cnonce}`;
  const message = `n,,${bare}`;
  return {
    state: {
      username,
      password,
      clientNonce: cnonce,
      clientFirstBare: bare,
    },
    message,
  };
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of s.split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const k = pair.slice(0, eq);
    const v = pair.slice(eq + 1);
    out[k] = v;
  }
  return out;
}

// Consume server-first, produce client-final.  Stores ServerSignature in
// state so the caller can verify server-final later.
export async function scramFinal(
  state: ScramState,
  serverFirst: string,
): Promise<string> {
  const attrs = parseAttrs(serverFirst);
  const r = attrs.r;
  const s = attrs.s;
  const i = attrs.i;
  if (!r || !s || !i) throw new Error("SCRAM: malformed server-first");
  if (!r.startsWith(state.clientNonce))
    throw new Error("SCRAM: server nonce does not extend client nonce");

  const salt = b64ToBytes(s);
  const iterations = Number.parseInt(i, 10);
  if (!Number.isFinite(iterations) || iterations < 1)
    throw new Error("SCRAM: bad iteration count");

  state.serverFirst = serverFirst;
  state.combinedNonce = r;

  // c=biws is base64("n,,") -- the GS2 header we sent in client-first.
  const clientFinalNoProof = `c=biws,r=${r}`;
  const authMessage = `${state.clientFirstBare},${serverFirst},${clientFinalNoProof}`;
  const authMessageBytes = strToBytes(authMessage);

  const saltedPassword = await pbkdf2Sha256(state.password, salt, iterations);
  const clientKey = await hmacSha256(saltedPassword, strToBytes("Client Key"));
  const storedKey = await sha256(clientKey);
  const clientSignature = await hmacSha256(storedKey, authMessageBytes);
  const clientProof = xorBytes(clientKey, clientSignature);

  const serverKey = await hmacSha256(saltedPassword, strToBytes("Server Key"));
  state.serverSignature = await hmacSha256(serverKey, authMessageBytes);

  return `${clientFinalNoProof},p=${bytesToB64(clientProof)}`;
}

// Verify server-final's v= against our stored ServerSignature.
export function scramVerifyServerFinal(
  state: ScramState,
  serverFinal: string,
): boolean {
  const attrs = parseAttrs(serverFinal);
  const v = attrs.v;
  if (!v || !state.serverSignature) return false;
  const got = b64ToBytes(v);
  if (got.length !== state.serverSignature.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++)
    diff |= got[i] ^ state.serverSignature[i];
  return diff === 0;
}

// Encode/decode the SASL chunk wire format (Base64 standard, padded).
export const sasl = {
  encodeUtf8(s: string): string {
    return Buffer.from(s, "utf8").toString("base64");
  },
  decodeUtf8(b64: string): string {
    return DEC.decode(b64ToBytes(b64));
  },
};
