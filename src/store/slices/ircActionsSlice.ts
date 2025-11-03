import { v4 as uuidv4 } from "uuid";
import type { StateCreator } from "zustand";
import { ircClient } from "../../lib/ircClient";
import type { AppState } from "../types";

/**
 * IRC Actions Slice
 *
 * Provides IRC protocol commands and UI convenience methods.
 * These methods interact with the IRC client and coordinate state updates.
 */

export interface IRCActionsSlice {
  // Connection management
  connect: (
    name: string,
    host: string,
    port: number,
    nickname: string,
    saslEnabled: boolean,
    password?: string,
    saslAccountName?: string,
    saslPassword?: string,
    registerAccount?: boolean,
    registerEmail?: string,
    registerPassword?: string,
  ) => Promise<void>;
  disconnect: (serverId: string) => void;
  reconnectServer: (serverId: string) => Promise<void>;
  connectToSavedServers: () => void;
  deleteServer: (serverId: string) => void;

  // Channel operations
  joinChannel: (serverId: string, channelName: string) => void;
  leaveChannel: (serverId: string, channelName: string) => void;
  listChannels: (
    serverId: string,
    filters?: {
      minUsers?: number;
      maxUsers?: number;
      minCreationTime?: number;
      maxTopicTime?: number;
      pattern?: string;
      notPattern?: string;
    },
  ) => void;
  renameChannel: (
    serverId: string,
    oldName: string,
    newName: string,
    reason?: string,
  ) => void;

  // Message operations
  sendMessage: (serverId: string, channelId: string, content: string) => void;
  redactMessage: (
    serverId: string,
    channelId: string,
    messageId: string,
  ) => void;

  // User moderation
  warnUser: (
    serverId: string,
    channelName: string,
    username: string,
    reason?: string,
  ) => void;
  kickUser: (
    serverId: string,
    channelName: string,
    username: string,
    reason?: string,
  ) => void;
  banUserByNick: (
    serverId: string,
    channelName: string,
    username: string,
    reason?: string,
  ) => void;
  banUserByHostmask: (
    serverId: string,
    channelName: string,
    hostmask: string,
    reason?: string,
  ) => void;

  // User operations
  setName: (serverId: string, realname: string) => void;
  changeNick: (serverId: string, newNick: string) => void;

  // IRC metadata operations
  metadataSet: (
    serverId: string,
    target: string,
    key: string,
    value: string,
    visibility?: string,
  ) => void;
  metadataGet: (
    serverId: string,
    target: string,
    keys: string | string[],
  ) => void;

  // Raw IRC commands
  sendRaw: (serverId: string, command: string) => void;

  // Selection/navigation helpers
  selectServer: (serverId: string | null) => void;
  selectChannel: (channelId: string | null) => void;
  selectPrivateChat: (privateChatId: string | null) => void;
  openPrivateChat: (serverId: string, username: string) => void;
}

export const createIRCActionsSlice: StateCreator<
  AppState,
  [
    ["zustand/devtools", never],
    ["zustand/persist", unknown],
    ["zustand/immer", never],
  ],
  [],
  IRCActionsSlice
> = (set, get) => ({
  connect: async (
    name,
    host,
    port,
    nickname,
    _saslEnabled,
    password,
    saslAccountName,
    saslPassword,
  ) => {
    // The IRC client will handle the connection and fire events
    // that the IRC adapter will handle to update state
    try {
      const server = await ircClient.connect(
        name,
        host,
        port,
        nickname,
        password,
        saslAccountName,
        saslPassword,
      );

      // Add server to Zustand store if it doesn't exist
      const state = get();
      const existingServer = state.getServer(server.id);
      if (!existingServer) {
        state.addServer(server);
      }

      // Select the newly connected server
      state.setSelectedServerId(server.id);
    } catch (error) {
      console.error("Connection error:", error);
      throw error;
    }
  },

  disconnect: (serverId) => {
    ircClient.disconnect(serverId);
  },

  reconnectServer: async (serverId) => {
    const state = get();
    const server = state.getServer(serverId);
    if (!server) {
      console.error(`Server ${serverId} not found`);
      return;
    }

    // Update server state to connecting
    state.setConnectionState(serverId, "connecting");

    try {
      // Get saved server config to get credentials
      const { loadSavedServers } = await import("../index");
      const savedServers = loadSavedServers();
      const savedServer = savedServers.find(
        (s) => s.host === server.host && s.port === server.port,
      );

      if (!savedServer) {
        console.error(`No saved configuration found for server ${serverId}`);
        throw new Error(`No saved configuration found for server ${serverId}`);
      }

      // Reconnect using saved credentials
      await get().connect(
        savedServer.name || savedServer.host,
        savedServer.host,
        savedServer.port,
        savedServer.nickname || "user",
        savedServer.saslEnabled || false,
        savedServer.password,
        savedServer.saslAccountName,
        savedServer.saslPassword,
      );
    } catch (error) {
      console.error(`Failed to reconnect to server ${serverId}`, error);
      state.setConnectionState(serverId, "disconnected");
      throw error;
    }
  },

  connectToSavedServers: () => {
    const state = get();
    if (state.hasConnectedToSavedServers) {
      return; // Already connected, don't do it again
    }

    state.setHasConnectedToSavedServers(true);

    (async () => {
      const { loadSavedServers } = await import("../index");
      const savedServers = loadSavedServers();

      for (const savedServer of savedServers) {
        const {
          host,
          port,
          name,
          nickname,
          password,
          saslEnabled,
          saslAccountName,
          saslPassword,
        } = savedServer;

        // Check if server already exists in store
        const existingServer = state.getServerByHost(host, port);
        if (existingServer) {
          continue; // Skip if already exists
        }

        try {
          await get().connect(
            name || host,
            host,
            port,
            nickname || "user",
            saslEnabled || false,
            password,
            saslAccountName,
            saslPassword,
          );
        } catch (error) {
          console.error(
            `Failed to connect to saved server ${host}:${port}`,
            error,
          );
        }
      }
    })();
  },

  deleteServer: (serverId) => {
    set(
      (state) => {
        state.servers = state.servers.filter((s) => s.id !== serverId);
      },
      false,
      "irc/deleteServer",
    );
  },

  joinChannel: (serverId, channelName) => {
    ircClient.joinChannel(serverId, channelName);
  },

  leaveChannel: (serverId, channelName) => {
    ircClient.leaveChannel(serverId, channelName);
  },

  listChannels: (serverId, filters) => {
    ircClient.listChannels(serverId, undefined, filters);
  },

  renameChannel: (serverId, oldName, newName, reason) => {
    ircClient.renameChannel(serverId, oldName, newName, reason);
  },

  sendMessage: (serverId, channelId, content) => {
    const state = get();
    const channel = state.getChannel(serverId, channelId);
    if (channel) {
      ircClient.sendMessage(serverId, channel.name, content);
    }
  },

  redactMessage: (serverId, channelId, messageId) => {
    const state = get();
    const channel = state.getChannel(serverId, channelId);
    if (channel) {
      ircClient.sendRedact(
        serverId,
        channel.name,
        messageId,
        "Message redacted",
      );
    }
  },

  warnUser: (serverId, channelName, username, reason) => {
    // Send a warning message to the user via PRIVMSG
    const warningMessage = `Warning: ${reason || "Please follow channel rules"}`;
    ircClient.sendRaw(serverId, `PRIVMSG ${username} :${warningMessage}`);
  },

  kickUser: (serverId, channelName, username, reason) => {
    const kickCommand = `KICK ${channelName} ${username}${reason ? ` :${reason}` : ""}`;
    ircClient.sendRaw(serverId, kickCommand);
  },

  banUserByNick: (serverId, channelName, username, reason) => {
    // Ban by nickname pattern (username!*@*)
    ircClient.sendRaw(serverId, `MODE ${channelName} +b ${username}!*@*`);
    ircClient.sendRaw(
      serverId,
      `KICK ${channelName} ${username}${reason ? ` :${reason}` : ""}`,
    );
  },

  banUserByHostmask: (serverId, channelName, hostmask, reason) => {
    const state = get();
    const server = state.getServer(serverId);
    if (!server) return;

    const channel = state.getChannelByName(serverId, channelName);
    // Try to find the user in the channel's user list first, then fall back to server user list
    const user =
      channel?.users.find((u) => u.username === hostmask) ||
      server.users?.find((u) => u.username === hostmask);

    const hostname = user?.hostname || "*";
    ircClient.sendRaw(serverId, `MODE ${channelName} +b *!*@${hostname}`);
    ircClient.sendRaw(
      serverId,
      `KICK ${channelName} ${hostmask}${reason ? ` :${reason}` : ""}`,
    );
  },

  setName: (serverId, realname) => {
    ircClient.setName(serverId, realname);
  },

  changeNick: (serverId, newNick) => {
    ircClient.changeNick(serverId, newNick);
  },

  metadataSet: (serverId, target, key, value, visibility) => {
    ircClient.metadataSet(serverId, target, key, value, visibility);
  },

  metadataGet: (serverId, target, keys) => {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    ircClient.metadataGet(serverId, target, keyArray);
  },

  sendRaw: (serverId, command) => {
    ircClient.sendRaw(serverId, command);
  },

  selectServer: (serverId) => {
    set(
      (state) => {
        state.ui.selectedServerId = serverId;
      },
      false,
      "irc/selectServer",
    );
  },

  selectChannel: (channelId) => {
    set(
      (state) => {
        if (!state.ui.selectedServerId) return;

        const currentSelection =
          state.ui.perServerSelections[state.ui.selectedServerId] || {};
        state.ui.perServerSelections[state.ui.selectedServerId] = {
          ...currentSelection,
          selectedChannelId: channelId,
          selectedPrivateChatId: null,
        };
      },
      false,
      "irc/selectChannel",
    );
  },

  selectPrivateChat: (privateChatId) => {
    set(
      (state) => {
        if (!state.ui.selectedServerId) return;

        const currentSelection =
          state.ui.perServerSelections[state.ui.selectedServerId] || {};
        state.ui.perServerSelections[state.ui.selectedServerId] = {
          ...currentSelection,
          selectedChannelId: null,
          selectedPrivateChatId: privateChatId,
        };
      },
      false,
      "irc/selectPrivateChat",
    );
  },

  openPrivateChat: (serverId, username) => {
    set(
      (state) => {
        // Find or create private chat
        let privateChat = state.getPrivateChatByUsername(serverId, username);
        if (!privateChat) {
          privateChat = {
            id: uuidv4(),
            username,
            serverId,
            unreadCount: 0,
            isMentioned: false,
            isPinned: false,
            order: 0,
          };
          state.addPrivateChatToServer(serverId, privateChat);
        }

        // Select it
        state.ui.selectedServerId = serverId;
        const currentSelection = state.ui.perServerSelections[serverId] || {};
        state.ui.perServerSelections[serverId] = {
          ...currentSelection,
          selectedChannelId: null,
          selectedPrivateChatId: privateChat.id,
        };
      },
      false,
      "irc/openPrivateChat",
    );
  },
});
