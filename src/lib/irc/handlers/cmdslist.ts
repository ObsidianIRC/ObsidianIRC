// obsidianirc/cmdslist: parse the per-line CMDSLIST add/remove
// payload into a single typed event.
//
// Wire format:
//   :server CMDSLIST +foo +bar -baz +quux
//
// Each parameter token is "+<cmd>" or "-<cmd>".  We separate them so
// the store can union-and-difference its existing set without having
// to re-walk every entry.

import type { IRCClientContext } from "../IRCClientContext";

export function handleCmdslist(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const additions: string[] = [];
  const removals: string[] = [];
  for (const tok of parv) {
    if (!tok) continue;
    if (tok[0] === "+") {
      const name = tok.slice(1).trim();
      if (name) additions.push(name);
    } else if (tok[0] === "-") {
      const name = tok.slice(1).trim();
      if (name) removals.push(name);
    }
  }
  ctx.triggerEvent("CMDSLIST", { serverId, additions, removals });
}
