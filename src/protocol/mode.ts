import type { IRCClient } from "../lib/ircClient";
import type AppState from "../store/";
import type { Channel, Message, Server } from "../types/";

export function registerModeHandler(
  ircClient: IRCClient,
  useStore: typeof AppState,
) {
  ircClient.on("MODE", ({ serverId, sender, target, modestring, modeargs }) => {
    const state = useStore.getState();
    const server = state.servers.find((s: Server) => s.id === serverId);
    if (!server) return;

    // Check if target is a channel
    if (target.startsWith("#")) {
      handleChannelMode(
        serverId,
        server,
        target,
        sender,
        modestring,
        modeargs,
        useStore,
      );
    } else {
      // User mode - for now, just log
      console.log(`User mode change: ${target} ${modestring}`, modeargs);
    }
  });
}

function handleChannelMode(
  serverId: string,
  server: Server,
  channelName: string,
  sender: string,
  modestring: string,
  modeargs: string[],
  useStore: typeof AppState,
) {
  const channel = server.channels.find((c: Channel) => c.name === channelName);
  if (!channel) return;

  // Parse the modestring and apply mode changes
  const changes = parseModestring(modestring, modeargs);

  // Apply the mode changes to users
  applyModeChanges(serverId, channel, changes, useStore);

  // Send notification message
  sendModeNotification(serverId, channel, sender, changes, useStore);
}

interface ModeChange {
  mode: string;
  action: "+" | "-";
  arg?: string;
}

function parseModestring(modestring: string, modeargs: string[]): ModeChange[] {
  const changes: ModeChange[] = [];
  let argIndex = 0;

  for (let i = 0; i < modestring.length; i++) {
    const char = modestring[i];
    if (char === "+" || char === "-") {
      // This is a mode action
      continue;
    }

    const action =
      i > 0 && (modestring[i - 1] === "+" || modestring[i - 1] === "-")
        ? modestring[i - 1]
        : "+";
    const mode = char;

    // Check if this mode requires an argument
    // For now, we'll assume modes like o, v, h, etc. require args
    // This should be configurable based on CHANMODES ISUPPORT token
    const requiresArg = "ovhqa".includes(mode);

    const change: ModeChange = {
      mode,
      action: action as "+" | "-",
      arg:
        requiresArg && argIndex < modeargs.length
          ? modeargs[argIndex++]
          : undefined,
    };

    changes.push(change);
  }

  return changes;
}

function applyModeChanges(
  serverId: string,
  channel: Channel,
  changes: ModeChange[],
  useStore: typeof AppState,
) {
  const state = useStore.getState();
  const server = state.servers.find((s: Server) => s.id === serverId);
  if (!server || !server.prefix) return;

  const serverPrefix = server.prefix; // Store in variable to satisfy TypeScript

  // Parse PREFIX to get mode-to-prefix mapping
  const prefixMap = parsePrefix(serverPrefix);

  useStore.setState((state) => {
    const updatedServers = state.servers.map((s: Server) => {
      if (s.id !== serverId) return s;

      const updatedChannels = s.channels.map((c: Channel) => {
        if (c.name !== channel.name) return c;

        const updatedUsers = c.users.map((user) => {
          let newStatus = user.status || "";

          changes.forEach((change) => {
            if (change.arg === user.username) {
              // This mode change affects this user
              const prefix = prefixMap[change.mode];
              if (prefix) {
                if (change.action === "+") {
                  // Add prefix if not already present
                  if (!newStatus.includes(prefix)) {
                    // Insert prefix in correct order (highest precedence first)
                    newStatus = insertPrefixInOrder(
                      newStatus,
                      prefix,
                      serverPrefix,
                    );
                  }
                } else {
                  // Remove prefix if present
                  newStatus = newStatus.replace(prefix, "");
                }
              }
            }
          });

          return { ...user, status: newStatus };
        });

        return { ...c, users: updatedUsers };
      });

      return { ...s, channels: updatedChannels };
    });

    return { servers: updatedServers };
  });
}

function parsePrefix(prefix: string): Record<string, string> {
  // PREFIX=(modes)prefixes
  // Example: PREFIX=(ov)@+
  const match = prefix.match(/^\(([^)]+)\)(.+)$/);
  if (!match) return {};

  const modes = match[1];
  const prefixes = match[2];

  const map: Record<string, string> = {};
  for (let i = 0; i < Math.min(modes.length, prefixes.length); i++) {
    map[modes[i]] = prefixes[i];
  }

  return map;
}

function insertPrefixInOrder(
  currentPrefixes: string,
  newPrefix: string,
  prefixString: string,
): string {
  // Parse the prefix string to get the order
  const match = prefixString.match(/^\(([^)]+)\)(.+)$/);
  if (!match) return currentPrefixes + newPrefix;

  const prefixes = match[2]; // The prefix characters in order

  // Find the position where the new prefix should be inserted
  const newPrefixIndex = prefixes.indexOf(newPrefix);
  if (newPrefixIndex === -1) return currentPrefixes + newPrefix;

  // Remove any existing instance of this prefix
  let result = currentPrefixes.replace(new RegExp(`\\${newPrefix}`, "g"), "");

  // Insert at the correct position
  for (let i = 0; i <= result.length; i++) {
    const charAtI = result[i] || "";
    const indexAtI = charAtI ? prefixes.indexOf(charAtI) : prefixes.length;

    if (newPrefixIndex < indexAtI) {
      // Insert here
      result = result.slice(0, i) + newPrefix + result.slice(i);
      break;
    }
  }

  return result;
}

function sendModeNotification(
  serverId: string,
  channel: Channel,
  sender: string,
  changes: ModeChange[],
  useStore: typeof AppState,
) {
  // Create a system message for the mode change
  const modeText = changes
    .map(
      (change) =>
        `${change.action}${change.mode}${change.arg ? ` ${change.arg}` : ""}`,
    )
    .join(" ");

  const message: Message = {
    id: `mode-${Date.now()}-${Math.random()}`,
    type: "system",
    content: `${sender} sets mode: ${modeText}`,
    timestamp: new Date(),
    userId: sender,
    channelId: channel.id,
    serverId,
    reactions: [],
    replyMessage: null,
    mentioned: [],
  };

  // Add the message to the channel
  useStore.setState((state) => {
    const updatedServers = state.servers.map((s: Server) => {
      if (s.id !== serverId) return s;

      const updatedChannels = s.channels.map((c: Channel) => {
        if (c.id !== channel.id) return c;

        return { ...c, messages: [...c.messages, message] };
      });

      return { ...s, channels: updatedChannels };
    });

    return { servers: updatedServers };
  });
}
