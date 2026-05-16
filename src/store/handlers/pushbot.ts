/**
 * draft/bot-cmds plumbing:
 *  - subscribes to TAGMSGs that carry +draft/bot-cmds (response to a
 *    +draft/bot-cmds-query) and caches the decoded schema on the
 *    server's `botCommands` map keyed by bot nick (lowercased)
 *  - subscribes to +draft/bot-cmds-changed and clears the cached
 *    schema for that bot so the next slash invocation re-queries
 *  - exposes a tiny `queryBotCommands(serverId, botNick)` helper
 *    used by ChatArea on JOIN to seed the cache for any +B users
 *    we now share a channel with
 */
import type { StoreApi } from "zustand";
import ircClient from "../../lib/ircClient";
import type { BotCommand } from "../../types";
import type { AppState } from "../index";

function decodeBotCmds(value: string): BotCommand[] | null {
  try {
    // unrealircd emits the value as base64-encoded JSON to avoid the
    // pain of escaping IRCv3 tag-value characters.  Add padding before
    // decoding because spec §7.2 lets the bot strip trailing '='.
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed?.commands)) return parsed.commands as BotCommand[];
  } catch (e) {
    console.warn("[pushbot] failed to decode +draft/bot-cmds value", e);
  }
  return null;
}

export function registerPushBotHandlers(store: StoreApi<AppState>): void {
  // When WHO completes for a channel, pre-fetch slash-command schemas
  // for any +B users we now share a channel with so the autocomplete
  // cache is warm by the time the user types '/'.
  ircClient.on("WHO_END", ({ serverId, mask }) => {
    if (!mask || !mask.startsWith("#")) return;
    const server = store.getState().servers.find((s) => s.id === serverId);
    if (!server) return;
    const channel = server.channels.find(
      (c) => c.name.toLowerCase() === mask.toLowerCase(),
    );
    if (!channel) return;
    const cache = server.botCommands ?? {};
    for (const u of channel.users) {
      if (!u.isBot) continue;
      const key = u.username.toLowerCase();
      if (cache[key]) continue;
      queryBotCommands(serverId, u.username);
    }
  });

  ircClient.on("TAGMSG", (response) => {
    const { serverId, sender, mtags } = response;
    if (!mtags) return;
    const botNick = (sender || "").toLowerCase();
    if (!botNick) return;

    if (mtags["+draft/bot-cmds"]) {
      const cmds = decodeBotCmds(mtags["+draft/bot-cmds"]);
      if (!cmds) return;
      store.setState((state) => ({
        servers: state.servers.map((s) => {
          if (s.id !== serverId) return s;
          const next = { ...(s.botCommands ?? {}), [botNick]: cmds };
          return { ...s, botCommands: next };
        }),
      }));
      return;
    }

    if (mtags["+draft/bot-cmds-changed"]) {
      store.setState((state) => ({
        servers: state.servers.map((s) => {
          if (s.id !== serverId || !s.botCommands) return s;
          if (!(botNick in s.botCommands)) return s;
          const next = { ...s.botCommands };
          delete next[botNick];
          return { ...s, botCommands: next };
        }),
      }));
      // refetch on next slash invocation; UI doesn't need a proactive query
    }
  });
}

/** Send a +draft/bot-cmds-query TAGMSG to <botNick>. */
export function queryBotCommands(serverId: string, botNick: string): void {
  ircClient.sendRaw(serverId, `@+draft/bot-cmds-query=1 TAGMSG ${botNick}`);
}
