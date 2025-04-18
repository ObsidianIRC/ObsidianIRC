import { create } from 'zustand';
import { Channel, type Message, type Server, type User } from '../types';
import ircClient from '../lib/ircClient';
import { v4 as uuidv4 } from 'uuid';

const LOCAL_STORAGE_KEY = 'savedServers';

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
    type: 'server' | 'channel' | 'user' | 'message';
    itemId: string | null;
  };
}

interface AppState {
  servers: Server[];
  currentUser: User | null;
  isConnecting: boolean;
  connectionError: string | null;
  messages: Record<string, Message[]>;
  // UI state
  ui: UIState;
  // Actions
  connect: (host: string, port: number, nickname: string, password?: string) => Promise<Server>;
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
  showContextMenu: (x: number, y: number, type: 'server' | 'channel' | 'user' | 'message', itemId: string) => void;
  hideContextMenu: () => void;
}

// Create store with Zustand
const useStore = create<AppState>((set, get) => ({
  servers: [],
  currentUser: null,
  isConnecting: false,
  connectionError: null,
  messages: {},

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
      type: 'server',
      itemId: null
    }
  },

  // IRC client actions
  connect: async (host, port, nickname, password) => {
    set({ isConnecting: true, connectionError: null });

    try {
      const server = await ircClient.connect(host, port, nickname, password);

      // Save server to localStorage
      const savedServers = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      const savedServer = savedServers.find((s: any) => s.host === host && s.port === port);
      const channelsToJoin = savedServer?.channels || [];

      const updatedServers = savedServers.filter((s: any) => s.host !== host || s.port !== port);
      updatedServers.push({
        id: server.id, // Include the server ID here
        host,
        port,
        nickname,
        password,
        channels: channelsToJoin,
      });
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedServers));

      // Listen for the "ready" event to join channels
      ircClient.on('ready', ({ serverName }) => {
        if (serverName === host) {
          channelsToJoin.forEach((channelName: string) => {
            ircClient.joinChannel(server.id, channelName);
          });

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
        connectionError: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  },

  disconnect: (serverId) => {
    ircClient.disconnect(serverId);

    // Update the state to reflect disconnection
    set(state => {
      const updatedServers = state.servers.map(server => {
        if (server.id === serverId) {
          return { ...server, isConnected: false };
        }
        return server;
      });

      // Update selected server/channel if we were on the disconnected server
      let newUi = { ...state.ui };
      if (state.ui.selectedServerId === serverId) {
        // Find another connected server, or set to null
        const nextServer = updatedServers.find(s => s.isConnected && s.id !== serverId);
        newUi = {
          ...newUi,
          selectedServerId: nextServer?.id || null,
          selectedChannelId: nextServer?.channels[0]?.id || null
        };
      }

      return {
        servers: updatedServers,
        ui: newUi
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
        const savedServers = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
        const savedServer = savedServers.find((s: any) => s.id === serverId);
        if (savedServer) {
          savedServer.channels.push(channel.name);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedServers));
        }

        // Update the selected channel if the server matches the current selection
        const isCurrentServer = state.ui.selectedServerId === serverId;

        return {
          servers: updatedServers,
          ui: {
            ...state.ui,
            selectedChannelId: isCurrentServer ? channel.id : state.ui.selectedChannelId,
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
            channels: server.channels.filter((channel) => channel.name !== channelName),
          };
        }
        return server;
      });

      // Update localStorage to remove the channel
      const savedServers = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      const savedServer = savedServers.find((s: { host: string }) => 
        s.host === updatedServers.find((s: { id: string; host: string }) => s.id === serverId)?.host
      );
      if (savedServer) {
        savedServer.channels = updatedServers.find((s) => s.id === serverId)?.channels.map((c) => c.name) || [];
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedServers));
      }

      return { servers: updatedServers };
    });
  },

  sendMessage: (serverId, channelId, content) => {
    const message = ircClient.sendMessage(serverId, channelId, content);

  },

  addMessage: (message) => {
    set(state => {
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
    set(state => {
      // Find the server
      const server = state.servers.find(s => s.id === serverId);
      // If server exists, select its first channel, otherwise set to null
      const channelId = server?.channels[0]?.id || null;

      return {
        ui: {
          ...state.ui,
          selectedServerId: serverId,
          selectedChannelId: channelId,
          isMobileMenuOpen: false
        }
      };
    });
  },

  selectChannel: (channelId) => {
    set(state => {
      // Find which server this channel belongs to
      let serverId = state.ui.selectedServerId;

      // If we don't have a server selected or the channel doesn't belong to the selected server
      if (!serverId) {
        for (const server of state.servers) {
          if (server.channels.some(c => c.id === channelId)) {
            serverId = server.id;
            break;
          }
        }
      }

      // Mark channel as read
      if (serverId && channelId) {
        ircClient.markChannelAsRead(serverId, channelId);

        // Update unread state in store
        const updatedServers = state.servers.map(server => {
          if (server.id === serverId) {
            const updatedChannels = server.channels.map(channel => {
              if (channel.id === channelId) {
                return {
                  ...channel,
                  unreadCount: 0,
                  isMentioned: false
                };
              }
              return channel;
            });

            return {
              ...server,
              channels: updatedChannels
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
            isMobileMenuOpen: false
          }
        };
      }

      return {
        ui: {
          ...state.ui,
          selectedChannelId: channelId,
          isMobileMenuOpen: false
        }
      };
    });
  },

  markChannelAsRead: (serverId, channelId) => {
    ircClient.markChannelAsRead(serverId, channelId);

    set(state => {
      const updatedServers = state.servers.map(server => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map(channel => {
            if (channel.id === channelId) {
              return {
                ...channel,
                unreadCount: 0,
                isMentioned: false
              };
            }
            return channel;
          });

          return {
            ...server,
            channels: updatedChannels
          };
        }
        return server;
      });

      return {
        servers: updatedServers
      };
    });
  },

  loadSavedServers: async () => {
    const savedServers = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    for (const { host, port, nickname, password, channels } of savedServers) {
      try {
        const server = await get().connect(host, port, nickname, password);

        // Listen for the "ready" event to join channels
        ircClient.on('ready', ({ serverName }) => {
          if (serverName === host) {
            channels.forEach((channelName: string) => {
              ircClient.joinChannel(server.id, channelName);
            });

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
    set(state => {
      const serverToDelete = state.servers.find(server => server.id === serverId);

      // Remove server from localStorage
      const savedServers = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      const updatedServers = savedServers.filter((s: any) => s.host !== serverToDelete?.host || s.port !== serverToDelete?.port);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedServers));

      // Update state
      const remainingServers = state.servers.filter(server => server.id !== serverId);
      const newSelectedServerId = remainingServers.length > 0 ? remainingServers[0].id : null;

      return {
        servers: remainingServers,
        ui: {
          ...state.ui,
          selectedServerId: newSelectedServerId,
          selectedChannelId: newSelectedServerId ? remainingServers[0].channels[0]?.id || null : null
        }
      };
    });

    ircClient.disconnect(serverId);
  },

  // UI actions
  toggleAddServerModal: (isOpen) => {
    set(state => ({
      ui: {
        ...state.ui,
        isAddServerModalOpen: isOpen !== undefined ? isOpen : !state.ui.isAddServerModalOpen
      }
    }));
  },

  toggleSettingsModal: (isOpen) => {
    set(state => ({
      ui: {
        ...state.ui,
        isSettingsModalOpen: isOpen !== undefined ? isOpen : !state.ui.isSettingsModalOpen
      }
    }));
  },

  toggleUserProfileModal: (isOpen) => {
    set(state => ({
      ui: {
        ...state.ui,
        isUserProfileModalOpen: isOpen !== undefined ? isOpen : !state.ui.isUserProfileModalOpen
      }
    }));
  },

  toggleDarkMode: () => {
    set(state => ({
      ui: {
        ...state.ui,
        isDarkMode: !state.ui.isDarkMode
      }
    }));
  },

  toggleMobileMenu: (isOpen) => {
    set(state => ({
      ui: {
        ...state.ui,
        isMobileMenuOpen: isOpen !== undefined ? isOpen : !state.ui.isMobileMenuOpen
      }
    }));
  },

  toggleMemberList: (isVisible) => {
    set(state => ({
      ui: {
        ...state.ui,
        isMemberListVisible: isVisible !== undefined ? isVisible : !state.ui.isMemberListVisible
      }
    }));
  },

  toggleServerMenu: (isOpen) => {
    set(state => ({
      ui: {
        ...state.ui,
        isServerMenuOpen: isOpen !== undefined ? isOpen : !state.ui.isServerMenuOpen
      }
    }));
  },

  showContextMenu: (x, y, type, itemId) => {
    set(state => ({
      ui: {
        ...state.ui,
        contextMenu: {
          isOpen: true,
          x,
          y,
          type,
          itemId
        }
      }
    }));
  },

  hideContextMenu: () => {
    set(state => ({
      ui: {
        ...state.ui,
        contextMenu: {
          ...state.ui.contextMenu,
          isOpen: false
        }
      }
    }));
  }
}));

// Set up event listeners for IRC client events
ircClient.on('message', (response: { serverId: string; channelId: string; message: Message }) => {
  const { serverId, channelId, message } = response;
  console.log("MSG: "+message);
  useStore.getState().addMessage(message);
});

ircClient.on('system_message', (response: { message: Message }) => {
  const { message } = response;
  useStore.getState().addMessage(message);
});

ircClient.on('connect', (response: { servers: Server[] }) => {
  const { servers } = response;
  useStore.setState({ servers });
});

ircClient.on('disconnect', (response: { serverId: string }) => {
  const { serverId } = response;
  if (serverId) {
    // Update specific server status
    useStore.setState(state => ({
      servers: state.servers.map(server =>
        server.id === serverId ? { ...server, isConnected: false } : server
      )
    }));
  } else {
    // Refresh servers list
    const servers = ircClient.getServers();
    useStore.setState({ servers });
  }
});

ircClient.on('PRIVMSG', (response) => {
  const { channelName, message, timestamp } = response;

  // Find the server and channel
  const server = useStore.getState().servers.find(s => s.id === response.serverId);

  if (server) {
    const channel = server.channels.find(c => c.name === channelName);
    if (channel) {
      const newMessage = {
        id: uuidv4(),
        content: message,
        timestamp,
        userId: response.sender,
        channelId: channel.id,
        serverId: server.id,
        type: "message" as const,
        mentioned: [], // Add logic for mentions if needed
      };

      useStore.getState().addMessage(newMessage);
    }
  }
});

ircClient.on('NAMES', ({ serverId, channelName, users }) => {
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

ircClient.on('JOIN', ({ serverId, username, channelName }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        const existingChannel = server.channels.find((channel) => channel.name === channelName);
        if (!existingChannel) {
          const newChannel: Channel = {
            id: uuidv4(),
            name: channelName,
            topic: '',
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
      }
      return server;
    });

    return { servers: updatedServers };
  });
});

ircClient.on('ready', ({ serverId, serverName, nickname }) => {
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

  const savedServers = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  const savedServer = savedServers.find((s: any) => s.id === serverId);

  if (savedServer) {
    console.log(`Joining saved channels for serverId=${serverId}`);
    savedServer.channels.forEach((channelName: string) => {
      if (channelName) {
        ircClient.joinChannel(serverId, channelName);
      }
    });

    // Update the UI state to reflect the first joined channel
    useStore.setState((state) => ({
      ui: {
        ...state.ui,
        selectedServerId: serverId,
        selectedChannelId: savedServer.channels[0]?.id || null,
      },
    }));
  } else {
    console.warn(`No saved channels found for serverId=${serverId}`);
  }
});

ircClient.on('PART', ({ username, channelName }) => {
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

// Load saved servers on store initialization
useStore.getState().loadSavedServers();

export default useStore;
