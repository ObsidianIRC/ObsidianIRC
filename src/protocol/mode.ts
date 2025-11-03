import type { StoreApi, UseBoundStore } from "zustand";
import type { IRCClient } from "../lib/ircClient";
import type { AppState } from "../store/";
import type { Channel, Message, Server } from "../types/";

export function registerModeHandler(
  ircClient: IRCClient,
  useStore: UseBoundStore<StoreApi<AppState>>,
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
  useStore: UseBoundStore<StoreApi<AppState>>,
) {
  const channel = server.channels.find((c: Channel) => c.name === channelName);
  if (!channel) return;

  // Parse the modestring and apply mode changes
  const changes = parseModestring(modestring, modeargs, server.chanmodes);

  // Apply the mode changes to users
  applyModeChanges(serverId, channel, changes, useStore);

  // Apply ban/exception/invite list changes
  applyListModeChanges(serverId, channel, sender, changes, useStore);

  // Update channel modes
  updateChannelModes(serverId, channel, changes, useStore);

  // Send notification message
  sendModeNotification(serverId, channel, sender, changes, useStore);
}

interface ModeChange {
  mode: string;
  action: "+" | "-";
  arg?: string;
}

function parseModestring(
  modestring: string,
  modeargs: string[],
  chanmodes?: string,
): ModeChange[] {
  const changes: ModeChange[] = [];
  let argIndex = 0;

  // Parse CHANMODES to determine mode groups
  // Format: A,B,C,D where A=always param, B=always param, C=param when set, D=never param
  const modeGroups = chanmodes ? chanmodes.split(",") : [];
  const groupA = modeGroups[0] || ""; // Always require param
  const groupB = modeGroups[1] || ""; // Always require param
  const groupC = modeGroups[2] || ""; // Require param only when setting
  const groupD = modeGroups[3] || ""; // Never require param

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

    // Determine if this mode requires an argument based on CHANMODES groups
    let requiresArg = false;
    if (groupA.includes(mode) || groupB.includes(mode)) {
      requiresArg = true;
    } else if (groupC.includes(mode)) {
      requiresArg = action === "+";
    } else if (groupD.includes(mode)) {
      requiresArg = false;
    } else {
      // Fallback for modes not in CHANMODES (shouldn't happen with proper servers)
      requiresArg = "ovhqa bei".includes(mode);
    }

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
  useStore: UseBoundStore<StoreApi<AppState>>,
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

function updateChannelModes(
  serverId: string,
  channel: Channel,
  changes: ModeChange[],
  useStore: UseBoundStore<StoreApi<AppState>>,
) {
  // Only update if there are actual channel mode changes (not just user status changes)
  const channelModeChanges = changes.filter(
    (change) => !change.arg || !isUserStatusMode(change.mode),
  );

  if (channelModeChanges.length === 0) return;

  // Get server for CHANMODES
  const state = useStore.getState();
  const server = state.servers.find((s) => s.id === serverId);
  if (!server) return;

  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id !== serverId) return server;

      const updatedChannels = server.channels.map((c) => {
        if (c.name !== channel.name) return c;

        // Parse current modes and modeArgs to get current state
        const currentModesStr = c.modes || "";
        const currentModeArgs = c.modeArgs || [];
        const currentParsedModes = parseCurrentChannelModes(
          currentModesStr,
          currentModeArgs,
          server.chanmodes,
        );

        // Apply changes to the parsed modes
        const updatedParsedModes = { ...currentParsedModes };
        channelModeChanges.forEach((change) => {
          if (change.action === "+") {
            updatedParsedModes[change.mode] = change.arg || null;
          } else {
            delete updatedParsedModes[change.mode];
          }
        });

        // Generate new modes string and modeArgs array
        const { modes: newModesStr, modeArgs: newModeArgs } =
          generateModestringAndArgs(updatedParsedModes, server.chanmodes);

        return { ...c, modes: newModesStr, modeArgs: newModeArgs };
      });

      return { ...server, channels: updatedChannels };
    });

    return { servers: updatedServers };
  });
}

function isUserStatusMode(mode: string): boolean {
  // Check if this is a user status mode (op, voice, etc.) that takes a nickname as argument
  // These are handled separately and shouldn't affect channel.modes
  return "ovhqa".includes(mode);
}

function parseCurrentChannelModes(
  modestring: string,
  modeargs: string[],
  chanmodes?: string,
): Record<string, string | null> {
  // Parse CHANMODES to determine mode groups
  const modeGroups = chanmodes ? chanmodes.split(",") : [];
  const groupA = modeGroups[0] || ""; // Always require param
  const groupB = modeGroups[1] || ""; // Always require param
  const groupC = modeGroups[2] || ""; // Require param only when set
  const groupD = modeGroups[3] || ""; // Never require param

  const parsedModes: Record<string, string | null> = {};
  let argIndex = 0;
  let currentAction: "+" | "-" = "+";

  // Parse the modestring as a MODE command, applying + and - to build final state
  for (let i = 0; i < modestring.length; i++) {
    const char = modestring[i];
    if (char === "+" || char === "-") {
      currentAction = char;
      continue;
    }

    const mode = char;

    // Determine if this mode should have a parameter
    let hasParam = false;
    if (groupA.includes(mode) || groupB.includes(mode)) {
      hasParam = true;
    } else if (groupC.includes(mode)) {
      hasParam = currentAction === "+";
    }

    const param =
      hasParam && argIndex < modeargs.length ? modeargs[argIndex++] : null;

    if (currentAction === "+") {
      parsedModes[mode] = param;
    } else {
      // Unsetting
      delete parsedModes[mode];
    }
  }

  return parsedModes;
}

function generateModestringAndArgs(
  parsedModes: Record<string, string | null>,
  chanmodes?: string,
): { modes: string; modeArgs: string[] } {
  // Parse CHANMODES to determine mode groups
  const modeGroups = chanmodes ? chanmodes.split(",") : [];
  const groupA = modeGroups[0] || ""; // Always require param
  const groupB = modeGroups[1] || ""; // Always require param
  const groupC = modeGroups[2] || ""; // Require param only when set
  const groupD = modeGroups[3] || ""; // Never require param

  const modeArgs: string[] = [];
  let modestring = "+";

  // Sort modes for consistency
  const sortedModes = Object.keys(parsedModes).sort();

  sortedModes.forEach((mode) => {
    modestring += mode;

    // Check if this mode should have a parameter
    let hasParam = false;
    if (groupA.includes(mode) || groupB.includes(mode)) {
      hasParam = true;
    } else if (groupC.includes(mode)) {
      hasParam = true; // If it's set, it has a param
    }

    if (hasParam && parsedModes[mode] !== null) {
      modeArgs.push(parsedModes[mode] as string);
    }
  });

  return {
    modes: modestring,
    modeArgs,
  };
}

function applyListModeChanges(
  serverId: string,
  channel: Channel,
  sender: string,
  changes: ModeChange[],
  useStore: UseBoundStore<StoreApi<AppState>>,
) {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((s: Server) => {
      if (s.id !== serverId) return s;

      const updatedChannels = s.channels.map((c: Channel) => {
        if (c.name !== channel.name) return c;

        const updatedChannel = { ...c };
        const now = Math.floor(Date.now() / 1000);

        changes.forEach((change) => {
          if (change.mode === "b" && change.arg) {
            // Ban mode - for +b, we add/update the ban; for -b, we remove it
            const bans = updatedChannel.bans || [];
            if (change.action === "+") {
              // Add ban - this replaces any existing ban with the same mask
              updatedChannel.bans = bans.filter(
                (ban) => ban.mask !== change.arg,
              );
              updatedChannel.bans.push({
                mask: change.arg,
                setter: sender,
                timestamp: now,
              });
            } else if (change.action === "-") {
              // Remove ban
              updatedChannel.bans = bans.filter(
                (ban) => ban.mask !== change.arg,
              );
            }
          } else if (change.mode === "e" && change.arg) {
            // Exception mode
            const exceptions = updatedChannel.exceptions || [];
            if (change.action === "+") {
              // Add exception - this replaces any existing exception with the same mask
              updatedChannel.exceptions = exceptions.filter(
                (exception) => exception.mask !== change.arg,
              );
              updatedChannel.exceptions.push({
                mask: change.arg,
                setter: sender,
                timestamp: now,
              });
            } else if (change.action === "-") {
              // Remove exception
              updatedChannel.exceptions = exceptions.filter(
                (exception) => exception.mask !== change.arg,
              );
            }
          } else if (change.mode === "I" && change.arg) {
            // Invite mode
            const invites = updatedChannel.invites || [];
            if (change.action === "+") {
              // Add invite - this replaces any existing invite with the same mask
              updatedChannel.invites = invites.filter(
                (invite) => invite.mask !== change.arg,
              );
              updatedChannel.invites.push({
                mask: change.arg,
                setter: sender,
                timestamp: now,
              });
            } else if (change.action === "-") {
              // Remove invite
              updatedChannel.invites = invites.filter(
                (invite) => invite.mask !== change.arg,
              );
            }
          }
        });

        return updatedChannel;
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
  useStore: UseBoundStore<StoreApi<AppState>>,
) {
  // Group changes by action and reconstruct compact mode strings
  const groupedChanges: { [action: string]: ModeChange[] } = {};
  changes.forEach((change) => {
    if (!groupedChanges[change.action]) {
      groupedChanges[change.action] = [];
    }
    groupedChanges[change.action].push(change);
  });

  const modeParts: string[] = [];
  Object.entries(groupedChanges).forEach(([action, actionChanges]) => {
    let modeString = action;
    const args: string[] = [];

    actionChanges.forEach((change) => {
      modeString += change.mode;
      if (change.arg) {
        args.push(change.arg);
      }
    });

    modeParts.push(modeString + (args.length > 0 ? ` ${args.join(" ")}` : ""));
  });

  const message: Message = {
    id: `mode-${Date.now()}-${Math.random()}`,
    type: "mode",
    content: `sets mode: ${modeParts.join(" ")}`,
    timestamp: new Date(),
    userId: sender,
    channelId: channel.id,
    serverId,
    reactions: [],
    replyMessage: null,
    mentioned: [],
  };

  // Add the message using the store's addMessage function
  useStore.getState().addMessage(message);
}
