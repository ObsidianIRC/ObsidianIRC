import type { PersistOptions } from "zustand/middleware";
import type { AppState } from "../types";

/**
 * Centralized persist configuration for the store
 * Replaces all manual localStorage operations
 */
export const persistConfig: PersistOptions<AppState> = {
  name: "obsidian-irc-storage",
  version: 1,

  // Select only what should be persisted
  partialize: (state) => {
    return {
      // Settings - persist all settings
      globalSettings: state.globalSettings,

      // Servers - persist server list and configurations including credentials
      servers: state.servers?.map((server) => ({
        id: server.id,
        name: server.name,
        host: server.host,
        port: server.port,
        nickname: server.nickname,
        password: server.password,
        saslAccountName: server.saslAccountName,
        saslPassword: server.saslPassword,
        saslEnabled: server.saslEnabled,
        // Don't persist connection state or live data
        // These will be restored on reconnect
      })),

      // Channel order - persist user's channel organization
      channelOrder: state.channelOrder,

      // Pinned private chats
      // Extract pinned chats from servers
      pinnedPrivateChats: (() => {
        const pinned: Record<
          string,
          Array<{ username: string; order: number }>
        > = {};
        if (state.servers) {
          for (const server of state.servers) {
            if (server.privateChats) {
              const pinnedChats = server.privateChats
                .filter((pc) => pc.isPinned)
                .map((pc) => ({
                  username: pc.username,
                  order: pc.order || 0,
                }));
              if (pinnedChats.length > 0) {
                pinned[server.id] = pinnedChats;
              }
            }
          }
        }
        return pinned;
      })(),

      // Metadata cache (for performance)
      channelMetadataCache: state.channelMetadataCache,

      // Don't persist:
      // - messages (too large, fetched from server)
      // - typingUsers (ephemeral)
      // - globalNotifications (ephemeral)
      // - ui state (ephemeral)
      // - isConnecting, connectionError (transient)
      // - metadataBatches, activeBatches (transient)
    } as unknown as AppState;
  },

  // Migration function for version changes
  migrate: (persistedState: unknown, version: number) => {
    // Handle migrations from old store structure
    if (version === 0) {
      // Version 0 → 1: Migrate from old monolithic structure
      // Map old localStorage keys to new structure

      const migrated = { ...(persistedState as Record<string, unknown>) };

      // Migrate old savedServers if exists
      try {
        const oldServers = localStorage.getItem("savedServers");
        if (oldServers && !migrated.servers) {
          migrated.servers = JSON.parse(oldServers);
        }
      } catch (e) {
        console.error("Migration error for savedServers:", e);
      }

      // Migrate old settings if exists
      try {
        const oldSettings = localStorage.getItem("globalSettings");
        if (oldSettings && !migrated.globalSettings) {
          migrated.globalSettings = JSON.parse(oldSettings);
        }
      } catch (e) {
        console.error("Migration error for globalSettings:", e);
      }

      // Migrate old channel order if exists
      try {
        const oldChannelOrder = localStorage.getItem("channelOrder");
        if (oldChannelOrder && !migrated.channelOrder) {
          migrated.channelOrder = JSON.parse(oldChannelOrder);
        }
      } catch (e) {
        console.error("Migration error for channelOrder:", e);
      }

      // Migrate old pinned chats if exists
      try {
        const oldPinnedChats = localStorage.getItem("pinnedPrivateChats");
        if (oldPinnedChats && !migrated.pinnedPrivateChats) {
          migrated.pinnedPrivateChats = JSON.parse(oldPinnedChats);
        }
      } catch (e) {
        console.error("Migration error for pinnedPrivateChats:", e);
      }

      return migrated as unknown as AppState;
    }

    return persistedState as unknown as AppState;
  },

  // Merge function to handle hydration
  merge: (persistedState, currentState) => {
    // Merge persisted state into current state
    // This runs when the store is initialized
    return {
      ...currentState,
      ...(persistedState as object),
    };
  },
};
