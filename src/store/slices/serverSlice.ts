import type { StateCreator } from "zustand";
import type { Channel, PrivateChat, Server, User } from "../../types";

export interface ServerSlice {
  servers: Server[];
  currentUser: User | null;
  isConnecting: boolean;
  connectionError: string | null;
  hasConnectedToSavedServers: boolean;

  // Server operations
  addServer: (server: Server) => void;
  updateServer: (serverId: string, updates: Partial<Server>) => void;
  removeServer: (serverId: string) => void;
  getServer: (serverId: string) => Server | undefined;
  getServerByHost: (host: string, port: number) => Server | undefined;

  // Connection state
  setConnectionState: (
    serverId: string,
    connectionState: Server["connectionState"],
  ) => void;
  setIsConnecting: (isConnecting: boolean) => void;
  setConnectionError: (error: string | null) => void;
  setHasConnectedToSavedServers: (hasConnected: boolean) => void;

  // Current user
  setCurrentUser: (user: User | null) => void;
  updateCurrentUser: (updates: Partial<User>) => void;

  // Channel operations
  addChannelToServer: (serverId: string, channel: Channel) => void;
  removeChannelFromServer: (serverId: string, channelName: string) => void;
  updateChannel: (
    serverId: string,
    channelId: string,
    updates: Partial<Channel>,
  ) => void;
  getChannel: (serverId: string, channelId: string) => Channel | undefined;
  getChannelByName: (
    serverId: string,
    channelName: string,
  ) => Channel | undefined;

  // User operations (users in channels)
  addUserToChannel: (serverId: string, channelName: string, user: User) => void;
  removeUserFromChannel: (
    serverId: string,
    channelName: string,
    username: string,
  ) => void;
  updateUserInChannel: (
    serverId: string,
    channelName: string,
    username: string,
    updates: Partial<User>,
  ) => void;
  getUserInChannel: (
    serverId: string,
    channelName: string,
    username: string,
  ) => User | undefined;

  // Private chat operations
  addPrivateChatToServer: (serverId: string, privateChat: PrivateChat) => void;
  removePrivateChatFromServer: (
    serverId: string,
    privateChatId: string,
  ) => void;
  updatePrivateChat: (
    serverId: string,
    privateChatId: string,
    updates: Partial<PrivateChat>,
  ) => void;
  getPrivateChat: (
    serverId: string,
    privateChatId: string,
  ) => PrivateChat | undefined;
  getPrivateChatByUsername: (
    serverId: string,
    username: string,
  ) => PrivateChat | undefined;

  // Server capabilities
  setServerCapabilities: (serverId: string, capabilities: string[]) => void;
  addServerCapability: (serverId: string, capability: string) => void;
  hasServerCapability: (serverId: string, capability: string) => boolean;

  // Server metadata (not IRC metadata, but server object metadata)
  updateServerMetadata: (
    serverId: string,
    metadata: Record<string, unknown>,
  ) => void;

  // Batch user operations
  setChannelUsers: (
    serverId: string,
    channelName: string,
    users: User[],
  ) => void;

  // Server users (global user list for server)
  addServerUser: (serverId: string, user: User) => void;
  updateServerUser: (
    serverId: string,
    username: string,
    updates: Partial<User>,
  ) => void;
  removeServerUser: (serverId: string, username: string) => void;
  getServerUser: (serverId: string, username: string) => User | undefined;
}

export const createServerSlice: StateCreator<
  ServerSlice,
  [
    ["zustand/devtools", never],
    ["zustand/persist", unknown],
    ["zustand/immer", never],
  ],
  [],
  ServerSlice
> = (set, get) => ({
  servers: [],
  currentUser: null,
  isConnecting: false,
  connectionError: null,
  hasConnectedToSavedServers: false,

  addServer: (server) =>
    set(
      (state) => {
        // Check if server already exists
        const exists = state.servers.some((s) => s.id === server.id);
        if (!exists) {
          // Type assertion to avoid TypeScript's type instantiation depth limit with Immer
          const servers = state.servers as unknown as Server[];
          servers.push(server);
        }
      },
      false,
      "server/add",
    ),

  updateServer: (serverId, updates) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          Object.assign(server, updates);
        }
      },
      false,
      "server/update",
    ),

  removeServer: (serverId) =>
    set(
      (state) => {
        state.servers = state.servers.filter((s) => s.id !== serverId);
      },
      false,
      "server/remove",
    ),

  getServer: (serverId) => {
    return get().servers.find((s) => s.id === serverId);
  },

  getServerByHost: (host, port) => {
    return get().servers.find((s) => s.host === host && s.port === port);
  },

  setConnectionState: (serverId, connectionState) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          server.connectionState = connectionState;
          server.isConnected = connectionState === "connected";
        }
      },
      false,
      "server/connectionState",
    ),

  setIsConnecting: (isConnecting) =>
    set(
      (state) => {
        state.isConnecting = isConnecting;
      },
      false,
      "server/isConnecting",
    ),

  setConnectionError: (error) =>
    set(
      (state) => {
        state.connectionError = error;
      },
      false,
      "server/connectionError",
    ),

  setHasConnectedToSavedServers: (hasConnected) =>
    set(
      (state) => {
        state.hasConnectedToSavedServers = hasConnected;
      },
      false,
      "server/hasConnected",
    ),

  setCurrentUser: (user) =>
    set(
      (state) => {
        state.currentUser = user;
      },
      false,
      "server/currentUser/set",
    ),

  updateCurrentUser: (updates) =>
    set(
      (state) => {
        if (state.currentUser) {
          Object.assign(state.currentUser, updates);
        }
      },
      false,
      "server/currentUser/update",
    ),

  addChannelToServer: (serverId, channel) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          // Check if channel already exists
          const exists = server.channels.some((c) => c.id === channel.id);
          if (!exists) {
            // Type assertion to avoid TypeScript's type instantiation depth limit with Immer
            const channels = server.channels as unknown as Channel[];
            channels.push(channel);
          }
        }
      },
      false,
      "server/channel/add",
    ),

  removeChannelFromServer: (serverId, channelName) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          server.channels = server.channels.filter(
            (c) => c.name.toLowerCase() !== channelName.toLowerCase(),
          );
        }
      },
      false,
      "server/channel/remove",
    ),

  updateChannel: (serverId, channelId, updates) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          const channel = server.channels.find((c) => c.id === channelId);
          if (channel) {
            Object.assign(channel, updates);
          }
        }
      },
      false,
      "server/channel/update",
    ),

  getChannel: (serverId, channelId) => {
    const server = get().getServer(serverId);
    return server?.channels.find((c) => c.id === channelId);
  },

  getChannelByName: (serverId, channelName) => {
    const server = get().getServer(serverId);
    return server?.channels.find(
      (c) => c.name.toLowerCase() === channelName.toLowerCase(),
    );
  },

  addUserToChannel: (serverId, channelName, user) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          const channel = server.channels.find(
            (c) => c.name.toLowerCase() === channelName.toLowerCase(),
          );
          if (channel) {
            // Check if user already exists
            const exists = channel.users.some(
              (u) => u.username === user.username,
            );
            if (!exists) {
              // Type assertion to avoid TypeScript's type instantiation depth limit with Immer
              const users = channel.users as unknown as User[];
              users.push(user);
            }
          }
        }
      },
      false,
      "server/channel/user/add",
    ),

  removeUserFromChannel: (serverId, channelName, username) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          const channel = server.channels.find(
            (c) => c.name.toLowerCase() === channelName.toLowerCase(),
          );
          if (channel) {
            channel.users = channel.users.filter(
              (u) => u.username !== username,
            );
          }
        }
      },
      false,
      "server/channel/user/remove",
    ),

  updateUserInChannel: (serverId, channelName, username, updates) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          const channel = server.channels.find(
            (c) => c.name.toLowerCase() === channelName.toLowerCase(),
          );
          if (channel) {
            const user = channel.users.find((u) => u.username === username);
            if (user) {
              Object.assign(user, updates);
            }
          }
        }
      },
      false,
      "server/channel/user/update",
    ),

  getUserInChannel: (serverId, channelName, username) => {
    const server = get().getServer(serverId);
    const channel = server?.channels.find(
      (c) => c.name.toLowerCase() === channelName.toLowerCase(),
    );
    return channel?.users.find((u) => u.username === username);
  },

  addPrivateChatToServer: (serverId, privateChat) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          if (!server.privateChats) {
            server.privateChats = [];
          }
          // Check if already exists
          const exists = server.privateChats.some(
            (pc) => pc.id === privateChat.id,
          );
          if (!exists) {
            // Type assertion to avoid TypeScript's type instantiation depth limit with Immer
            const privateChats =
              server.privateChats as unknown as PrivateChat[];
            privateChats.push(privateChat);
          }
        }
      },
      false,
      "server/privateChat/add",
    ),

  removePrivateChatFromServer: (serverId, privateChatId) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server?.privateChats) {
          server.privateChats = server.privateChats.filter(
            (pc) => pc.id !== privateChatId,
          );
        }
      },
      false,
      "server/privateChat/remove",
    ),

  updatePrivateChat: (serverId, privateChatId, updates) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server?.privateChats) {
          const privateChat = server.privateChats.find(
            (pc) => pc.id === privateChatId,
          );
          if (privateChat) {
            Object.assign(privateChat, updates);
          }
        }
      },
      false,
      "server/privateChat/update",
    ),

  getPrivateChat: (serverId, privateChatId) => {
    const server = get().getServer(serverId);
    return server?.privateChats?.find((pc) => pc.id === privateChatId);
  },

  getPrivateChatByUsername: (serverId, username) => {
    const server = get().getServer(serverId);
    return server?.privateChats?.find(
      (pc) => pc.username.toLowerCase() === username.toLowerCase(),
    );
  },

  setServerCapabilities: (serverId, capabilities) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          server.capabilities = capabilities;
        }
      },
      false,
      "server/capabilities/set",
    ),

  addServerCapability: (serverId, capability) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          if (!server.capabilities) {
            server.capabilities = [];
          }
          if (!server.capabilities.includes(capability)) {
            // Type assertion to avoid TypeScript's type instantiation depth limit with Immer
            const capabilities = server.capabilities as unknown as string[];
            capabilities.push(capability);
          }
        }
      },
      false,
      "server/capabilities/add",
    ),

  hasServerCapability: (serverId, capability) => {
    const server = get().getServer(serverId);
    return server?.capabilities?.includes(capability) || false;
  },

  updateServerMetadata: (serverId, metadata) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          server.metadata = {
            ...server.metadata,
            ...metadata,
          } as typeof server.metadata;
        }
      },
      false,
      "server/metadata/update",
    ),

  setChannelUsers: (serverId, channelName, users) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          const channel = server.channels.find(
            (c) => c.name.toLowerCase() === channelName.toLowerCase(),
          );
          if (channel) {
            channel.users = users;
          }
        }
      },
      false,
      "server/channel/users/set",
    ),

  addServerUser: (serverId, user) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          if (!server.users) {
            server.users = [];
          }
          const exists = server.users.some((u) => u.username === user.username);
          if (!exists) {
            // Type assertion to avoid TypeScript's type instantiation depth limit with Immer
            const users = server.users as unknown as User[];
            users.push(user);
          }
        }
      },
      false,
      "server/user/add",
    ),

  updateServerUser: (serverId, username, updates) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server?.users) {
          const user = server.users.find((u) => u.username === username);
          if (user) {
            Object.assign(user, updates);
          }
        }
      },
      false,
      "server/user/update",
    ),

  removeServerUser: (serverId, username) =>
    set(
      (state) => {
        const server = state.servers.find((s) => s.id === serverId);
        if (server?.users) {
          server.users = server.users.filter((u) => u.username !== username);
        }
      },
      false,
      "server/user/remove",
    ),

  getServerUser: (serverId, username) => {
    const server = get().getServer(serverId);
    return server?.users?.find((u) => u.username === username);
  },
});
