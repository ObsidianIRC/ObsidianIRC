// draft/read-marker: server replies look like
//   :server MARKREAD <target> timestamp=YYYY-MM-DDThh:mm:ss.sssZ
//   :server MARKREAD <target> *
// where '*' means "no marker on file yet".  We project to a typed
// MARKREAD event with `timestamp: string | null`.

import type { IRCClientContext } from "../IRCClientContext";

const TS_PREFIX = "timestamp=";

export function handleMarkread(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const target = parv[0];
  const tsParam = parv[1] ?? "";
  if (!target) return;
  let timestamp: string | null = null;
  if (tsParam && tsParam !== "*") {
    timestamp = tsParam.startsWith(TS_PREFIX)
      ? tsParam.slice(TS_PREFIX.length)
      : tsParam;
  }
  ctx.triggerEvent("MARKREAD", { serverId, target, timestamp });
}
