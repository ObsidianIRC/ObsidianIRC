import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import ircClient from "../lib/ircClient";
import { findChannelMessageById } from "../lib/ircUtils";
import type { Channel, Message, Server, ServerConfig, User } from "../types";

const LOCAL_STORAGE_KEY = "savedServers";

// Load saved servers from localStorage
function loadSavedServers(): ServerConfig[] {
  return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]");
}

function saveServersToLocalStorage(servers: ServerConfig[]) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(servers));
}

interface UIState {
  selectedServerId: string | null;
  selectedChannelId: string | null;
  isAddServerModalOpen: boolean;
  isSettingsModalOpen: boolean;
  isUserProfileModalOpen: boolean;
  isDarkMode: boolean;
  isMobileMenuOpen: boolean;
  isMemberListVisible: boolean;
  isServerMenuOpen: boolean;
  contextMenu: {
    isOpen: boolean;
    x: number;
    y: number;
    type: "server" | "channel" | "user" | "message";
    itemId: string | null;
  };
}

interface AppState {
  servers: Server[];
  currentUser: User | null;
  isConnecting: boolean;
  connectionError: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, User[]>;
  // UI state
  ui: UIState;
  // Actions
  connect: (
    host: string,
    port: number,
    nickname: string,
    password?: string,
  ) => Promise<Server>;
  disconnect: (serverId: string) => void;
  joinChannel: (serverId: string, channelName: string) => void;
  leaveChannel: (serverId: string, channelName: string) => void;
  sendMessage: (serverId: string, channelId: string, content: string) => void;
  addMessage: (message: Message) => void;
  selectServer: (serverId: string | null) => void;
  selectChannel: (channelId: string | null) => void;
  markChannelAsRead: (serverId: string, channelId: string) => void;
  loadSavedServers: () => void; // New action to load servers from localStorage
  deleteServer: (serverId: string) => void; // New action to delete a server
  // UI actions
  toggleAddServerModal: (isOpen?: boolean) => void;
  toggleSettingsModal: (isOpen?: boolean) => void;
  toggleUserProfileModal: (isOpen?: boolean) => void;
  toggleDarkMode: () => void;
  toggleMobileMenu: (isOpen?: boolean) => void;
  toggleMemberList: (isVisible?: boolean) => void;
  toggleServerMenu: (isOpen?: boolean) => void;
  showContextMenu: (
    x: number,
    y: number,
    type: "server" | "channel" | "user" | "message",
    itemId: string,
  ) => void;
  hideContextMenu: () => void;
}

// Create store with Zustand
const useStore = create<AppState>((set, get) => ({
  servers: [],
  currentUser: null,
  isConnecting: false,
  connectionError: null,
  messages: {},
  typingUsers: {},

  // UI state
  ui: {
    selectedServerId: null,
    selectedChannelId: null,
    isAddServerModalOpen: false,
    isSettingsModalOpen: false,
    isUserProfileModalOpen: false,
    isDarkMode: true, // Discord-like default is dark mode
    isMobileMenuOpen: false,
    isMemberListVisible: true,
    isServerMenuOpen: false,
    contextMenu: {
      isOpen: false,
      x: 0,
      y: 0,
      type: "server",
      itemId: null,
    },
  },

  // IRC client actions
  connect: async (host, port, nickname, password) => {
    set({ isConnecting: true, connectionError: null });

    try {
      const server = await ircClient.connect(host, port, nickname, password);

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
        password,
        channels: channelsToJoin,
      });
      saveServersToLocalStorage(updatedServers);

      // Listen for the "ready" event to join channels
      ircClient.on("ready", ({ serverName }) => {
        if (serverName === host) {
          for (const channelName of channelsToJoin) {
            ircClient.joinChannel(server.id, channelName);
          }

          // Update the UI state to reflect the first joined channel
          set((state) => ({
            ui: {
              ...state.ui,
              selectedServerId: server.id,
              selectedChannelId: server.channels[0]?.id || null,
            },
          }));
        }
      });

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
            isMobileMenuOpen: false,
          },
        };
      }

      return {
        ui: {
          ...state.ui,
          selectedChannelId: channelId,
          isMobileMenuOpen: false,
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

  loadSavedServers: async () => {
    const savedServers = loadSavedServers();
    for (const { host, port, nickname, password, channels } of savedServers) {
      try {
        const server = await get().connect(host, port, nickname, password);

        // Listen for the "ready" event to join channels
        ircClient.on("ready", ({ serverName }) => {
          if (serverName === host) {
            for (const channelName of channels) {
              ircClient.joinChannel(server.id, channelName);
            }

            // Update the UI state to reflect the first joined channel
            set((state) => ({
              ui: {
                ...state.ui,
                selectedServerId: server.id,
                selectedChannelId: server.channels[0]?.id || null,
              },
            }));
          }
        });
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
  toggleAddServerModal: (isOpen) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isAddServerModalOpen:
          isOpen !== undefined ? isOpen : !state.ui.isAddServerModalOpen,
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

  toggleMemberList: (isVisible) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isMemberListVisible:
          isVisible !== undefined ? isVisible : !state.ui.isMemberListVisible,
      },
    }));
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
}));

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

ircClient.on("PRIVMSG", (response) => {
  const { messageTags, channelName, message, timestamp } = response;

  // Find the server and channel
  const server = useStore
    .getState()
    .servers.find((s) => s.id === response.serverId);

  if (server) {
    const channel = server.channels.find((c) => c.name === channelName);
    const replyTo = null;

    if (channel) {
      const replyId = messageTags["+reply"]
        ? messageTags["+reply"].trim()
        : null;

      const replyMessage = replyId
        ? findChannelMessageById(server.id, channel.id, replyId)
        : null;

      const newMessage = {
        id: messageTags.msgid,
        content: message,
        timestamp,
        userId: response.sender,
        channelId: channel.id,
        serverId: server.id,
        type: "message" as const,
        reacts: [],
        replyMessage: replyMessage,
        mentioned: [], // Add logic for mentions if needed
      };

      useStore.getState().addMessage(newMessage);
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
    return { servers: updatedServers };
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

ircClient.on("CAP LS", ({ serverId, cliCaps }) => {
  const ourCaps = [
    "multi-prefix",
    "message-tags",
    "server-time",
    "echo-message",
    "message-tags",
    "userhost-in-names",
    "draft/chathistory",
  ];

  const caps = cliCaps.split(" ");
  let toRequest = "CAP REQ :";
  for (const cap of caps) {
    if (ourCaps.includes(cap)) {
      if (toRequest.length + cap.length + 1 > 400) {
        ircClient.sendRaw(serverId, toRequest);
        toRequest = "CAP REQ :";
      }
      toRequest += `${cap} `;
      console.log(`Requesting capability: ${cap}`);
    }
  }
  if (toRequest.length > 9) {
    ircClient.sendRaw(serverId, toRequest);
  }
  console.log(`Server ${serverId} supports capabilities: ${cliCaps}`);
});

ircClient.on("CAP ACK", ({ serverId, cliCaps }) => {
  const caps = cliCaps.split(" ");
  for (const cap of caps) {
    ircClient.capAck(serverId, cap);
    console.log(`Capability acknowledged: ${cap}`);
  }
  if (!ircClient.preventCapEnd) {
    console.log(`Sending CAP END for server ${serverId}`);
    ircClient.sendRaw(serverId, "CAP END");
  } else {
    console.log(`Preventing CAP END for server ${serverId}`);
  }
});

ircClient.on("ISUPPORT", ({ serverId, capabilities }) => {
  const paramsArray = capabilities;
  console.log(capabilities);
  // Check if the server supports FAVICON
  for (let i = 0; i < paramsArray.length; i++) {
    console.log(`ISUPPORT param: ${paramsArray[i]}`);
    if (paramsArray[i].startsWith("FAVICON=")) {
      const favicon = paramsArray[i].substring(8);
      // set the favicon as the server's icon in the serverList
      useStore.setState((state) => {
        const updatedServers = state.servers.map((server) => {
          if (server.id === serverId) {
            return { ...server, icon: favicon };
          }
          return server;
        });
        return { servers: updatedServers };
      });
      console.log(`Server ${serverId} supports FAVICON: ${favicon}`);
    }
  }
});

// CTCPs lol
ircClient.on("PRIVMSG", (response) => {
  const { messageTags, channelName, message, timestamp } = response;

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
  const { messageTags, channelName } = response;

  if (messageTags["+typing"]) {
    const isActive = messageTags["+typing"] === "active";
    const server = useStore
      .getState()
      .servers.find((s) => s.id === response.serverId);

    if (!server) return;

    const channel = server.channels.find((c) => c.name === channelName);
    if (!channel) return;

    const user = channel.users.find((u) => u.username === response.sender);
    if (!user) return;

    const key = `${server.id}-${channel.id}`;

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
});

// Load saved servers on store initialization
useStore.getState().loadSavedServers();

export default useStore;
