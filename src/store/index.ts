import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import ircClient from "../lib/ircClient";
import { registerAllProtocolHandlers } from "../protocol";
import type {
  Channel,
  Message,
  PrivateChat,
  Server,
  ServerConfig,
  User,
} from "../types";

const LOCAL_STORAGE_SERVERS_KEY = "savedServers";

export const getChannelMessages = (serverId: string, channelId: string) => {
  const state = useStore.getState();
  const key = `${serverId}-${channelId}`;
  return state.messages[key] || [];
};

export const findChannelMessageById = (
  serverId: string,
  channelId: string,
  messageId: string,
): Message | undefined => {
  const messages = getChannelMessages(serverId, channelId);
  return messages.find((message) => message.id === messageId);
};
// Load saved servers from localStorage
export function loadSavedServers(): ServerConfig[] {
  return JSON.parse(localStorage.getItem(LOCAL_STORAGE_SERVERS_KEY) || "[]");
}

function saveServersToLocalStorage(servers: ServerConfig[]) {
  localStorage.setItem(LOCAL_STORAGE_SERVERS_KEY, JSON.stringify(servers));
}

interface UIState {
  selectedServerId: string | null;
  selectedChannelId: string | null;
  selectedPrivateChatId: string | null;
  isAddServerModalOpen: boolean | undefined;
  isSettingsModalOpen: boolean;
  isUserProfileModalOpen: boolean;
  isDarkMode: boolean;
  isMobileMenuOpen: boolean;
  isMemberListVisible: boolean;
  isChannelListVisible: boolean;
  mobileViewActiveColumn: layoutColumn;
  isServerMenuOpen: boolean;
  contextMenu: {
    isOpen: boolean;
    x: number;
    y: number;
    type: "server" | "channel" | "user" | "message";
    itemId: string | null;
  };
  prefillServerDetails: ConnectionDetails | null;
}

interface GlobalSettings {
  enableNotifications: boolean;
}

export interface AppState {
  servers: Server[];
  currentUser: User | null;
  isConnecting: boolean;
  selectedServerId: string | null;
  connectionError: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, User[]>;
  // Metadata state
  metadataSubscriptions: Record<string, string[]>; // serverId -> keys
  metadataBatches: Record<string, { type: string; messages: { target: string; key: string; visibility: string; value: string }[] }>; // batchId -> batch info
  // UI state
  ui: UIState;
  globalSettings: GlobalSettings;
  // Actions
  connect: (
    host: string,
    port: number,
    nickname: string,
    saslEnabled: boolean,
    password?: string,
    saslAccountName?: string,
    saslPassword?: string,
  ) => Promise<Server>;
  disconnect: (serverId: string) => void;
  joinChannel: (serverId: string, channelName: string) => void;
  leaveChannel: (serverId: string, channelName: string) => void;
  sendMessage: (serverId: string, channelId: string, content: string) => void;
  kickUser: (
    serverId: string,
    channelName: string,
    username: string,
    reason: string,
  ) => void;
  banUser: (
    serverId: string,
    channelName: string,
    username: string,
    reason: string,
  ) => void;
  addMessage: (message: Message) => void;
  selectServer: (serverId: string | null) => void;
  selectChannel: (channelId: string | null) => void;
  selectPrivateChat: (privateChatId: string | null) => void;
  openPrivateChat: (serverId: string, username: string) => void;
  deletePrivateChat: (serverId: string, privateChatId: string) => void;
  markChannelAsRead: (serverId: string, channelId: string) => void;
  connectToSavedServers: () => void; // New action to load servers from localStorage
  deleteServer: (serverId: string) => void; // New action to delete a server
  capAck: (serverId: string, key: string, capabilities: string) => void; // Handle CAP ACK
  // UI actions
  toggleAddServerModal: (
    isOpen?: boolean,
    prefillDetails?: ConnectionDetails | null,
  ) => void;
  toggleSettingsModal: (isOpen?: boolean) => void;
  toggleUserProfileModal: (isOpen?: boolean) => void;
  toggleDarkMode: () => void;
  toggleMobileMenu: (isOpen?: boolean) => void;
  toggleMemberList: (isVisible?: boolean) => void;
  toggleChannelList: (isOpen?: boolean) => void;
  toggleServerMenu: (isOpen?: boolean) => void;
  showContextMenu: (
    x: number,
    y: number,
    type: "server" | "channel" | "user" | "message",
    itemId: string,
  ) => void;
  hideContextMenu: () => void;
  setMobileViewActiveColumn: (column: layoutColumn) => void;
  // Metadata actions
  metadataGet: (serverId: string, target: string, keys: string[]) => void;
  metadataList: (serverId: string, target: string) => void;
  metadataSet: (serverId: string, target: string, key: string, value?: string) => void;
  metadataClear: (serverId: string, target: string) => void;
  metadataSub: (serverId: string, keys: string[]) => void;
  metadataUnsub: (serverId: string, keys: string[]) => void;
  metadataSubs: (serverId: string) => void;
  metadataSync: (serverId: string, target: string) => void;
}

// Create store with Zustand
const useStore = create<AppState>((set, get) => ({
  servers: [],
  currentUser: null,
  isConnecting: false,
  connectionError: null,
  messages: {},
  typingUsers: {},
  metadataSubscriptions: {},
  metadataBatches: {},
  selectedServerId: null,

  // UI state
  ui: {
    selectedServerId: null,
    selectedChannelId: null,
    selectedPrivateChatId: null,
    isAddServerModalOpen: false,
    isSettingsModalOpen: false,
    isUserProfileModalOpen: false,
    isDarkMode: true, // Discord-like default is dark mode
    isMobileMenuOpen: false,
    isMemberListVisible: true,
    isChannelListVisible: true,
    mobileViewActiveColumn: "serverList", // Default to server list in mobile mode on open
    isServerMenuOpen: false,
    contextMenu: {
      isOpen: false,
      x: 0,
      y: 0,
      type: "server",
      itemId: null,
    },
    prefillServerDetails: null,
  },
  globalSettings: {
    enableNotifications: false,
  },

  // IRC client actions
  connect: async (
    host,
    port,
    nickname,
    _saslEnabled,
    password,
    saslAccountName,
    saslPassword,
  ) => {
    set({ isConnecting: true, connectionError: null });

    try {
      const server = await ircClient.connect(
        host,
        port,
        nickname,
        password,
        saslAccountName,
        saslPassword,
      );

      // Save server to localStorage
      const savedServers: ServerConfig[] = loadSavedServers();
      const savedServer = savedServers.find(
        (s) => s.host === host && s.port === port,
      );
      const channelsToJoin = savedServer?.channels || [];

      const updatedServers = savedServers.filter(
        (s) => s.host !== host || s.port !== port,
      );
      updatedServers.push({
        id: server.id, // Include the server ID here
        host,
        port,
        nickname,
        saslEnabled: !!saslPassword,
        password,
        channels: channelsToJoin,
        saslAccountName,
        saslPassword,
      });
      saveServersToLocalStorage(updatedServers);

      set((state) => ({
        servers: [...state.servers, server],
        currentUser: ircClient.getCurrentUser(),
        isConnecting: false,
      }));

      return server;
    } catch (error) {
      set({
        isConnecting: false,
        connectionError:
          error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },

  disconnect: (serverId) => {
    ircClient.disconnect(serverId);

    // Update the state to reflect disconnection
    set((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          return { ...server, isConnected: false };
        }
        return server;
      });

      // Update selected server/channel if we were on the disconnected server
      let newUi = { ...state.ui };
      if (state.ui.selectedServerId === serverId) {
        // Find another connected server, or set to null
        const nextServer = updatedServers.find(
          (s) => s.isConnected && s.id !== serverId,
        );
        newUi = {
          ...newUi,
          selectedServerId: nextServer?.id || null,
          selectedChannelId: nextServer?.channels[0]?.id || null,
        };
      }

      return {
        servers: updatedServers,
        ui: newUi,
      };
    });
  },

  joinChannel: (serverId, channelName) => {
    const channel = ircClient.joinChannel(serverId, channelName);
    if (channel) {
      set((state) => {
        const updatedServers = state.servers.map((server) => {
          if (server.id === serverId) {
            return {
              ...server,
              channels: [...server.channels, channel],
            };
          }
          return server;
        });

        // Update localStorage with the new channel
        const savedServers = loadSavedServers();
        const savedServer = savedServers.find((s) => s.id === serverId);
        if (savedServer) {
          savedServer.channels.push(channel.name);
          saveServersToLocalStorage(savedServers);
        }

        // Update the selected channel if the server matches the current selection
        const isCurrentServer = state.ui.selectedServerId === serverId;

        return {
          servers: updatedServers,
          ui: {
            ...state.ui,
            selectedChannelId: isCurrentServer
              ? channel.id
              : state.ui.selectedChannelId,
          },
        };
      });
    }
  },

  leaveChannel: (serverId, channelName) => {
    ircClient.leaveChannel(serverId, channelName); // Send PART command to the IRC server

    set((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          return {
            ...server,
            channels: server.channels.filter(
              (channel) => channel.name !== channelName,
            ),
          };
        }
        return server;
      });

      // Update localStorage to remove the channel
      const savedServers = loadSavedServers();
      const savedServer = savedServers.find(
        (s: { host: string }) =>
          s.host ===
          updatedServers.find(
            (s: { id: string; host: string }) => s.id === serverId,
          )?.host,
      );
      if (savedServer) {
        savedServer.channels =
          updatedServers
            .find((s) => s.id === serverId)
            ?.channels.map((c) => c.name) || [];
        saveServersToLocalStorage(savedServers);
      }

      return { servers: updatedServers };
    });
  },

  sendMessage: (serverId, channelId, content) => {
    const message = ircClient.sendMessage(serverId, channelId, content);
  },

  kickUser: (serverId, channelName, username, reason) => {
    ircClient.sendRaw(serverId, `KICK ${channelName} ${username} :${reason}`);
  },

  banUser: (serverId, channelName, username, reason) => {
    // First ban, then kick
    ircClient.sendRaw(serverId, `MODE ${channelName} +b ${username}!*@*`);
    ircClient.sendRaw(serverId, `KICK ${channelName} ${username} :${reason}`);
  },

  addMessage: (message) => {
    set((state) => {
      const channelKey = `${message.serverId}-${message.channelId}`;
      const currentMessages = state.messages[channelKey] || [];
      return {
        messages: {
          ...state.messages,
          [channelKey]: [...currentMessages, message],
        },
      };
    });
  },

  selectServer: (serverId) => {
    set((state) => {
      // Find the server
      const server = state.servers.find((s) => s.id === serverId);
      // If server exists, select its first channel, otherwise set to null
      const channelId = server?.channels[0]?.id || null;

      return {
        ui: {
          ...state.ui,
          selectedServerId: serverId,
          selectedChannelId: channelId,
          selectedPrivateChatId: null, // Clear private chat selection
          isMobileMenuOpen: false,
        },
      };
    });
  },

  selectChannel: (channelId) => {
    set((state) => {
      // Find which server this channel belongs to
      let serverId = state.ui.selectedServerId;

      // If we don't have a server selected or the channel doesn't belong to the selected server
      if (!serverId) {
        for (const server of state.servers) {
          if (server.channels.some((c) => c.id === channelId)) {
            serverId = server.id;
            break;
          }
        }
      }

      // Mark channel as read
      if (serverId && channelId) {
        ircClient.markChannelAsRead(serverId, channelId);

        // Update unread state in store
        const updatedServers = state.servers.map((server) => {
          if (server.id === serverId) {
            const updatedChannels = server.channels.map((channel) => {
              if (channel.id === channelId) {
                return {
                  ...channel,
                  unreadCount: 0,
                  isMentioned: false,
                };
              }
              return channel;
            });

            return {
              ...server,
              channels: updatedChannels,
            };
          }
          return server;
        });

        return {
          servers: updatedServers,
          ui: {
            ...state.ui,
            selectedServerId: serverId,
            selectedChannelId: channelId,
            selectedPrivateChatId: null, // Clear private chat selection
            isMobileMenuOpen: false,
            mobileViewActiveColumn: "chatView",
          },
        };
      }

      return {
        ui: {
          ...state.ui,
          selectedChannelId: channelId,
          selectedPrivateChatId: null, // Clear private chat selection
          isMobileMenuOpen: false,
          mobileViewActiveColumn: "chatView",
        },
      };
    });
  },

  markChannelAsRead: (serverId, channelId) => {
    ircClient.markChannelAsRead(serverId, channelId);

    set((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((channel) => {
            if (channel.id === channelId) {
              return {
                ...channel,
                unreadCount: 0,
                isMentioned: false,
              };
            }
            return channel;
          });

          return {
            ...server,
            channels: updatedChannels,
          };
        }
        return server;
      });

      return {
        servers: updatedServers,
      };
    });
  },

  selectPrivateChat: (privateChatId) => {
    set((state) => {
      // Find which server this private chat belongs to
      let serverId = state.ui.selectedServerId;

      if (!serverId) {
        for (const server of state.servers) {
          if (server.privateChats?.some((pc) => pc.id === privateChatId)) {
            serverId = server.id;
            break;
          }
        }
      }

      // Mark private chat as read
      if (serverId && privateChatId) {
        const updatedServers = state.servers.map((server) => {
          if (server.id === serverId) {
            const updatedPrivateChats =
              server.privateChats?.map((privateChat) => {
                if (privateChat.id === privateChatId) {
                  return {
                    ...privateChat,
                    unreadCount: 0,
                    isMentioned: false,
                  };
                }
                return privateChat;
              }) || [];

            return {
              ...server,
              privateChats: updatedPrivateChats,
            };
          }
          return server;
        });

        return {
          servers: updatedServers,
          ui: {
            ...state.ui,
            selectedServerId: serverId,
            selectedChannelId: null, // Clear channel selection
            selectedPrivateChatId: privateChatId,
            isMobileMenuOpen: false,
            mobileViewActiveColumn: "chatView",
          },
        };
      }

      return {
        ui: {
          ...state.ui,
          selectedChannelId: null, // Clear channel selection
          selectedPrivateChatId: privateChatId,
          isMobileMenuOpen: false,
          mobileViewActiveColumn: "chatView",
        },
      };
    });
  },

  openPrivateChat: (serverId, username) => {
    set((state) => {
      const server = state.servers.find((s) => s.id === serverId);
      if (!server) return {};

      // Don't allow opening private chats with ourselves
      if (state.currentUser?.username === username) {
        return {};
      }

      // Check if private chat already exists
      const existingChat = server.privateChats?.find(
        (pc) => pc.username === username,
      );
      if (existingChat) {
        // Select existing private chat
        return {
          ui: {
            ...state.ui,
            selectedServerId: serverId,
            selectedChannelId: null,
            selectedPrivateChatId: existingChat.id,
            isMobileMenuOpen: false,
            mobileViewActiveColumn: "chatView",
          },
        };
      }

      // Create new private chat
      const newPrivateChat: PrivateChat = {
        id: uuidv4(),
        username,
        serverId,
        unreadCount: 0,
        isMentioned: false,
        lastActivity: new Date(),
      };

      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          return {
            ...s,
            privateChats: [...(s.privateChats || []), newPrivateChat],
          };
        }
        return s;
      });

      return {
        servers: updatedServers,
        ui: {
          ...state.ui,
          selectedServerId: serverId,
          selectedChannelId: null,
          selectedPrivateChatId: newPrivateChat.id,
          isMobileMenuOpen: false,
          mobileViewActiveColumn: "chatView",
        },
      };
    });
  },

  deletePrivateChat: (serverId, privateChatId) => {
    set((state) => {
      const server = state.servers.find((s) => s.id === serverId);
      if (!server) return {};

      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          return {
            ...s,
            privateChats:
              s.privateChats?.filter((pc) => pc.id !== privateChatId) || [],
          };
        }
        return s;
      });

      // If the deleted private chat was selected, clear the selection
      const newState: Partial<AppState> = {
        servers: updatedServers,
      };

      if (state.ui.selectedPrivateChatId === privateChatId) {
        newState.ui = {
          ...state.ui,
          selectedPrivateChatId: null,
          selectedChannelId: null,
        };
      }

      return newState;
    });
  },

  connectToSavedServers: async () => {
    const savedServers = loadSavedServers();
    for (const {
      host,
      port,
      nickname,
      password,
      channels,
      saslEnabled,
      saslAccountName,
      saslPassword,
    } of savedServers) {
      try {
        const server = await get().connect(
          host,
          port,
          nickname,
          saslEnabled,
          password,
          saslAccountName,
          saslPassword,
        );
      } catch (error) {
        console.error(`Failed to reconnect to server ${host}:${port}`, error);
      }
    }
  },

  deleteServer: (serverId) => {
    set((state) => {
      const serverToDelete = state.servers.find(
        (server) => server.id === serverId,
      );

      // Remove server from localStorage
      const savedServers = loadSavedServers();
      const updatedServers = savedServers.filter(
        (s) =>
          s.host !== serverToDelete?.host || s.port !== serverToDelete?.port,
      );
      saveServersToLocalStorage(updatedServers);

      // Update state
      const remainingServers = state.servers.filter(
        (server) => server.id !== serverId,
      );
      const newSelectedServerId =
        remainingServers.length > 0 ? remainingServers[0].id : null;

      return {
        servers: remainingServers,
        ui: {
          ...state.ui,
          selectedServerId: newSelectedServerId,
          selectedChannelId: newSelectedServerId
            ? remainingServers[0].channels[0]?.id || null
            : null,
        },
      };
    });

    ircClient.disconnect(serverId);
  },

  // UI actions
  toggleAddServerModal: (isOpen, prefillDetails = null) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isAddServerModalOpen: isOpen,
        prefillServerDetails: prefillDetails,
      },
    }));
  },

  toggleSettingsModal: (isOpen) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isSettingsModalOpen:
          isOpen !== undefined ? isOpen : !state.ui.isSettingsModalOpen,
      },
    }));
  },

  toggleUserProfileModal: (isOpen) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isUserProfileModalOpen:
          isOpen !== undefined ? isOpen : !state.ui.isUserProfileModalOpen,
      },
    }));
  },

  toggleDarkMode: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        isDarkMode: !state.ui.isDarkMode,
      },
    }));
  },

  toggleMobileMenu: (isOpen) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isMobileMenuOpen:
          isOpen !== undefined ? isOpen : !state.ui.isMobileMenuOpen,
      },
    }));
  },

  toggleMemberList: (isOpen) => {
    set((state) => {
      const openState =
        isOpen !== undefined ? isOpen : !state.ui.isChannelListVisible;
      return {
        ui: {
          ...state.ui,
          isMemberListVisible:
            openState !== undefined ? openState : !state.ui.isMemberListVisible,
          mobileViewActiveColumn: openState ? "memberList" : "chatView",
        },
      };
    });
  },

  toggleChannelList: (isOpen) => {
    console.log("Toggling channel list", isOpen);
    set((state) => {
      const openState =
        isOpen !== undefined ? isOpen : !state.ui.isChannelListVisible;
      return {
        ui: {
          ...state.ui,
          isChannelListVisible: openState,
          mobileViewActiveColumn: openState
            ? "serverList"
            : state.ui.mobileViewActiveColumn,
        },
      };
    });
  },

  toggleServerMenu: (isOpen) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isServerMenuOpen:
          isOpen !== undefined ? isOpen : !state.ui.isServerMenuOpen,
      },
    }));
  },

  showContextMenu: (x, y, type, itemId) => {
    set((state) => ({
      ui: {
        ...state.ui,
        contextMenu: {
          isOpen: true,
          x,
          y,
          type,
          itemId,
        },
      },
    }));
  },

  hideContextMenu: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        contextMenu: {
          ...state.ui.contextMenu,
          isOpen: false,
        },
      },
    }));
  },

  setMobileViewActiveColumn: (column: layoutColumn) => {
    set((state) => ({
      ui: {
        ...state.ui,
        mobileViewActiveColumn: column,
      },
    }));
  },

  // Metadata actions
  metadataGet: (serverId, target, keys) => {
    ircClient.metadataGet(serverId, target, keys);
  },

  metadataList: (serverId, target) => {
    ircClient.metadataList(serverId, target);
  },

  metadataSet: (serverId, target, key, value) => {
    ircClient.metadataSet(serverId, target, key, value);
  },

  metadataClear: (serverId, target) => {
    ircClient.metadataClear(serverId, target);
  },

  metadataSub: (serverId, keys) => {
    ircClient.metadataSub(serverId, keys);
  },

  metadataUnsub: (serverId, keys) => {
    ircClient.metadataUnsub(serverId, keys);
  },

  metadataSubs: (serverId) => {
    ircClient.metadataSubs(serverId);
  },

  metadataSync: (serverId, target) => {
    ircClient.metadataSync(serverId, target);
  },

  capAck: (serverId, key, capabilities) => {
    ircClient.capAck(serverId, key, capabilities);
  },
}));

// Initialize protocol handlers
registerAllProtocolHandlers(ircClient, useStore);

// Set up event listeners for IRC client events
//
// TODO: We should have actual events here, The commended ones are never fired and seems to be causing a bug with the state management
// ircClient.on(
//   "message",
//   (response: { serverId: string; channelId: string; message: Message }) => {
//     const { serverId, channelId, message } = response;
//     console.log(`MSG: ${message}`);
//     useStore.getState().addMessage(message);
//   },
// );

// ircClient.on("system_message", (response: { message: Message }) => {
//   const { message } = response;
//   useStore.getState().addMessage(message);
// });

// ircClient.on("connect", (response: { servers: Server[] }) => {
//   const { servers } = response;
//   useStore.setState({ servers });
// });

// ircClient.on("disconnect", (response: { serverId: string }) => {
//   const { serverId } = response;
//   if (serverId) {
//     // Update specific server status
//     useStore.setState((state) => ({
//       servers: state.servers.map((server) =>
//         server.id === serverId ? { ...server, isConnected: false } : server,
//       ),
//     }));
//   } else {
//     // Refresh servers list
//     const servers = ircClient.getServers();
//     useStore.setState({ servers });
//   }
// });

ircClient.on("CHANMSG", (response) => {
  const { mtags, channelName, message, timestamp } = response;

  // Find the server and channel
  const server = useStore
    .getState()
    .servers.find((s) => s.id === response.serverId);

  if (server) {
    const channel = server.channels.find((c) => c.name === channelName);
    const replyTo = null;

    if (channel) {
      const replyId = mtags?.["+draft/reply"]
        ? mtags["+draft/reply"].trim()
        : null;

      const replyMessage = replyId
        ? findChannelMessageById(server.id, channel.id, replyId)
        : null;

      const newMessage = {
        id: replyId ? replyId : uuidv4(),
        msgid: mtags?.msgid,
        content: message,
        timestamp,
        userId: response.sender,
        channelId: channel.id,
        serverId: server.id,
        type: "message" as const,
        reactions: [],
        replyMessage: replyMessage,
        mentioned: [], // Add logic for mentions if needed
      };

      useStore.getState().addMessage(newMessage);
      // Remove any typing users from the state
      useStore.setState((state) => {
        const key = `${server.id}-${channel.id}`;
        const currentUsers = state.typingUsers[key] || [];
        return {
          typingUsers: {
            ...state.typingUsers,
            [key]: currentUsers.filter((u) => u.username !== response.sender),
          },
        };
      });
    }
  }
});

// Handle private messages (USERMSG)
ircClient.on("USERMSG", (response) => {
  const { mtags, sender, message, timestamp } = response;

  // Don't create private chats with ourselves when the server echoes back our own messages
  const currentUser = useStore.getState().currentUser;
  if (currentUser?.username === sender) {
    return;
  }

  // Find the server
  const server = useStore
    .getState()
    .servers.find((s) => s.id === response.serverId);

  if (server) {
    // Find or create private chat
    let privateChat = server.privateChats?.find((pc) => pc.username === sender);

    if (!privateChat) {
      // Auto-create private chat when receiving a message
      useStore.getState().openPrivateChat(server.id, sender);
      // Get the newly created private chat
      privateChat = useStore
        .getState()
        .servers.find((s) => s.id === server.id)
        ?.privateChats?.find((pc) => pc.username === sender);
    }

    if (privateChat) {
      const newMessage = {
        id: uuidv4(),
        msgid: mtags?.msgid,
        content: message,
        timestamp,
        userId: sender,
        channelId: privateChat.id, // Use private chat ID as channel ID
        serverId: server.id,
        type: "message" as const,
        reactions: [],
        replyMessage: null,
        mentioned: [], // PMs don't have mentions in the traditional sense
      };

      useStore.getState().addMessage(newMessage);

      // Remove any typing users from the state
      useStore.setState((state) => {
        const key = `${server.id}-${privateChat.id}`;
        const currentUsers = state.typingUsers[key] || [];
        return {
          typingUsers: {
            ...state.typingUsers,
            [key]: currentUsers.filter((u) => u.username !== sender),
          },
        };
      });

      // Update private chat's last activity and unread count
      useStore.setState((state) => {
        const updatedServers = state.servers.map((s) => {
          if (s.id === server.id) {
            const updatedPrivateChats =
              s.privateChats?.map((pc) => {
                if (pc.id === privateChat.id) {
                  return {
                    ...pc,
                    lastActivity: new Date(),
                    unreadCount:
                      state.ui.selectedPrivateChatId === pc.id
                        ? 0
                        : pc.unreadCount + 1,
                  };
                }
                return pc;
              }) || [];
            return { ...s, privateChats: updatedPrivateChats };
          }
          return s;
        });
        return { servers: updatedServers };
      });
    }
  }
});

ircClient.on("NAMES", ({ serverId, channelName, users }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        const updatedChannels = server.channels.map((channel) => {
          if (channel.name === channelName) {
            return { ...channel, users };
          }
          return channel;
        });

        return { ...server, channels: updatedChannels };
      }
      return server;
    });

    return { servers: updatedServers };
  });
});

ircClient.on("JOIN", ({ serverId, username, channelName }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        const existingChannel = server.channels.find(
          (channel) => channel.name === channelName,
        );

        if (!existingChannel) {
          const newChannel: Channel = {
            id: uuidv4(),
            name: channelName,
            topic: "",
            isPrivate: false,
            serverId,
            unreadCount: 0,
            isMentioned: false,
            messages: [],
            users: [],
          };

          return {
            ...server,
            channels: [...server.channels, newChannel],
          };
        }
        const updatedChannels = server.channels.map((channel) => {
          if (channel.name === channelName) {
            const userAlreadyExists = channel.users.some(
              (user) => user.username === username,
            );
            if (!userAlreadyExists) {
              return {
                ...channel,
                users: [
                  ...channel.users,
                  {
                    id: uuidv4(), // Again, give them a unique ID
                    username,
                    isOnline: true,
                    status: "",
                  },
                ],
              };
            }
          }
          return channel;
        });

        return { ...server, channels: updatedChannels };
      }

      return server;
    });

    return { servers: updatedServers };
  });
});

// Handle user being kicked from a channel
ircClient.on("KICK", ({ serverId, target, channelName }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        const updatedChannels = server.channels.map((channel) => {
          if (channel.name === channelName) {
            return {
              ...channel,
              users: channel.users.filter((user) => user.username !== target),
            };
          }
          return channel;
        });
        return { ...server, channels: updatedChannels };
      }
      return server;
    });

    return { servers: updatedServers };
  });
});

// Handle user changing their nickname
ircClient.on("NICK", ({ serverId, oldNick, newNick }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        const updatedChannels = server.channels.map((channel) => {
          const updatedUsers = channel.users.map((user) => {
            if (user.username === oldNick) {
              return { ...user, username: newNick }; // Update the username
            }
            return user;
          });
          return { ...channel, users: updatedUsers };
        });
        return { ...server, channels: updatedChannels };
      }
      return server;
    });

    // Update currentUser if it was our nick that changed
    let updatedCurrentUser = state.currentUser;
    if (state.currentUser && state.currentUser.username === oldNick) {
      updatedCurrentUser = { ...state.currentUser, username: newNick };
    }

    return {
      servers: updatedServers,
      currentUser: updatedCurrentUser,
    };
  });
});

ircClient.on("QUIT", ({ serverId, username, reason }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        const updatedChannels = server.channels.map((channel) => {
          const updatedUsers = channel.users.filter(
            (user) => user.username !== username,
          );
          return { ...channel, users: updatedUsers };
        });

        return { ...server, channels: updatedChannels };
      }
      return server;
    });

    return { servers: updatedServers };
  });
});

ircClient.on("ready", ({ serverId, serverName, nickname }) => {
  console.log(`Server ready: serverId=${serverId}, serverName=${serverName}`);

  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        return { ...server, name: serverName }; // Update the server name for display purposes
      }
      return server;
    });

    return { servers: updatedServers };
  });

  const savedServers = loadSavedServers();
  const savedServer = savedServers.find((s) => s.id === serverId);

  if (savedServer) {
    console.log(`Joining saved channels for serverId=${serverId}`);
    for (const channelName of savedServer.channels) {
      if (channelName) {
        ircClient.joinChannel(serverId, channelName);
      }
    }

    // Update the UI state to reflect the first joined channel
    useStore.setState((state) => ({
      ui: {
        ...state.ui,
        selectedServerId: serverId,
        selectedChannelId: savedServer.channels[0] || null,
      },
    }));
  } else {
    console.warn(`No saved channels found for serverId=${serverId}`);
  }
});

ircClient.on("PART", ({ username, channelName }) => {
  console.log(`User ${username} left channel ${channelName}`);
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      const updatedChannels = server.channels.map((channel) => {
        if (channel.name === channelName) {
          return {
            ...channel,
            users: channel.users.filter((user) => user.username !== username), // Remove the user
          };
        }
        return channel;
      });
      return { ...server, channels: updatedChannels };
    });

    return { servers: updatedServers };
  });
});

ircClient.on("KICK", ({ username, target, channelName, reason }) => {
  console.log(
    `User ${target} was kicked from channel ${channelName} by ${username} for reason: ${reason}`,
  );
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      const updatedChannels = server.channels.map((channel) => {
        if (channel.name === channelName) {
          return {
            ...channel,
            users: channel.users.filter((user) => user.username !== target), // Remove the user
          };
        }
        return channel;
      });
      return { ...server, channels: updatedChannels };
    });

    return { servers: updatedServers };
  });
});

ircClient.on("CAP_ACKNOWLEDGED", ({ serverId, key, capabilities }) => {
  if (key === "sasl") {
    const servers = loadSavedServers();
    for (const serv of servers) {
      if (serv.id !== serverId) continue;

      if (!serv.saslEnabled) return;
    }
    ircClient.sendRaw(serverId, "AUTHENTICATE PLAIN");
  }
});

ircClient.on("AUTHENTICATE", ({ serverId, param }) => {
  console.log(param);
  if (param !== "+") return;

  let user: string | undefined;
  let pass: string | undefined;
  const servers = loadSavedServers();
  for (const serv of servers) {
    if (serv.id !== serverId) continue;

    if (!serv.saslEnabled) return;

    user = serv.saslAccountName?.length ? serv.saslAccountName : serv.nickname;
    pass = serv.saslPassword ? atob(serv.saslPassword) : undefined;
  }
  if (!user || !pass)
    // wtf happened lol
    return;

  ircClient.sendRaw(
    serverId,
    `AUTHENTICATE ${btoa(`${user}\x00${user}\x00${pass}`)}`,
  );
  ircClient.sendRaw(serverId, "CAP END");
  ircClient.nickOnConnect(serverId);
});

ircClient.on("CAP ACK", ({ serverId, cliCaps }) => {
  const caps = cliCaps.split(" ");
  for (const cap of caps) {
    const tok = cap.split("=");
    ircClient.capAck(serverId, tok[0], tok[1] ?? null);
    console.log(`Capability acknowledged: ${cap}`);
  }

  const servers = loadSavedServers();
  let preventCapEnd = false;
  for (const serv of servers) {
    if (serv.id === serverId && serv.saslEnabled) {
      preventCapEnd = true;
    }
  }
  if (!preventCapEnd) {
    console.log(`Sending CAP END for server ${serverId}`);
    ircClient.sendRaw(serverId, "CAP END");
    ircClient.nickOnConnect(serverId);
  } else {
    console.log(`Preventing CAP END for server ${serverId}`);
  }
});

// CTCPs lol
ircClient.on("CHANMSG", (response) => {
  const { channelName, message, timestamp } = response;

  // Find the server and channel
  const server = useStore
    .getState()
    .servers.find((s) => s.id === response.serverId);

  if (!server) return;

  const parv = message.split(" ");
  if (parv[0] === "\u0001VERSION\u0001") {
    ircClient.sendRaw(
      server.id,
      `NOTICE ${response.sender} :\u0001VERSION ObsidianIRC v${ircClient.version}\u0001`,
    );
  }
  if (parv[0] === "\u0001PING") {
    ircClient.sendRaw(
      server.id,
      `NOTICE ${response.sender} :\u0001PING ${parv[1]}\u0001`,
    );
  }
  if (parv[0] === "\u0001TIME\u0001") {
    const date = new Date();
    ircClient.sendRaw(
      server.id,
      `NOTICE ${response.sender} :\u0001TIME ${date.toUTCString()}\u0001`,
    );
  }
});

// TAGMSG typing
ircClient.on("TAGMSG", (response) => {
  const { sender, mtags, channelName } = response;

  // Check if the sender is not the current user
  // we don't care about showing our own typing status
  const currentUser = useStore.getState().currentUser;
  if (sender !== currentUser?.username && mtags && mtags["+typing"]) {
    const isActive = mtags["+typing"] === "active";
    const server = useStore
      .getState()
      .servers.find((s) => s.id === response.serverId);

    if (!server) return;

    let key: string;
    let user: User;

    const isChannel = channelName.startsWith("#");
    if (isChannel) {
      const channel = server.channels.find((c) => c.name === channelName);
      if (!channel) return;

      const foundUser = channel.users.find(
        (u) => u.username === response.sender,
      );
      if (!foundUser) return;
      user = foundUser;

      key = `${server.id}-${channel.id}`;
    } else {
      // Private chat
      const privateChat = server.privateChats?.find(
        (pc) => pc.username === sender,
      );
      if (!privateChat) return;

      // For private chats, create a user object
      user = {
        id: `${server.id}-${sender}`,
        username: sender,
        isOnline: true,
      };

      key = `${server.id}-${privateChat.id}`;
    }

    useStore.setState((state) => {
      const currentUsers = state.typingUsers[key] || [];

      if (isActive) {
        // Don't add if already in the list
        if (currentUsers.some((u) => u.username === user.username)) {
          return {};
        }

        return {
          typingUsers: {
            ...state.typingUsers,
            [key]: [...currentUsers, user],
          },
        };
      }
      // Remove the user from the list
      return {
        typingUsers: {
          ...state.typingUsers,
          [key]: currentUsers.filter((u) => u.username !== user.username),
        },
      };
    });
  }

  // Handle reactions
  if (mtags?.["+draft/react"] && mtags["+draft/reply"]) {
    const emoji = mtags["+draft/react"];
    const replyMessageId = mtags["+draft/reply"];

    const server = useStore
      .getState()
      .servers.find((s) => s.id === response.serverId);
    if (!server) return;

    let channel: Channel | PrivateChat | undefined;
    const isChannel = channelName.startsWith("#");
    if (isChannel) {
      channel = server.channels.find((c) => c.name === channelName);
    } else {
      // Private chat
      channel = server.privateChats?.find((pc) => pc.username === channelName);
    }

    if (!channel) return;

    // Find the message to add reaction to
    const messages = getChannelMessages(server.id, channel.id);
    const messageIndex = messages.findIndex((m) => m.msgid === replyMessageId);
    if (messageIndex === -1) return;

    const message = messages[messageIndex];
    const existingReactionIndex = message.reactions.findIndex(
      (r) => r.emoji === emoji && r.userId === sender,
    );

    useStore.setState((state) => {
      const updatedMessages = [...messages];
      if (existingReactionIndex === -1) {
        // Add new reaction
        updatedMessages[messageIndex] = {
          ...message,
          reactions: [...message.reactions, { emoji, userId: sender }],
        };
      } else {
        // Remove existing reaction (toggle behavior)
        updatedMessages[messageIndex] = {
          ...message,
          reactions: message.reactions.filter(
            (_, i) => i !== existingReactionIndex,
          ),
        };
      }

      const key = `${server.id}-${channel.id}`;
      return {
        messages: {
          ...state.messages,
          [key]: updatedMessages,
        },
      };
    });
  }

  // Handle unreacts
  if (mtags?.["+draft/unreact"] && mtags["+draft/reply"]) {
    const emoji = mtags["+draft/unreact"];
    const replyMessageId = mtags["+draft/reply"];

    const server = useStore
      .getState()
      .servers.find((s) => s.id === response.serverId);
    if (!server) return;

    let channel: Channel | PrivateChat | undefined;
    const isChannel = channelName.startsWith("#");
    if (isChannel) {
      channel = server.channels.find((c) => c.name === channelName);
    } else {
      // Private chat
      channel = server.privateChats?.find((pc) => pc.username === channelName);
    }

    if (!channel) return;

    // Find the message to remove reaction from
    const messages = getChannelMessages(server.id, channel.id);
    const messageIndex = messages.findIndex((m) => m.msgid === replyMessageId);
    if (messageIndex === -1) return;

    const message = messages[messageIndex];
    const existingReactionIndex = message.reactions.findIndex(
      (r) => r.emoji === emoji && r.userId === sender,
    );

    // Only remove if the reaction exists
    if (existingReactionIndex !== -1) {
      useStore.setState((state) => {
        const updatedMessages = [...messages];
        updatedMessages[messageIndex] = {
          ...message,
          reactions: message.reactions.filter(
            (_, i) => i !== existingReactionIndex,
          ),
        };

        const key = `${server.id}-${channel.id}`;
        return {
          messages: {
            ...state.messages,
            [key]: updatedMessages,
          },
        };
      });
    }
  }
});

// Metadata event handlers
ircClient.on("METADATA", ({ serverId, target, key, visibility, value }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        // Update metadata for users in channels
        const updatedChannels = server.channels.map((channel) => {
          const updatedUsers = channel.users.map((user) => {
            if (user.username === target) {
              const metadata = user.metadata || {};
              if (value) {
                metadata[key] = { value, visibility };
              } else {
                delete metadata[key];
              }
              return { ...user, metadata };
            }
            return user;
          });
          return { ...channel, users: updatedUsers };
        });

        // Update metadata for the server itself if target is server
        const updatedMetadata = server.metadata || {};
        if (target === server.name) {
          if (value) {
            updatedMetadata[key] = { value, visibility };
          } else {
            delete updatedMetadata[key];
          }
        }

        return { ...server, channels: updatedChannels, metadata: updatedMetadata };
      }
      return server;
    });

    // Update current user metadata
    let updatedCurrentUser = state.currentUser;
    if (state.currentUser?.username === target) {
      const metadata = state.currentUser.metadata || {};
      if (value) {
        metadata[key] = { value, visibility };
      } else {
        delete metadata[key];
      }
      updatedCurrentUser = { ...state.currentUser, metadata };
    }

    return { servers: updatedServers, currentUser: updatedCurrentUser };
  });
});

ircClient.on("METADATA_KEYVALUE", ({ serverId, target, key, visibility, value }) => {
  // Handle individual key-value responses (similar to METADATA)
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        // Update metadata for users in channels
        const updatedChannels = server.channels.map((channel) => {
          const updatedUsers = channel.users.map((user) => {
            if (user.username === target) {
              const metadata = user.metadata || {};
              metadata[key] = { value, visibility };
              return { ...user, metadata };
            }
            return user;
          });
          return { ...channel, users: updatedUsers };
        });

        // Update metadata for channels
        const updatedChannelsWithMeta = updatedChannels.map((channel) => {
          if (channel.name === target) {
            const metadata = channel.metadata || {};
            metadata[key] = { value, visibility };
            return { ...channel, metadata };
          }
          return channel;
        });

        return { ...server, channels: updatedChannelsWithMeta };
      }
      return server;
    });

    return { servers: updatedServers };
  });
});

ircClient.on("METADATA_KEYNOTSET", ({ serverId, target, key }) => {
  // Handle key not set responses
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        // Remove metadata for users in channels
        const updatedChannels = server.channels.map((channel) => {
          const updatedUsers = channel.users.map((user) => {
            if (user.username === target) {
              const metadata = user.metadata || {};
              delete metadata[key];
              return { ...user, metadata };
            }
            return user;
          });
          return { ...channel, users: updatedUsers };
        });

        // Remove metadata for channels
        const updatedChannelsWithMeta = updatedChannels.map((channel) => {
          if (channel.name === target) {
            const metadata = channel.metadata || {};
            delete metadata[key];
            return { ...channel, metadata };
          }
          return channel;
        });

        return { ...server, channels: updatedChannelsWithMeta };
      }
      return server;
    });

    return { servers: updatedServers };
  });
});

ircClient.on("METADATA_SUBOK", ({ serverId, keys }) => {
  // Update subscriptions
  useStore.setState((state) => {
    const currentSubs = state.metadataSubscriptions[serverId] || [];
    const newSubs = [...new Set([...currentSubs, ...keys])];
    return {
      metadataSubscriptions: {
        ...state.metadataSubscriptions,
        [serverId]: newSubs,
      },
    };
  });
});

ircClient.on("METADATA_UNSUBOK", ({ serverId, keys }) => {
  // Update subscriptions
  useStore.setState((state) => {
    const currentSubs = state.metadataSubscriptions[serverId] || [];
    const newSubs = currentSubs.filter((k) => !keys.includes(k));
    return {
      metadataSubscriptions: {
        ...state.metadataSubscriptions,
        [serverId]: newSubs,
      },
    };
  });
});

ircClient.on("METADATA_SUBS", ({ serverId, keys }) => {
  // Set all subscriptions
  useStore.setState((state) => ({
    metadataSubscriptions: {
      ...state.metadataSubscriptions,
      [serverId]: keys,
    },
  }));
});

ircClient.on("BATCH_START", ({ serverId, batchId, type }) => {
  // Start a batch
  useStore.setState((state) => ({
    metadataBatches: {
      ...state.metadataBatches,
      [batchId]: { type, messages: [] },
    },
  }));
});

ircClient.on("BATCH_END", ({ serverId, batchId }) => {
  // End a batch - process all messages in the batch
  useStore.setState((state) => {
    const batch = state.metadataBatches[batchId];
    if (batch) {
      // Process batch messages (they should have been collected during the batch)
      // For metadata batches, the individual METADATA_KEYVALUE events should have updated the state
    }
    const { [batchId]: _, ...remainingBatches } = state.metadataBatches;
    return {
      metadataBatches: remainingBatches,
    };
  });
});

ircClient.on("CAP ACK", ({ serverId, cliCaps }) => {
  useStore.getState().capAck(serverId, "ACK", cliCaps);
  // Store capabilities on the server
  useStore.setState((state) => ({
    servers: state.servers.map((server) => {
      if (server.id === serverId) {
        return {
          ...server,
          capabilities: cliCaps.split(" "),
        };
      }
      return server;
    }),
  }));
});

ircClient.on("CAP_ACKNOWLEDGED", ({ serverId, key, capabilities }) => {
  if (capabilities?.startsWith("draft/metadata")) {
    // Subscribe to common metadata keys
    const defaultKeys = ["url", "website", "status", "location"];
    useStore.getState().metadataSub(serverId, defaultKeys);
  }
});

ircClient.on("METADATA_FAIL", ({ serverId, subcommand, code, target, key, retryAfter }) => {
  // Handle metadata failures
  console.error(`Metadata ${subcommand} failed: ${code}`, { target, key, retryAfter });
  // Could show user notifications here
});

// Load saved servers on store initialization

// If default server is available, select it
if (__DEFAULT_IRC_SERVER__) {
  console.log("Default server found, connecting...");
}

export default useStore;
