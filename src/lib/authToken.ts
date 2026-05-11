// Helpers for the draft/authtoken flow on the client side.
//
// `requestToken` only sends `TOKEN GENERATE`; the actual token arrives
// asynchronously via the TOKEN_GENERATE event handler in
// src/store/handlers/auth.ts, which writes `authToken` onto the matching
// server in the Zustand store.  Components need a way to *wait* for that
// write to land before they can issue the upload, so this module exposes
// a tiny once-listener helper instead of the older "sleep 1s and hope"
// pattern that the EXTJWT code used.

import ircClient from "./ircClient";

/**
 * Subscribe once to TOKEN_GENERATE for the given server and resolve with
 * the bearer token, or null if no event arrives within `timeoutMs`.
 *
 * Optionally filter by service so we don't accept a token minted for a
 * different service (e.g. avatar vs filehost).  Default 5s timeout
 * matches what users typically tolerate before the spinner feels stuck.
 */
export function waitForAuthToken(
  serverId: string,
  serviceFilter?: string,
  timeoutMs = 5000,
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const handler = (payload: {
      serverId: string;
      service: string;
      url: string;
      token: string;
    }) => {
      if (settled) return;
      if (payload.serverId !== serverId) return;
      if (serviceFilter && payload.service !== serviceFilter) return;
      settled = true;
      ircClient.deleteHook("TOKEN_GENERATE", handler);
      clearTimeout(timer);
      resolve(payload.token);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ircClient.deleteHook("TOKEN_GENERATE", handler);
      resolve(null);
    }, timeoutMs);
    ircClient.on("TOKEN_GENERATE", handler);
  });
}
