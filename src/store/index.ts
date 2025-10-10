import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import { isUserIgnored } from "../lib/ignoreUtils";
import ircClient from "../lib/ircClient";
import {
  playNotificationSound,
  shouldPlayNotificationSound,
} from "../lib/notificationSounds";
import {
  checkForMention,
  extractMentions,
  showMentionNotification,
} from "../lib/notifications";
import { registerAllProtocolHandlers } from "../protocol";
import type {
  Channel,
  Message,
  PrivateChat,
  Server,
  ServerConfig,
  User,
  WhoisData,
} from "../types";

const LOCAL_STORAGE_SERVERS_KEY = "savedServers";
const LOCAL_STORAGE_METADATA_KEY = "serverMetadata";
const LOCAL_STORAGE_SETTINGS_KEY = "globalSettings";
const LOCAL_STORAGE_CHANNEL_ORDER_KEY = "channelOrder";

// Type for saved metadata structure: serverId -> target -> key -> metadata
type SavedMetadata = Record<
  string,
  Record<string, Record<string, { value: string; visibility: string }>>
>;

// Type for channel order: serverId -> array of channel names in order
type ChannelOrderMap = Record<string, string[]>;

// Types for batch event processing
interface JoinBatchEvent {
  type: "JOIN";
  data: {
    serverId: string;
    username: string;
    channelName: string;
    account?: string; // From extended-join
    realname?: string; // From extended-join
  };
}

interface QuitBatchEvent {
  type: "QUIT";
  data: {
    serverId: string;
    username: string;
    reason: string;
  };
}

interface PartBatchEvent {
  type: "PART";
  data: {
    serverId: string;
    username: string;
    channelName: string;
    reason?: string;
  };
}

type BatchEvent = JoinBatchEvent | QuitBatchEvent | PartBatchEvent;

interface BatchInfo {
  type: string;
  parameters?: string[];
  events: BatchEvent[];
  startTime: Date;
}

interface Attachment {
  id: string;
  type: "image";
  url: string;
  filename: string;
}

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
  return messages.find((message) => message.msgid === messageId);
};
// Load saved servers from localStorage
export function loadSavedServers(): ServerConfig[] {
  return JSON.parse(localStorage.getItem(LOCAL_STORAGE_SERVERS_KEY) || "[]");
}

// Load saved metadata from localStorage
export function loadSavedMetadata(): SavedMetadata {
  return JSON.parse(localStorage.getItem(LOCAL_STORAGE_METADATA_KEY) || "{}");
}

// Save metadata to localStorage
function saveMetadataToLocalStorage(metadata: SavedMetadata) {
  localStorage.setItem(LOCAL_STORAGE_METADATA_KEY, JSON.stringify(metadata));
}

// Load saved global settings from localStorage
function loadSavedGlobalSettings(): Partial<GlobalSettings> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

// Save global settings to localStorage
function saveGlobalSettingsToLocalStorage(settings: GlobalSettings) {
  localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(settings));
}

// Load channel order from localStorage
function loadChannelOrder(): ChannelOrderMap {
  return JSON.parse(
    localStorage.getItem(LOCAL_STORAGE_CHANNEL_ORDER_KEY) || "{}",
  );
}

// Save channel order to localStorage
function saveChannelOrder(channelOrder: ChannelOrderMap) {
  localStorage.setItem(
    LOCAL_STORAGE_CHANNEL_ORDER_KEY,
    JSON.stringify(channelOrder),
  );
}

// Check if a server supports metadata
function serverSupportsMetadata(serverId: string): boolean {
  const state = useStore.getState();
  const server = state.servers.find((s) => s.id === serverId);
  const supports =
    server?.capabilities?.some(
      (cap) => cap === "draft/metadata-2" || cap.startsWith("draft/metadata"),
    ) ?? false;
  return supports;
}

// Check if a server supports multiline
function serverSupportsMultiline(serverId: string): boolean {
  const state = useStore.getState();
  const server = state.servers.find((s) => s.id === serverId);
  const supports = server?.capabilities?.includes("draft/multiline") ?? false;
  return supports;
}

export { serverSupportsMetadata, serverSupportsMultiline };

function saveServersToLocalStorage(servers: ServerConfig[]) {
  localStorage.setItem(LOCAL_STORAGE_SERVERS_KEY, JSON.stringify(servers));
}

// Export the function
export { saveServersToLocalStorage };

// Restore metadata for a server from localStorage
function restoreServerMetadata(serverId: string) {
  const savedMetadata = loadSavedMetadata();
  const serverMetadata = savedMetadata[serverId];
  if (!serverMetadata) return;

  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        // Restore server metadata
        const updatedMetadata = { ...server.metadata };
        if (serverMetadata[server.name]) {
          Object.assign(updatedMetadata, serverMetadata[server.name]);
        }

        // Restore user metadata in channels
        const updatedChannels = server.channels.map((channel) => {
          const updatedUsers = channel.users.map((user) => {
            const userMetadata = serverMetadata[user.username];
            if (userMetadata) {
              return {
                ...user,
                metadata: { ...user.metadata, ...userMetadata },
              };
            }
            return user;
          });

          // Restore channel metadata
          const channelMetadata = serverMetadata[channel.name];
          const updatedChannelMetadata = channel.metadata || {};
          if (channelMetadata) {
            Object.assign(updatedChannelMetadata, channelMetadata);
          }

          return {
            ...channel,
            users: updatedUsers,
            metadata: updatedChannelMetadata,
          };
        });

        return {
          ...server,
          metadata: updatedMetadata,
          channels: updatedChannels,
        };
      }
      return server;
    });

    // Restore current user metadata
    let updatedCurrentUser = state.currentUser;
    if (state.currentUser && serverMetadata[state.currentUser.username]) {
      updatedCurrentUser = {
        ...state.currentUser,
        metadata: {
          ...state.currentUser.metadata,
          ...serverMetadata[state.currentUser.username],
        },
      };
    }

    return { servers: updatedServers, currentUser: updatedCurrentUser };
  });
}

// Fetch our own metadata from the server and update saved values
async function fetchAndMergeOwnMetadata(serverId: string): Promise<void> {
  return new Promise((resolve) => {
    const nickname = ircClient.getNick(serverId);
    if (!nickname) {
      resolve();
      return;
    }

    // Mark as fetching
    useStore.setState((state) => ({
      metadataFetchInProgress: {
        ...state.metadataFetchInProgress,
        [serverId]: true,
      },
    }));

    // Request all metadata for ourselves (target "*" means us)
    const defaultKeys = [
      "url",
      "website",
      "status",
      "location",
      "avatar",
      "color",
      "display-name",
    ];

    // Get our metadata from the server
    ircClient.metadataGet(serverId, "*", defaultKeys);

    // Wait a bit for responses to come in, then resolve
    // The METADATA_KEYVALUE handler will update saved values
    setTimeout(() => {
      useStore.setState((state) => ({
        metadataFetchInProgress: {
          ...state.metadataFetchInProgress,
          [serverId]: false,
        },
      }));
      resolve();
    }, 1000);
  });
}

// Fetch channel metadata for the channel list modal
// Uses caching to avoid refetching and rate limiting
function fetchChannelMetadata(serverId: string, channelNames: string[]) {
  const state = useStore.getState();
  const now = Date.now();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  // Initialize cache and queue if needed
  if (!state.channelMetadataCache[serverId]) {
    useStore.setState((state) => ({
      channelMetadataCache: {
        ...state.channelMetadataCache,
        [serverId]: {},
      },
    }));
  }
  if (!state.channelMetadataFetchQueue[serverId]) {
    useStore.setState((state) => ({
      channelMetadataFetchQueue: {
        ...state.channelMetadataFetchQueue,
        [serverId]: new Set(),
      },
    }));
  }

  const cache = state.channelMetadataCache[serverId] || {};
  const queue = state.channelMetadataFetchQueue[serverId] || new Set();

  // Filter out channels that are already cached or being fetched
  const channelsToFetch = channelNames.filter((channelName) => {
    const cached = cache[channelName];
    const alreadyQueued = queue.has(channelName);
    const isCacheValid = cached && now - cached.fetchedAt < CACHE_TTL;
    return !isCacheValid && !alreadyQueued;
  });

  if (channelsToFetch.length === 0) {
    return;
  }

  // Add to queue
  const newQueue = new Set(queue);
  for (const ch of channelsToFetch) {
    newQueue.add(ch);
  }
  useStore.setState((state) => ({
    channelMetadataFetchQueue: {
      ...state.channelMetadataFetchQueue,
      [serverId]: newQueue,
    },
  }));

  // Fetch metadata for each channel
  // Note: We request metadata even if we're not in the channel
  // This may not work on all servers - depends on server permissions
  channelsToFetch.forEach((channelName) => {
    ircClient.metadataGet(serverId, channelName, ["avatar", "display-name"]);
  });
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
  isChannelListModalOpen: boolean;
  isChannelRenameModalOpen: boolean;
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
  inputAttachments: Attachment[];
  // Link security warning modal state - array to support multiple concurrent warnings
  linkSecurityWarnings: Array<{ serverId: string; timestamp: number }>;
  // Server notices popup state
  isServerNoticesPopupOpen: boolean;
  serverNoticesPopupMinimized: boolean;
  // Profile view request - set when we want to open a user profile after closing settings
  profileViewRequest: { serverId: string; username: string } | null;
}

export interface GlobalSettings {
  enableNotifications: boolean;
  notificationSound: string;
  enableNotificationSounds: boolean;
  notificationVolume: number; // 0-1, where 0 is muted
  enableHighlights: boolean;
  sendTypingNotifications: boolean;
  // Event visibility settings
  showEvents: boolean;
  showNickChanges: boolean;
  showJoinsParts: boolean;
  showQuits: boolean;
  showKicks: boolean;
  // Custom mentions
  customMentions: string[];
  // Ignore list
  ignoreList: string[];
  // Hosted chat mode settings
  nickname: string;
  accountName: string;
  accountPassword: string;
  // Multiline settings
  enableMultilineInput: boolean;
  multilineOnShiftEnter: boolean;
  autoFallbackToSingleLine: boolean;
}

export interface AppState {
  servers: Server[];
  currentUser: User | null;
  isConnecting: boolean;
  selectedServerId: string | null;
  connectionError: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, User[]>;
  globalNotifications: {
    id: string;
    type: "fail" | "warn" | "note";
    command: string;
    code: string;
    message: string;
    target?: string;
    serverId: string;
    timestamp: Date;
  }[];
  channelList: Record<
    string,
    { channel: string; userCount: number; topic: string }[]
  >; // serverId -> channels
  listingInProgress: Record<string, boolean>; // serverId -> is listing
  // Channel metadata cache for /LIST
  channelMetadataCache: Record<
    string,
    Record<
      string,
      {
        avatar?: string;
        displayName?: string;
        fetchedAt: number; // timestamp
      }
    >
  >; // serverId -> channelName -> metadata
  channelMetadataFetchQueue: Record<string, Set<string>>; // serverId -> Set of channel names being fetched
  // Metadata state
  metadataSubscriptions: Record<string, string[]>; // serverId -> keys
  metadataBatches: Record<
    string,
    {
      type: string;
      messages: {
        target: string;
        key: string;
        visibility: string;
        value: string;
      }[];
    }
  >; // batchId -> batch info
  activeBatches: Record<string, Record<string, BatchInfo>>; // serverId -> batchId -> batch info
  metadataFetchInProgress: Record<string, boolean>; // serverId -> is fetching own metadata
  // WHOIS data cache
  whoisData: Record<string, Record<string, WhoisData>>; // serverId -> nickname -> whois data
  // Account registration state
  pendingRegistration: {
    serverId: string;
    account: string;
    email: string;
    password: string;
  } | null;
  // Channel order persistence
  channelOrder: ChannelOrderMap; // serverId -> ordered array of channel names
  // UI state
  ui: UIState;
  globalSettings: GlobalSettings;
  // Actions
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
  ) => Promise<Server>;
  disconnect: (serverId: string) => void;
  joinChannel: (serverId: string, channelName: string) => void;
  leaveChannel: (serverId: string, channelName: string) => void;
  sendMessage: (serverId: string, channelId: string, content: string) => void;
  redactMessage: (
    serverId: string,
    target: string,
    msgid: string,
    reason?: string,
  ) => void;
  registerAccount: (
    serverId: string,
    account: string,
    email: string,
    password: string,
  ) => void;
  verifyAccount: (serverId: string, account: string, code: string) => void;
  warnUser: (
    serverId: string,
    channelName: string,
    username: string,
    reason: string,
  ) => void;
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
  banUserByNick: (
    serverId: string,
    channelName: string,
    username: string,
    reason: string,
  ) => void;
  banUserByHostmask: (
    serverId: string,
    channelName: string,
    username: string,
    reason: string,
  ) => void;
  listChannels: (serverId: string) => void;
  renameChannel: (
    serverId: string,
    oldName: string,
    newName: string,
    reason?: string,
  ) => void;
  setName: (serverId: string, realname: string) => void;
  changeNick: (serverId: string, newNick: string) => void;
  addMessage: (message: Message) => void;
  addGlobalNotification: (notification: {
    type: "fail" | "warn" | "note";
    command: string;
    code: string;
    message: string;
    target?: string;
    serverId: string;
  }) => void;
  removeGlobalNotification: (notificationId: string) => void;
  clearGlobalNotifications: () => void;
  selectServer: (serverId: string | null) => void;
  selectChannel: (channelId: string | null) => void;
  selectPrivateChat: (privateChatId: string | null) => void;
  openPrivateChat: (serverId: string, username: string) => void;
  deletePrivateChat: (serverId: string, privateChatId: string) => void;
  markChannelAsRead: (serverId: string, channelId: string) => void;
  reorderChannels: (serverId: string, channelIds: string[]) => void;
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
  setProfileViewRequest: (serverId: string, username: string) => void;
  clearProfileViewRequest: () => void;
  toggleDarkMode: () => void;
  toggleMobileMenu: (isOpen?: boolean) => void;
  toggleMemberList: (isVisible?: boolean) => void;
  toggleChannelList: (isOpen?: boolean) => void;
  toggleChannelListModal: (isOpen?: boolean) => void;
  toggleChannelRenameModal: (isOpen?: boolean) => void;
  toggleServerMenu: (isOpen?: boolean) => void;
  showContextMenu: (
    x: number,
    y: number,
    type: "server" | "channel" | "user" | "message",
    itemId: string,
  ) => void;
  hideContextMenu: () => void;
  setMobileViewActiveColumn: (column: layoutColumn) => void;
  // Server notices popup actions
  toggleServerNoticesPopup: (isOpen?: boolean) => void;
  minimizeServerNoticesPopup: (isMinimized?: boolean) => void;
  // Settings actions
  updateGlobalSettings: (settings: Partial<GlobalSettings>) => void;
  // Ignore list actions
  addToIgnoreList: (pattern: string) => void;
  removeFromIgnoreList: (pattern: string) => void;
  // Attachment actions
  addInputAttachment: (attachment: Attachment) => void;
  removeInputAttachment: (attachmentId: string) => void;
  clearInputAttachments: () => void;
  // Metadata actions
  metadataGet: (serverId: string, target: string, keys: string[]) => void;
  metadataList: (serverId: string, target: string) => void;
  metadataSet: (
    serverId: string,
    target: string,
    key: string,
    value?: string,
    visibility?: string,
  ) => void;
  metadataClear: (serverId: string, target: string) => void;
  metadataSub: (serverId: string, keys: string[]) => void;
  metadataUnsub: (serverId: string, keys: string[]) => void;
  metadataSubs: (serverId: string) => void;
  metadataSync: (serverId: string, target: string) => void;
  sendRaw: (serverId: string, command: string) => void;
}

// Create store with Zustand
const useStore = create<AppState>((set, get) => ({
  servers: [],
  currentUser: null,
  isConnecting: false,
  connectionError: null,
  messages: {},
  typingUsers: {},
  globalNotifications: [],
  channelList: {},
  listingInProgress: {},
  channelMetadataCache: {},
  channelMetadataFetchQueue: {},
  metadataSubscriptions: {},
  metadataBatches: {},
  activeBatches: {},
  metadataFetchInProgress: {},
  whoisData: {},
  pendingRegistration: null,
  channelOrder: loadChannelOrder(),
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
    isChannelListModalOpen: false,
    isChannelRenameModalOpen: false,
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
    inputAttachments: [],
    // Link security warning modal state
    linkSecurityWarnings: [],
    // Server notices popup state
    isServerNoticesPopupOpen: false,
    serverNoticesPopupMinimized: false,
    // Profile view request
    profileViewRequest: null,
  },
  globalSettings: {
    enableNotifications: false,
    notificationSound: "/sounds/notif1.mp3",
    enableNotificationSounds: true,
    notificationVolume: 0.4, // 40% volume by default
    enableHighlights: true,
    sendTypingNotifications: true,
    // Event visibility settings (enabled by default)
    showEvents: true,
    showNickChanges: true,
    showJoinsParts: true,
    showQuits: true,
    showKicks: true,
    // Custom mentions
    customMentions: [],
    // Ignore list
    ignoreList: ["HistServ!*@*"],
    // Hosted chat mode settings
    nickname: "",
    accountName: "",
    accountPassword: "",
    // Multiline settings
    enableMultilineInput: true,
    multilineOnShiftEnter: true,
    autoFallbackToSingleLine: true,
    ...loadSavedGlobalSettings(), // Load saved settings from localStorage
  },

  // IRC client actions
  connect: async (
    name,
    host,
    port,
    nickname,
    _saslEnabled,
    password,
    saslAccountName,
    saslPassword,
    registerAccount,
    registerEmail,
    registerPassword,
  ) => {
    // Check if already connected to this server
    const state = get();
    const existingServer = state.servers.find(
      (s) => s.host === host && s.port === port && s.isConnected,
    );
    if (existingServer) {
      // Already connected, just return the existing server
      return existingServer;
    }

    set({ isConnecting: true, connectionError: null });

    try {
      // Look up saved server to get its ID
      const existingSavedServers: ServerConfig[] = loadSavedServers();
      const existingSavedServer = existingSavedServers.find(
        (s) => s.host === host && s.port === port,
      );

      const server = await ircClient.connect(
        name,
        host,
        port,
        nickname,
        password,
        saslAccountName,
        saslPassword,
        existingSavedServer?.id, // Pass the saved server ID if it exists
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
        name: server.name, // Save the server name
        host,
        port,
        nickname,
        saslEnabled: !!saslPassword,
        password,
        channels: channelsToJoin,
        saslAccountName,
        saslPassword,
        // Preserve warning preferences
        skipLocalhostWarning: savedServer?.skipLocalhostWarning,
        skipLinkSecurityWarning: savedServer?.skipLinkSecurityWarning,
      });
      saveServersToLocalStorage(updatedServers);

      set((state) => {
        const alreadyExists = state.servers.some(
          (s) => s.host === host && s.port === port,
        );
        if (alreadyExists) {
          return {
            isConnecting: false,
          };
        }
        return {
          servers: [...state.servers, server],
          isConnecting: false,
        };
      });

      // Check for localhost connection warning (unencrypted ws://)
      const isLocalhost = host === "localhost" || host === "127.0.0.1";
      if (isLocalhost) {
        const savedServers = loadSavedServers();
        const serverConfig = savedServers.find(
          (s) => s.host === host && s.port === port,
        );

        // Only show warning if not already skipped
        if (!serverConfig?.skipLocalhostWarning) {
          set((state) => ({
            ui: {
              ...state.ui,
              linkSecurityWarnings: [
                ...state.ui.linkSecurityWarnings,
                { serverId: server.id, timestamp: Date.now() },
              ],
            },
          }));
        }
      }

      // Join saved channels - now handled in the ready event handler
      // for (const channelName of channelsToJoin) {
      //   get().joinChannel(server.id, channelName);
      // }

      // Set up pending account registration if requested
      if (registerAccount && registerEmail && registerPassword) {
        set({
          pendingRegistration: {
            serverId: server.id,
            account: nickname, // Use nickname as account name for now
            email: registerEmail,
            password: registerPassword,
          },
        });
      }

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
            // Check if channel already exists in store
            const existingChannel = server.channels.find(
              (c) => c.name === channelName,
            );
            if (existingChannel) {
              // Channel already exists, don't add duplicate
              return server;
            }
            return {
              ...server,
              channels: [...server.channels, channel],
            };
          }
          return server;
        });

        // Update localStorage with the new channel
        const savedServers = loadSavedServers();
        const currentServer = state.servers.find((s) => s.id === serverId);
        const savedServer = savedServers.find(
          (s) =>
            s.host === currentServer?.host && s.port === currentServer?.port,
        );
        if (savedServer && !savedServer.channels.includes(channel.name)) {
          savedServer.channels.push(channel.name);
          saveServersToLocalStorage(savedServers);
        }

        // Update channelOrder state to include the new channel
        const currentOrder = state.channelOrder[serverId] || [];
        if (!currentOrder.includes(channel.name)) {
          const newChannelOrder = {
            ...state.channelOrder,
            [serverId]: [...currentOrder, channel.name],
          };
          saveChannelOrder(newChannelOrder);

          // Update the selected channel if the server matches the current selection
          const isCurrentServer = state.ui.selectedServerId === serverId;

          return {
            servers: updatedServers,
            channelOrder: newChannelOrder,
            ui: {
              ...state.ui,
              selectedChannelId: isCurrentServer
                ? channel.id
                : state.ui.selectedChannelId,
            },
          };
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
      const currentServer = updatedServers.find((s) => s.id === serverId);
      const savedServer = savedServers.find(
        (s) => s.host === currentServer?.host && s.port === currentServer?.port,
      );
      if (savedServer) {
        savedServer.channels = currentServer?.channels.map((c) => c.name) || [];
        saveServersToLocalStorage(savedServers);
      }

      // Update channelOrder to remove the channel
      const currentOrder = state.channelOrder[serverId] || [];
      const newChannelOrder = {
        ...state.channelOrder,
        [serverId]: currentOrder.filter((name) => name !== channelName),
      };
      saveChannelOrder(newChannelOrder);

      return {
        servers: updatedServers,
        channelOrder: newChannelOrder,
      };
    });
  },

  sendMessage: (serverId, channelId, content) => {
    const message = ircClient.sendMessage(serverId, channelId, content);
  },

  redactMessage: (
    serverId: string,
    target: string,
    msgid: string,
    reason?: string,
  ) => {
    ircClient.sendRedact(serverId, target, msgid, reason);
  },

  registerAccount: (
    serverId: string,
    account: string,
    email: string,
    password: string,
  ) => {
    ircClient.registerAccount(serverId, account, email, password);
  },

  verifyAccount: (serverId: string, account: string, code: string) => {
    ircClient.verifyAccount(serverId, account, code);
  },

  warnUser: (serverId, channelName, username, reason) => {
    // Send a warning message to the user
    ircClient.sendRaw(serverId, `PRIVMSG ${username} :Warning: ${reason}`);
  },

  kickUser: (serverId, channelName, username, reason) => {
    ircClient.sendRaw(serverId, `KICK ${channelName} ${username} :${reason}`);
  },

  banUser: (serverId, channelName, username, reason) => {
    // First ban, then kick
    ircClient.sendRaw(serverId, `MODE ${channelName} +b ${username}!*@*`);
    ircClient.sendRaw(serverId, `KICK ${channelName} ${username} :${reason}`);
  },

  banUserByNick: (serverId, channelName, username, reason) => {
    // Ban by nickname only
    ircClient.sendRaw(serverId, `MODE ${channelName} +b ${username}`);
    ircClient.sendRaw(serverId, `KICK ${channelName} ${username} :${reason}`);
  },

  banUserByHostmask: (serverId, channelName, username, reason) => {
    // Ban by hostmask - look up the user's hostname from the channel or server user list
    const state = get();
    const server = state.servers.find((s) => s.id === serverId);
    if (!server) return;

    const channel = server.channels.find((c) => c.name === channelName);
    // Try to find the user in the channel's user list first, then fall back to server user list
    const user =
      channel?.users.find((u) => u.username === username) ||
      server.users.find((u) => u.username === username);

    const hostname = user?.hostname || "*";
    ircClient.sendRaw(serverId, `MODE ${channelName} +b *!*@${hostname}`);
    ircClient.sendRaw(serverId, `KICK ${channelName} ${username} :${reason}`);
  },

  listChannels: (serverId) => {
    const state = get();
    if (state.listingInProgress[serverId]) {
      // Already listing, ignore
      return;
    }
    // Clear the channel list before starting a new list
    set((state) => ({
      channelList: {
        ...state.channelList,
        [serverId]: [],
      },
      listingInProgress: {
        ...state.listingInProgress,
        [serverId]: true,
      },
    }));
    ircClient.listChannels(serverId);
  },

  renameChannel: (serverId, oldName, newName, reason) => {
    ircClient.renameChannel(serverId, oldName, newName, reason);
  },

  setName: (serverId, realname) => {
    ircClient.setName(serverId, realname);
  },

  changeNick: (serverId, newNick) => {
    ircClient.changeNick(serverId, newNick);
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

  addGlobalNotification: (notification) => {
    set((state) => ({
      globalNotifications: [
        ...state.globalNotifications,
        {
          id: uuidv4(),
          ...notification,
          timestamp: new Date(),
        },
      ],
    }));

    // Play error sound for FAIL notifications
    if (notification.type === "fail") {
      try {
        const audio = new Audio("/sounds/error.mp3");
        audio.volume = 0.3; // Set reasonable volume for notifications
        audio.play().catch((error) => {
          console.error("Failed to play error sound:", error);
        });
      } catch (error) {
        console.error("Failed to play error sound:", error);
      }
    }
  },

  removeGlobalNotification: (notificationId) => {
    set((state) => ({
      globalNotifications: state.globalNotifications.filter(
        (n) => n.id !== notificationId,
      ),
    }));
  },

  clearGlobalNotifications: () => {
    set(() => ({
      globalNotifications: [],
    }));
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
      // Special case for server notices
      if (channelId === "server-notices") {
        return {
          ui: {
            ...state.ui,
            selectedChannelId: channelId,
            selectedPrivateChatId: null, // Clear private chat selection
            isMobileMenuOpen: false,
            mobileViewActiveColumn: "chatView",
          },
        };
      }

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

  reorderChannels: (serverId, channelIds) => {
    set((state) => {
      // Also update the savedServer.channels array to match the new order
      const server = state.servers.find((s) => s.id === serverId);
      if (server) {
        const savedServers = loadSavedServers();
        const savedServer = savedServers.find(
          (s) => s.host === server.host && s.port === server.port,
        );

        if (savedServer) {
          // Convert channel IDs to channel names in the correct order
          const channelNames = channelIds
            .map((id) => {
              const channel = server.channels.find((c) => c.id === id);
              return channel?.name;
            })
            .filter((name): name is string => name !== undefined);

          savedServer.channels = channelNames;
          saveServersToLocalStorage(savedServers);

          // Store channel names in channelOrder state (not IDs)
          const newChannelOrder = {
            ...state.channelOrder,
            [serverId]: channelNames,
          };

          saveChannelOrder(newChannelOrder);

          return {
            channelOrder: newChannelOrder,
          };
        }
      }

      // Fallback if server not found
      return {};
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

      // Get the current user for this specific server
      const currentUser = ircClient.getCurrentUser(serverId);

      // Don't allow opening private chats with ourselves
      if (currentUser?.username === username) {
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
      name,
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
          name || host, // Use saved name, default to host
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

      // Remove server's metadata from localStorage
      const savedMetadata = loadSavedMetadata();
      delete savedMetadata[serverId];
      saveMetadataToLocalStorage(savedMetadata);

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

  setProfileViewRequest: (serverId, username) => {
    set((state) => ({
      ui: {
        ...state.ui,
        profileViewRequest: { serverId, username },
      },
    }));
  },

  clearProfileViewRequest: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        profileViewRequest: null,
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

      // Only change mobileViewActiveColumn if we're not on the serverList view
      // This prevents desktop member list toggles from affecting mobile navigation
      const shouldUpdateMobileColumn =
        state.ui.mobileViewActiveColumn !== "serverList";

      return {
        ui: {
          ...state.ui,
          isMemberListVisible:
            openState !== undefined ? openState : !state.ui.isMemberListVisible,
          mobileViewActiveColumn: shouldUpdateMobileColumn
            ? openState
              ? "memberList"
              : "chatView"
            : state.ui.mobileViewActiveColumn,
        },
      };
    });
  },

  toggleChannelList: (isOpen) => {
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

  toggleChannelListModal: (isOpen) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isChannelListModalOpen:
          isOpen !== undefined ? isOpen : !state.ui.isChannelListModalOpen,
      },
    }));
  },

  toggleChannelRenameModal: (isOpen?: boolean) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isChannelRenameModalOpen:
          isOpen !== undefined ? isOpen : !state.ui.isChannelRenameModalOpen,
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

  setMobileViewActiveColumn: (column: layoutColumn) => {
    set((state) => ({
      ui: {
        ...state.ui,
        mobileViewActiveColumn: column,
      },
    }));
  },

  toggleServerNoticesPopup: (isOpen) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isServerNoticesPopupOpen:
          isOpen !== undefined ? isOpen : !state.ui.isServerNoticesPopupOpen,
        serverNoticesPopupMinimized: false, // Reset minimized state when toggling
      },
    }));
  },

  minimizeServerNoticesPopup: (isMinimized) => {
    set((state) => ({
      ui: {
        ...state.ui,
        serverNoticesPopupMinimized:
          isMinimized !== undefined
            ? isMinimized
            : !state.ui.serverNoticesPopupMinimized,
      },
    }));
  },

  // Settings actions
  updateGlobalSettings: (settings: Partial<GlobalSettings>) => {
    set((state) => {
      const newGlobalSettings = {
        ...state.globalSettings,
        ...settings,
      };
      // Save to localStorage
      saveGlobalSettingsToLocalStorage(newGlobalSettings);
      return {
        globalSettings: newGlobalSettings,
      };
    });
  },

  // Ignore list actions
  addToIgnoreList: (pattern: string) => {
    set((state) => {
      const trimmedPattern = pattern.trim();
      if (
        !trimmedPattern ||
        state.globalSettings.ignoreList.includes(trimmedPattern)
      ) {
        return state;
      }

      const newIgnoreList = [
        ...state.globalSettings.ignoreList,
        trimmedPattern,
      ];
      const newGlobalSettings = {
        ...state.globalSettings,
        ignoreList: newIgnoreList,
      };

      // Save to localStorage
      saveGlobalSettingsToLocalStorage(newGlobalSettings);

      return {
        globalSettings: newGlobalSettings,
      };
    });
  },

  removeFromIgnoreList: (pattern: string) => {
    set((state) => {
      const newIgnoreList = state.globalSettings.ignoreList.filter(
        (p) => p !== pattern,
      );
      const newGlobalSettings = {
        ...state.globalSettings,
        ignoreList: newIgnoreList,
      };

      // Save to localStorage
      saveGlobalSettingsToLocalStorage(newGlobalSettings);

      return {
        globalSettings: newGlobalSettings,
      };
    });
  },

  // Attachment actions
  addInputAttachment: (attachment: Attachment) => {
    set((state) => ({
      ui: {
        ...state.ui,
        inputAttachments: [...state.ui.inputAttachments, attachment],
      },
    }));
  },

  removeInputAttachment: (attachmentId: string) => {
    set((state) => ({
      ui: {
        ...state.ui,
        inputAttachments: state.ui.inputAttachments.filter(
          (att) => att.id !== attachmentId,
        ),
      },
    }));
  },

  clearInputAttachments: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        inputAttachments: [],
      },
    }));
  },

  // Metadata actions
  metadataGet: (serverId, target, keys) => {
    if (serverSupportsMetadata(serverId)) {
      ircClient.metadataGet(serverId, target, keys);
    }
  },

  metadataList: (serverId, target) => {
    if (serverSupportsMetadata(serverId)) {
      ircClient.metadataList(serverId, target);
    }
  },

  metadataSet: (serverId, target, key, value, visibility) => {
    if (serverSupportsMetadata(serverId)) {
      ircClient.metadataSet(serverId, target, key, value, visibility);
    }
  },

  metadataClear: (serverId, target) => {
    if (serverSupportsMetadata(serverId)) {
      ircClient.metadataClear(serverId, target);
    }
  },

  metadataSub: (serverId, keys) => {
    if (serverSupportsMetadata(serverId)) {
      console.log(
        `[METADATA_SUB] Subscribing to keys for server ${serverId}:`,
        keys,
      );
      ircClient.metadataSub(serverId, keys);
    } else {
    }
  },

  metadataUnsub: (serverId, keys) => {
    if (serverSupportsMetadata(serverId)) {
      ircClient.metadataUnsub(serverId, keys);
    }
  },

  metadataSubs: (serverId) => {
    if (serverSupportsMetadata(serverId)) {
      ircClient.metadataSubs(serverId);
    }
  },

  metadataSync: (serverId, target) => {
    if (serverSupportsMetadata(serverId)) {
      ircClient.metadataSync(serverId, target);
    }
  },

  sendRaw: (serverId, command) => {
    ircClient.sendRaw(serverId, command);
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

  // Check if sender is ignored
  const globalSettings = useStore.getState().globalSettings;
  if (
    isUserIgnored(
      response.sender,
      undefined,
      undefined,
      globalSettings.ignoreList,
    )
  ) {
    // User is ignored, skip processing this message
    return;
  }

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
        ? findChannelMessageById(server.id, channel.id, replyId) || null
        : null;

      // Check for mentions and get current state
      const currentState = useStore.getState();
      const currentServerUser = ircClient.getCurrentUser(response.serverId);
      // Don't trigger mentions for our own messages
      const isOwnMessage = response.sender === currentServerUser?.username;
      const hasMention =
        !isOwnMessage &&
        checkForMention(
          message,
          currentServerUser,
          currentState.globalSettings,
        );
      const mentions = !isOwnMessage
        ? extractMentions(
            message,
            currentServerUser,
            currentState.globalSettings,
          )
        : [];

      const newMessage = {
        id: uuidv4(),
        msgid: mtags?.msgid,
        content: message,
        timestamp,
        userId: response.sender,
        channelId: channel.id,
        serverId: server.id,
        type: "message" as const,
        reactions: [],
        replyMessage: replyMessage,
        mentioned: mentions,
        tags: mtags,
      };

      // Update channel unread count and mention flag if not the active channel
      const isActiveChannel =
        currentState.ui.selectedChannelId === channel.id &&
        currentState.ui.selectedServerId === server.id;

      // Don't count unread/mentions for historical messages (batch tag indicates chathistory playback)
      const isHistoricalMessage = mtags?.batch !== undefined;

      if (
        !isActiveChannel &&
        response.sender !== currentServerUser?.username &&
        !isHistoricalMessage
      ) {
        useStore.setState((state) => {
          const updatedServers = state.servers.map((s) => {
            if (s.id === server.id) {
              const updatedChannels = s.channels.map((ch) => {
                if (ch.id === channel.id) {
                  return {
                    ...ch,
                    unreadCount: ch.unreadCount + 1,
                    isMentioned: hasMention || ch.isMentioned,
                  };
                }
                return ch;
              });
              return { ...s, channels: updatedChannels };
            }
            return s;
          });
          return { servers: updatedServers };
        });

        // Show browser notification for mentions
        if (hasMention && currentState.globalSettings.enableNotifications) {
          showMentionNotification(
            server.id,
            channelName,
            response.sender,
            message,
            (serverId, msg) => {
              // Fallback: Add a NOTE standard reply notification
              useStore.getState().addGlobalNotification({
                type: "note",
                command: "MENTION",
                code: "HIGHLIGHT",
                message: msg,
                serverId,
              });
            },
          );
        }
      }

      // If message has bot tag, mark user as bot
      if (mtags?.bot !== undefined) {
        useStore.setState((state) => {
          const updatedServers = state.servers.map((s) => {
            if (s.id === server.id) {
              const updatedChannels = s.channels.map((channel) => {
                const updatedUsers = channel.users.map((user) => {
                  if (user.username === response.sender) {
                    return {
                      ...user,
                      isBot: true, // Set bot flag from message tags
                      metadata: {
                        ...user.metadata,
                        bot: { value: "true", visibility: "public" },
                      },
                    };
                  }
                  return user;
                });
                return { ...channel, users: updatedUsers };
              });
              return { ...s, channels: updatedChannels };
            }
            return s;
          });
          return { servers: updatedServers };
        });
      }

      useStore.getState().addMessage(newMessage);

      // Play notification sound if appropriate (but not for historical messages)
      if (!isHistoricalMessage) {
        const state = useStore.getState();
        const serverCurrentUser = ircClient.getCurrentUser(response.serverId);
        if (
          shouldPlayNotificationSound(
            newMessage,
            serverCurrentUser,
            state.globalSettings,
          )
        ) {
          playNotificationSound(state.globalSettings);
        }
      }

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

// Handle multiline messages
ircClient.on("MULTILINE_MESSAGE", (response) => {
  const { mtags, channelName, sender, message, messageIds, timestamp } =
    response;

  // Check if sender is ignored
  const globalSettings = useStore.getState().globalSettings;
  if (isUserIgnored(sender, undefined, undefined, globalSettings.ignoreList)) {
    // User is ignored, skip processing this message
    return;
  }

  // Find the server and channel
  const server = useStore
    .getState()
    .servers.find((s) => s.id === response.serverId);

  if (server) {
    const channel = channelName
      ? server.channels.find((c) => c.name === channelName)
      : null;

    if (channel) {
      const replyId = mtags?.["+draft/reply"]
        ? mtags["+draft/reply"].trim()
        : null;

      const replyMessage = replyId
        ? findChannelMessageById(server.id, channel.id, replyId) || null
        : null;

      const newMessage = {
        id: uuidv4(),
        msgid: mtags?.msgid,
        multilineMessageIds: messageIds, // Store all message IDs for redaction
        content: message, // Use the properly combined message from IRC client
        timestamp,
        userId: sender,
        channelId: channel.id,
        serverId: server.id,
        type: "message" as const,
        reactions: [],
        replyMessage: replyMessage,
        mentioned: [], // Add logic for mentions if needed
        tags: mtags,
      };

      // If message has bot tag, mark user as bot
      if (mtags?.bot !== undefined) {
        useStore.setState((state) => {
          const updatedServers = state.servers.map((s) => {
            if (s.id === server.id) {
              const updatedChannels = s.channels.map((channel) => {
                const updatedUsers = channel.users.map((user) => {
                  if (user.username === sender) {
                    return {
                      ...user,
                      isBot: true,
                    };
                  }
                  return user;
                });
                return { ...channel, users: updatedUsers };
              });
              return { ...s, channels: updatedChannels };
            }
            return s;
          });
          return { servers: updatedServers };
        });
      }

      useStore.getState().addMessage(newMessage);

      // Play notification sound if appropriate (but not for historical messages)
      // Don't count unread/mentions for historical messages (batch tag indicates chathistory playback)
      const isHistoricalMessage = mtags?.batch !== undefined;

      if (!isHistoricalMessage) {
        const state = useStore.getState();
        const serverCurrentUser = ircClient.getCurrentUser(response.serverId);
        if (
          shouldPlayNotificationSound(
            newMessage,
            serverCurrentUser,
            state.globalSettings,
          )
        ) {
          playNotificationSound(state.globalSettings);
        }
      }

      // Remove any typing users from the state
      useStore.setState((state) => {
        const key = `${server.id}-${channel.id}`;
        const currentUsers = state.typingUsers[key] || [];
        return {
          typingUsers: {
            ...state.typingUsers,
            [key]: currentUsers.filter((u) => u.username !== sender),
          },
        };
      });
    } else if (!channelName) {
      // Handle multiline private messages
      // Similar logic to USERMSG but for multiline content
      const currentUser = ircClient.getCurrentUser(response.serverId);
      if (currentUser && sender === currentUser.username) {
        return; // Don't create private chats with ourselves
      }

      // Create or find private chat
      let privateChat = server.privateChats.find(
        (chat) => chat.username === sender,
      );
      if (!privateChat) {
        const newPrivateChat = {
          id: uuidv4(),
          username: sender,
          serverId: server.id,
          unreadCount: 0,
          isMentioned: false,
        };
        privateChat = newPrivateChat;
        useStore.setState((state) => ({
          servers: state.servers.map((s) =>
            s.id === server.id
              ? { ...s, privateChats: [...s.privateChats, newPrivateChat] }
              : s,
          ),
        }));
      }

      const newMessage = {
        id: uuidv4(),
        msgid: mtags?.msgid,
        multilineMessageIds: messageIds, // Store all message IDs for redaction
        content: message, // Use the properly combined message from IRC client
        timestamp,
        userId: sender,
        channelId: privateChat.id,
        serverId: server.id,
        type: "message" as const,
        reactions: [],
        replyMessage: null,
        mentioned: [],
        tags: mtags,
      };

      useStore.getState().addMessage(newMessage);

      // Play notification sound if appropriate (but not for historical messages)
      // Don't count unread/mentions for historical messages (batch tag indicates chathistory playback)
      const isHistoricalMessage = mtags?.batch !== undefined;

      if (!isHistoricalMessage) {
        const state = useStore.getState();
        const serverCurrentUser = ircClient.getCurrentUser(response.serverId);
        if (
          shouldPlayNotificationSound(
            newMessage,
            serverCurrentUser,
            state.globalSettings,
          )
        ) {
          playNotificationSound(state.globalSettings);
        }
      }
    }
  }
});

// Handle private messages (USERMSG)
ircClient.on("USERMSG", (response) => {
  const { mtags, sender, target, message, timestamp } = response;

  console.log("[USERMSG] Received:", {
    sender,
    target,
    message,
    channelContext: mtags?.["+draft/channel-context"],
  });

  // Find the server
  const server = useStore
    .getState()
    .servers.find((s) => s.id === response.serverId);

  if (server) {
    // Check if this is a whisper (has draft/channel-context tag)
    // Note: Client tags use + prefix, so check both with and without
    const channelContext = mtags?.["+draft/channel-context"];

    if (channelContext) {
      console.log("[WHISPER] Detected channel-context tag:", channelContext);
      console.log(
        "[WHISPER] Available channels:",
        server.channels.map((c) => c.name),
      );

      // This is a whisper - route it to the channel specified in the tag
      // Use case-insensitive matching
      const channel = server.channels.find(
        (c) => c.name.toLowerCase() === channelContext.toLowerCase(),
      );

      console.log(
        "[WHISPER] Found channel:",
        channel ? channel.name : "NOT FOUND",
      );

      if (channel) {
        const replyId = mtags?.["+draft/reply"]
          ? mtags["+draft/reply"].trim()
          : null;

        const replyMessage = replyId
          ? findChannelMessageById(server.id, channel.id, replyId) || null
          : null;

        const newMessage = {
          id: uuidv4(),
          msgid: mtags?.msgid,
          content: message,
          timestamp,
          userId: sender,
          channelId: channel.id,
          serverId: server.id,
          type: "message" as const,
          reactions: [],
          replyMessage: replyMessage,
          mentioned: [],
          tags: mtags, // This includes the draft/channel-context tag
          whisperTarget: target, // Store the recipient for display
        };

        useStore.getState().addMessage(newMessage);

        // Play notification sound if appropriate (only if it's not from ourselves and not historical)
        const currentUser = ircClient.getCurrentUser(response.serverId);
        const isHistoricalMessage = mtags?.batch !== undefined;

        if (currentUser?.username !== sender && !isHistoricalMessage) {
          const state = useStore.getState();
          const serverCurrentUser = ircClient.getCurrentUser(response.serverId);
          if (
            shouldPlayNotificationSound(
              newMessage,
              serverCurrentUser,
              state.globalSettings,
            )
          ) {
            playNotificationSound(state.globalSettings);
          }
        }

        return; // Early return - don't create a private chat
      }
    }
  }

  // Don't create private chats with ourselves when the server echoes back our own messages
  const currentUser = ircClient.getCurrentUser(response.serverId);
  if (currentUser?.username === sender) {
    return;
  }

  // Check if sender is ignored
  const globalSettings = useStore.getState().globalSettings;
  if (isUserIgnored(sender, undefined, undefined, globalSettings.ignoreList)) {
    // User is ignored, skip processing this message
    return;
  }

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
        tags: mtags,
      };

      // If message has bot tag, mark user as bot
      if (mtags?.bot !== undefined) {
        useStore.setState((state) => {
          const updatedServers = state.servers.map((s) => {
            if (s.id === server.id) {
              const updatedChannels = s.channels.map((channel) => {
                const updatedUsers = channel.users.map((user) => {
                  if (user.username === sender) {
                    return {
                      ...user,
                      isBot: true, // Set bot flag from message tags
                      metadata: {
                        ...user.metadata,
                        bot: { value: "true", visibility: "public" },
                      },
                    };
                  }
                  return user;
                });
                return { ...channel, users: updatedUsers };
              });
              return { ...s, channels: updatedChannels };
            }
            return s;
          });
          return { servers: updatedServers };
        });
      }

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
      // Don't count unread/mentions for historical messages (batch tag indicates chathistory playback)
      const isHistoricalMessage = mtags?.batch !== undefined;

      // Play notification sound if appropriate (but not for historical messages)
      if (!isHistoricalMessage) {
        const state = useStore.getState();
        const serverCurrentUser = ircClient.getCurrentUser(response.serverId);
        if (
          shouldPlayNotificationSound(
            newMessage,
            serverCurrentUser,
            state.globalSettings,
          )
        ) {
          playNotificationSound(state.globalSettings);
        }
      }

      useStore.setState((state) => {
        const updatedServers = state.servers.map((s) => {
          if (s.id === server.id) {
            const updatedPrivateChats =
              s.privateChats?.map((pc) => {
                if (pc.id === privateChat.id) {
                  const isActive = state.ui.selectedPrivateChatId === pc.id;
                  return {
                    ...pc,
                    lastActivity: new Date(),
                    unreadCount:
                      isActive || isHistoricalMessage ? 0 : pc.unreadCount + 1,
                    isMentioned: !isHistoricalMessage && true, // All PMs are considered mentions (except historical)
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

      // Show browser notification for private messages
      const currentState = useStore.getState();
      const isActiveChat =
        currentState.ui.selectedPrivateChatId === privateChat.id;
      if (
        !isActiveChat &&
        !isHistoricalMessage &&
        currentState.globalSettings.enableNotifications
      ) {
        showMentionNotification(
          server.id,
          `DM from ${sender}`,
          sender,
          message,
          (serverId, msg) => {
            // Fallback: Add a NOTE standard reply notification
            useStore.getState().addGlobalNotification({
              type: "note",
              command: "PRIVMSG",
              code: "DM",
              message: msg,
              serverId,
            });
          },
        );
      }
    }
  }
});

ircClient.on("CHANNNOTICE", (response) => {
  const { mtags, channelName, message, timestamp } = response;

  // Check if sender is ignored
  const globalSettings = useStore.getState().globalSettings;
  if (
    isUserIgnored(
      response.sender,
      undefined,
      undefined,
      globalSettings.ignoreList,
    )
  ) {
    // User is ignored, skip processing this notice
    return;
  }

  // Find the server
  const server = useStore
    .getState()
    .servers.find((s) => s.id === response.serverId);

  if (!server) return;

  // Check if this is a JSON log notice
  const isJsonLog = mtags?.["unrealircd.org/json-log"];
  let jsonLogData = null;
  if (isJsonLog) {
    try {
      const jsonString = mtags["unrealircd.org/json-log"];
      // Log the raw JSON string for debugging (first 200 chars)
      console.log(
        "Raw JSON log data:",
        jsonString.substring(0, 200) + (jsonString.length > 200 ? "..." : ""),
      );
      jsonLogData = JSON.parse(jsonString);
    } catch (error) {
      console.error("Failed to parse JSON log:", error);
      console.error("Raw JSON string was:", mtags["unrealircd.org/json-log"]);
      // Try to clean up common issues
      try {
        const cleanedJson = mtags["unrealircd.org/json-log"]
          // Replace all \s with spaces (UnrealIRCd uses \s as non-standard space escape)
          .replace(/\\s/g, " ")
          // Handle other potential escape issues
          .replace(/\\'/g, "'")
          .replace(/\\&/g, "&");

        jsonLogData = JSON.parse(cleanedJson);
        console.log("Successfully parsed after cleanup");
      } catch (cleanupError) {
        console.error("Failed to parse even after cleanup:", cleanupError);
        // Try a more aggressive cleanup
        try {
          const aggressiveClean = mtags["unrealircd.org/json-log"]
            .replace(/\\s/g, " ") // Replace all \s with spaces
            .replace(/\\'/g, "'") // Replace \' with '
            .replace(/\\&/g, "&"); // Replace \& with &

          jsonLogData = JSON.parse(aggressiveClean);
          console.log("Successfully parsed with aggressive cleanup");
        } catch (aggressiveError) {
          console.error("Failed aggressive cleanup:", aggressiveError);
          // As a last resort, try to extract what we can
          try {
            // Look for JSON-like structure and extract key parts
            const jsonStr = mtags["unrealircd.org/json-log"];
            const extracted: Record<string, unknown> = {};
            // Try to extract common fields manually
            const timeMatch = jsonStr.match(/"timestamp":"([^"]+)"/);
            if (timeMatch) extracted.timestamp = timeMatch[1];
            const levelMatch = jsonStr.match(/"level":"([^"]+)"/);
            if (levelMatch) extracted.level = levelMatch[1];
            const msgMatch = jsonStr.match(/"msg":"([^"]+)"/);
            if (msgMatch) {
              // Clean the message
              extracted.msg = msgMatch[1].replace(/\\s/g, " ");
            }
            if (Object.keys(extracted).length > 0) {
              jsonLogData = extracted;
              console.log("Extracted partial data:", extracted);
            }
          } catch (extractError) {
            console.error("Failed to extract partial data:", extractError);
          }
        }
      }
    }
  }

  // Route all server notices to the server notices channel
  const targetChannelId = "server-notices";

  const newMessage: Message = {
    id: uuidv4(),
    type: isJsonLog ? "notice" : "notice", // Keep as notice type
    content: message,
    timestamp: timestamp,
    userId: response.sender,
    channelId: targetChannelId,
    serverId: server.id,
    reactions: [],
    replyMessage: null,
    mentioned: [],
    tags: mtags,
    jsonLogData, // Add parsed JSON log data
  };

  useStore.getState().addMessage(newMessage);

  // Play notification sound if appropriate (but not for historical messages)
  // Don't count unread/mentions for historical messages (batch tag indicates chathistory playback)
  const isHistoricalMessage = mtags?.batch !== undefined;

  if (!isHistoricalMessage) {
    const state = useStore.getState();
    const serverCurrentUser = ircClient.getCurrentUser(response.serverId);
    if (
      shouldPlayNotificationSound(
        newMessage,
        serverCurrentUser,
        state.globalSettings,
      )
    ) {
      playNotificationSound(state.globalSettings);
    }
  }
});

ircClient.on("USERNOTICE", (response) => {
  const { mtags, message, timestamp } = response;

  // Check if sender is ignored
  const globalSettings = useStore.getState().globalSettings;
  if (
    isUserIgnored(
      response.sender,
      undefined,
      undefined,
      globalSettings.ignoreList,
    )
  ) {
    // User is ignored, skip processing this notice
    return;
  }

  // Find the server
  const server = useStore
    .getState()
    .servers.find((s) => s.id === response.serverId);

  if (!server) return;

  // Check if this is a JSON log notice
  const isJsonLog = mtags?.["unrealircd.org/json-log"];
  let jsonLogData = null;
  if (isJsonLog) {
    try {
      const jsonString = mtags["unrealircd.org/json-log"];
      // Log the raw JSON string for debugging (first 200 chars)
      console.log(
        "Raw JSON log data:",
        jsonString.substring(0, 200) + (jsonString.length > 200 ? "..." : ""),
      );
      jsonLogData = JSON.parse(jsonString);
    } catch (error) {
      console.error("Failed to parse JSON log:", error);
      console.error("Raw JSON string was:", mtags["unrealircd.org/json-log"]);
      // Try to clean up common issues
      try {
        const cleanedJson = mtags["unrealircd.org/json-log"]
          // Replace all \s with spaces (UnrealIRCd uses \s as non-standard space escape)
          .replace(/\\s/g, " ")
          // Handle other potential escape issues
          .replace(/\\'/g, "'")
          .replace(/\\&/g, "&");

        jsonLogData = JSON.parse(cleanedJson);
        console.log("Successfully parsed after cleanup");
      } catch (cleanupError) {
        console.error("Failed to parse even after cleanup:", cleanupError);
        // Try a more aggressive cleanup
        try {
          const aggressiveClean = mtags["unrealircd.org/json-log"]
            .replace(/\\s/g, " ") // Replace all \s with spaces
            .replace(/\\'/g, "'") // Replace \' with '
            .replace(/\\&/g, "&"); // Replace \& with &

          jsonLogData = JSON.parse(aggressiveClean);
          console.log("Successfully parsed with aggressive cleanup");
        } catch (aggressiveError) {
          console.error("Failed aggressive cleanup:", aggressiveError);
          // As a last resort, try to extract what we can
          try {
            // Look for JSON-like structure and extract key parts
            const jsonStr = mtags["unrealircd.org/json-log"];
            const extracted: Record<string, unknown> = {};
            // Try to extract common fields manually
            const timeMatch = jsonStr.match(/"timestamp":"([^"]+)"/);
            if (timeMatch) extracted.timestamp = timeMatch[1];
            const levelMatch = jsonStr.match(/"level":"([^"]+)"/);
            if (levelMatch) extracted.level = levelMatch[1];
            const msgMatch = jsonStr.match(/"msg":"([^"]+)"/);
            if (msgMatch) {
              // Clean the message
              extracted.msg = msgMatch[1].replace(/\\s/g, " ");
            }
            if (Object.keys(extracted).length > 0) {
              jsonLogData = extracted;
              console.log("Extracted partial data:", extracted);
            }
          } catch (extractError) {
            console.error("Failed to extract partial data:", extractError);
          }
        }
      }
    }
  }

  // Route all server notices to the server notices channel
  const targetChannelId = "server-notices";

  const newMessage: Message = {
    id: uuidv4(),
    type: isJsonLog ? "notice" : "notice", // Keep as notice type
    content: message,
    timestamp: timestamp,
    userId: response.sender,
    channelId: targetChannelId,
    serverId: server.id,
    reactions: [],
    replyMessage: null,
    mentioned: [],
    tags: mtags,
    jsonLogData, // Add parsed JSON log data
  };

  useStore.getState().addMessage(newMessage);

  // Play notification sound if appropriate (but not for historical messages)
  // Don't count unread/mentions for historical messages (batch tag indicates chathistory playback)
  const isHistoricalMessage = mtags?.batch !== undefined;

  if (!isHistoricalMessage) {
    const state = useStore.getState();
    const serverCurrentUser = ircClient.getCurrentUser(response.serverId);
    if (
      shouldPlayNotificationSound(
        newMessage,
        serverCurrentUser,
        state.globalSettings,
      )
    ) {
      playNotificationSound(state.globalSettings);
    }
  }
});

ircClient.on(
  "JOIN",
  ({ serverId, username, channelName, batchTag, account, realname }) => {
    // If this event is part of a batch, store it for later processing
    if (batchTag) {
      const state = useStore.getState();
      const batch = state.activeBatches[serverId]?.[batchTag];
      if (batch) {
        batch.events.push({
          type: "JOIN",
          data: { serverId, username, channelName, account, realname },
        });
        return;
      }
    }

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
                // Check if this is the current user and copy their metadata
                const ircCurrentUser = ircClient.getCurrentUser(serverId);
                const isCurrentUser = ircCurrentUser?.username === username;
                const userMetadata =
                  isCurrentUser && ircCurrentUser
                    ? ircCurrentUser.metadata
                    : {};

                return {
                  ...channel,
                  users: [
                    ...channel.users,
                    {
                      id: uuidv4(), // Again, give them a unique ID
                      username,
                      isOnline: true,
                      status: "",
                      account, // Store account from extended-join if available
                      metadata: userMetadata,
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

      // Request metadata for the joining user to get their current metadata
      // This is needed for users who join after we're already in the channel
      if (serverSupportsMetadata(serverId)) {
        setTimeout(() => {
          useStore.getState().metadataList(serverId, username);
        }, 100);
      }

      return { servers: updatedServers };
    });

    // If we joined a channel, request channel information
    const ourNick = ircClient.getNick(serverId);
    if (username === ourNick) {
      // Request topic and user list
      ircClient.sendRaw(serverId, `TOPIC ${channelName}`);
      ircClient.sendRaw(serverId, `WHO ${channelName}`);

      // Request channel metadata if server supports it
      if (serverSupportsMetadata(serverId)) {
        setTimeout(() => {
          ircClient.metadataGet(serverId, channelName, [
            "avatar",
            "display-name",
          ]);
        }, 100);
      }
    }

    // Add join message if settings allow
    const state = useStore.getState();
    if (
      state.globalSettings.showEvents &&
      state.globalSettings.showJoinsParts
    ) {
      const server = state.servers.find((s) => s.id === serverId);
      if (server) {
        const channel = server.channels.find((c) => c.name === channelName);
        if (channel) {
          const joinMessage: Message = {
            id: uuidv4(),
            type: "join",
            content: `joined ${channelName}`,
            timestamp: new Date(),
            userId: username,
            channelId: channel.id,
            serverId: serverId,
            reactions: [],
            replyMessage: null,
            mentioned: [],
          };

          const key = `${serverId}-${channel.id}`;
          useStore.setState((state) => ({
            messages: {
              ...state.messages,
              [key]: [...(state.messages[key] || []), joinMessage],
            },
          }));
        }
      }
    }
  },
);

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

    // Update currentUser only if this nick change is for the currently selected server
    // and it's our own nick that changed
    let updatedCurrentUser = state.currentUser;
    const isSelectedServer = state.ui.selectedServerId === serverId;
    const serverCurrentUser = ircClient.getCurrentUser(serverId);
    const isOurNick =
      serverCurrentUser?.username === oldNick ||
      serverCurrentUser?.username === newNick;

    if (
      isSelectedServer &&
      isOurNick &&
      state.currentUser &&
      state.currentUser.username === oldNick
    ) {
      updatedCurrentUser = { ...state.currentUser, username: newNick };
    }

    return {
      servers: updatedServers,
      currentUser: updatedCurrentUser,
    };
  });

  // Add nick change messages to all channels where the user was present
  const state = useStore.getState();
  const server = state.servers.find((s) => s.id === serverId);
  if (
    server &&
    state.globalSettings.showEvents &&
    state.globalSettings.showNickChanges
  ) {
    // Check if this was our own nick change
    const ourNick = ircClient.getNick(serverId);
    const isOurNickChange = oldNick === ourNick || newNick === ourNick;

    // Add message to each channel where the user was present
    server.channels.forEach((channel) => {
      const userWasInChannel = channel.users.some(
        (user) => user.username === newNick,
      );
      if (userWasInChannel) {
        const nickChangeMessage: Message = {
          id: uuidv4(),
          type: "nick",
          content: isOurNickChange
            ? `are now known as **${newNick}**`
            : `is now known as **${newNick}**`,
          timestamp: new Date(),
          userId: oldNick, // Use the old nick as the user ID for nick changes
          channelId: channel.id,
          serverId: serverId,
          reactions: [],
          replyMessage: null,
          mentioned: [],
        };

        const key = `${serverId}-${channel.id}`;
        useStore.setState((state) => ({
          messages: {
            ...state.messages,
            [key]: [...(state.messages[key] || []), nickChangeMessage],
          },
        }));
      }
    });

    // Also add to private chat if we have one open with this user
    const privateChat = server.privateChats?.find(
      (pc) => pc.username === oldNick || pc.username === newNick,
    );
    if (privateChat) {
      // Update the private chat username
      useStore.setState((state) => {
        const updatedServers = state.servers.map((s) => {
          if (s.id === serverId) {
            const updatedPrivateChats = s.privateChats?.map((pc) => {
              if (pc.username === oldNick) {
                return { ...pc, username: newNick };
              }
              return pc;
            });
            return { ...s, privateChats: updatedPrivateChats };
          }
          return s;
        });
        return { servers: updatedServers };
      });

      // Add nick change message to private chat
      const nickChangeMessage: Message = {
        id: uuidv4(),
        type: "nick",
        content: isOurNickChange
          ? `are now known as **${newNick}**`
          : `is now known as **${newNick}**`,
        timestamp: new Date(),
        userId: oldNick,
        channelId: privateChat.id,
        serverId: serverId,
        reactions: [],
        replyMessage: null,
        mentioned: [],
      };

      const key = `${serverId}-${privateChat.id}`;
      useStore.setState((state) => ({
        messages: {
          ...state.messages,
          [key]: [...(state.messages[key] || []), nickChangeMessage],
        },
      }));
    }

    // Note: IRC client already handles updating its internal nick storage
  }
});

ircClient.on("QUIT", ({ serverId, username, reason, batchTag }) => {
  // If this event is part of a batch, store it for later processing
  if (batchTag) {
    const state = useStore.getState();
    const batch = state.activeBatches[serverId]?.[batchTag];
    if (batch) {
      batch.events.push({
        type: "QUIT",
        data: { serverId, username, reason },
      });
      return;
    }
  }

  // Get the current state to check which channels the user was in before removing them
  const state = useStore.getState();
  const server = state.servers.find((s) => s.id === serverId);
  const channelsUserWasIn: string[] = [];

  if (server) {
    server.channels.forEach((channel) => {
      const userWasInChannel = channel.users.some(
        (user) => user.username === username,
      );
      if (userWasInChannel) {
        channelsUserWasIn.push(channel.id);
      }
    });
  }

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

  // Add quit message if settings allow
  if (state.globalSettings.showEvents && state.globalSettings.showQuits) {
    if (server) {
      // Add quit message to all channels where the user was present
      server.channels.forEach((channel) => {
        if (channelsUserWasIn.includes(channel.id)) {
          const quitMessage: Message = {
            id: uuidv4(),
            type: "quit",
            content: reason ? `quit (${reason})` : "quit",
            timestamp: new Date(),
            userId: username,
            channelId: channel.id,
            serverId: serverId,
            reactions: [],
            replyMessage: null,
            mentioned: [],
          };

          const key = `${serverId}-${channel.id}`;
          useStore.setState((state) => ({
            messages: {
              ...state.messages,
              [key]: [...(state.messages[key] || []), quitMessage],
            },
          }));
        }
      });
    }
  }
});

ircClient.on("ready", async ({ serverId, serverName, nickname }) => {
  // Restore metadata for this server
  restoreServerMetadata(serverId);

  // Send saved metadata to the server (after 001 ready)
  // Only if server supports metadata
  if (serverSupportsMetadata(serverId)) {
    // First, subscribe to metadata updates
    const currentSubs =
      useStore.getState().metadataSubscriptions[serverId] || [];
    if (currentSubs.length === 0) {
      const defaultKeys = [
        "url",
        "website",
        "status",
        "location",
        "avatar",
        "color",
        "display-name",
        "bot",
      ];
      useStore.getState().metadataSub(serverId, defaultKeys);
    } else {
    }

    // Fetch our own metadata from the server first
    // This will update saved values with what the server has
    await fetchAndMergeOwnMetadata(serverId);

    // Now send any metadata we have saved (updated values after merge)
    const savedMetadata = loadSavedMetadata();
    const serverMetadata = savedMetadata[serverId];
    const ourNick = ircClient.getNick(serverId);

    if (serverMetadata && ourNick) {
      const ourMetadata = serverMetadata[ourNick];
      if (ourMetadata) {
        // Send our own metadata to the server
        Object.entries(ourMetadata).forEach(([key, { value, visibility }]) => {
          if (value !== undefined) {
            useStore
              .getState()
              .metadataSet(serverId, "*", key, value, visibility);
          }
        });
      }
    }
  } else {
  }

  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        return { ...server, name: serverName }; // Update the server name for display purposes
      }
      return server;
    });

    const ircCurrentUser = ircClient.getCurrentUser(serverId);
    let updatedCurrentUser = state.currentUser;

    if (ircCurrentUser) {
      // Get saved metadata for this user on this server
      const savedMetadata = loadSavedMetadata();
      const serverMetadata = savedMetadata[serverId];
      const userMetadata = serverMetadata?.[ircCurrentUser.username] || {};

      // Create current user with IRC data and any saved metadata
      updatedCurrentUser = {
        ...ircCurrentUser,
        metadata: {
          ...(state.currentUser?.metadata || {}),
          ...userMetadata,
        },
      };
    }

    return {
      servers: updatedServers,
      currentUser: updatedCurrentUser,
    };
  });

  const savedServers = loadSavedServers();
  const savedServer = savedServers.find((s) => s.id === serverId);

  if (savedServer) {
    // Get the saved channel order for this server
    const savedChannelOrder = useStore.getState().channelOrder[serverId];

    // If we have a saved order, use it to determine join sequence
    let channelsToJoin: string[] = savedServer.channels;

    if (savedChannelOrder && savedChannelOrder.length > 0) {
      // Map channel IDs to channel names using the saved order
      // Note: savedChannelOrder has IDs, but we need names for joining
      // We'll join in the order from savedServer.channels which should already be ordered
      channelsToJoin = savedServer.channels;
    }

    for (const channelName of channelsToJoin) {
      if (channelName) {
        useStore.getState().joinChannel(serverId, channelName);
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
  }
});

ircClient.on("PART", ({ serverId, username, channelName, reason }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
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
      }
      return server;
    });

    return { servers: updatedServers };
  });

  // Add part message if settings allow
  const state = useStore.getState();
  if (state.globalSettings.showEvents && state.globalSettings.showJoinsParts) {
    const server = state.servers.find((s) => s.id === serverId);
    if (server) {
      const channel = server.channels.find((c) => c.name === channelName);
      if (channel) {
        const partMessage: Message = {
          id: uuidv4(),
          type: "part",
          content: reason
            ? `left ${channelName} (${reason})`
            : `left ${channelName}`,
          timestamp: new Date(),
          userId: username,
          channelId: channel.id,
          serverId: serverId,
          reactions: [],
          replyMessage: null,
          mentioned: [],
        };

        const key = `${serverId}-${channel.id}`;
        useStore.setState((state) => ({
          messages: {
            ...state.messages,
            [key]: [...(state.messages[key] || []), partMessage],
          },
        }));
      }
    }
  }
});

ircClient.on("MODE", ({ serverId, sender, target, modestring, modeargs }) => {
  // Handle channel mode responses
  if (target.startsWith("#")) {
    // This is a channel mode change - let the protocol handler deal with it
    // The protocol handler will update the store with list changes
    // We still update the basic mode info for the channel
    useStore.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((channel) => {
            if (channel.name === target) {
              // Parse the modestring and modeargs to update channel modes
              // For now, we'll store the raw modestring
              return {
                ...channel,
                modes: modestring,
                modeArgs: modeargs,
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
  }
});

ircClient.on(
  "RPL_BANLIST",
  ({ serverId, channel, mask, setter, timestamp }) => {
    console.log(
      `RPL_BANLIST received: serverId=${serverId}, channel=${channel}, mask=${mask}, setter=${setter}, timestamp=${timestamp}`,
    );
    useStore.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((ch) => {
            if (ch.name === channel) {
              const bans = ch.bans || [];
              // Add the ban if it doesn't already exist
              if (!bans.some((ban) => ban.mask === mask)) {
                bans.push({ mask, setter, timestamp });
                console.log(`Added ban to channel ${channel}:`, {
                  mask,
                  setter,
                  timestamp,
                });
              } else {
                console.log(`Ban already exists for channel ${channel}:`, mask);
              }
              return { ...ch, bans };
            }
            return ch;
          });
          return { ...server, channels: updatedChannels };
        }
        return server;
      });
      return { servers: updatedServers };
    });
  },
);

ircClient.on(
  "RPL_INVITELIST",
  ({ serverId, channel, mask, setter, timestamp }) => {
    console.log(
      `RPL_INVITELIST received: serverId=${serverId}, channel=${channel}, mask=${mask}, setter=${setter}, timestamp=${timestamp}`,
    );
    useStore.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((ch) => {
            if (ch.name === channel) {
              const invites = ch.invites || [];
              // Add the invite if it doesn't already exist
              if (!invites.some((invite) => invite.mask === mask)) {
                invites.push({ mask, setter, timestamp });
                console.log(`Added invite to channel ${channel}:`, {
                  mask,
                  setter,
                  timestamp,
                });
              } else {
                console.log(
                  `Invite already exists for channel ${channel}:`,
                  mask,
                );
              }
              return { ...ch, invites };
            }
            return ch;
          });
          return { ...server, channels: updatedChannels };
        }
        return server;
      });
      return { servers: updatedServers };
    });
  },
);

ircClient.on(
  "RPL_EXCEPTLIST",
  ({ serverId, channel, mask, setter, timestamp }) => {
    console.log(
      `RPL_EXCEPTLIST received: serverId=${serverId}, channel=${channel}, mask=${mask}, setter=${setter}, timestamp=${timestamp}`,
    );
    useStore.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((ch) => {
            if (ch.name === channel) {
              const exceptions = ch.exceptions || [];
              // Add the exception if it doesn't already exist
              if (!exceptions.some((exception) => exception.mask === mask)) {
                exceptions.push({ mask, setter, timestamp });
                console.log(`Added exception to channel ${channel}:`, {
                  mask,
                  setter,
                  timestamp,
                });
              } else {
                console.log(
                  `Exception already exists for channel ${channel}:`,
                  mask,
                );
              }
              return { ...ch, exceptions };
            }
            return ch;
          });
          return { ...server, channels: updatedChannels };
        }
        return server;
      });
      return { servers: updatedServers };
    });
  },
);

ircClient.on("RPL_ENDOFBANLIST", ({ serverId, channel }) => {
  // Ban list loading is complete - could trigger UI updates if needed
  console.log(`Ban list loaded for ${channel} on server ${serverId}`);
});

ircClient.on("RPL_ENDOFINVITELIST", ({ serverId, channel }) => {
  // Invite list loading is complete - could trigger UI updates if needed
  console.log(`Invite list loaded for ${channel} on server ${serverId}`);
});

ircClient.on("RPL_ENDOFEXCEPTLIST", ({ serverId, channel }) => {
  // Exception list loading is complete - could trigger UI updates if needed
  console.log(`Exception list loaded for ${channel} on server ${serverId}`);
});

// Topic handlers
ircClient.on("TOPIC", ({ serverId, channelName, topic, sender }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        const updatedChannels = server.channels.map((channel) => {
          if (channel.name === channelName) {
            return { ...channel, topic };
          }
          return channel;
        });
        return { ...server, channels: updatedChannels };
      }
      return server;
    });
    return { servers: updatedServers };
  });

  // Optionally add a system message showing the topic change
  const server = useStore.getState().servers.find((s) => s.id === serverId);
  const channel = server?.channels.find((c) => c.name === channelName);
  if (channel) {
    const topicMessage: Message = {
      id: `topic-${Date.now()}`,
      channelId: channel.id,
      userId: sender,
      content: `changed the topic to: ${topic}`,
      timestamp: new Date(),
      serverId: serverId,
      reactions: [],
      type: "system",
      replyMessage: null,
      mentioned: [],
    };

    const key = `${serverId}-${channel.id}`;
    useStore.setState((state) => ({
      messages: {
        ...state.messages,
        [key]: [...(state.messages[key] || []), topicMessage],
      },
    }));
  }
});

ircClient.on("RPL_TOPIC", ({ serverId, channelName, topic }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        const updatedChannels = server.channels.map((channel) => {
          if (channel.name === channelName) {
            return { ...channel, topic };
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

ircClient.on(
  "RPL_TOPICWHOTIME",
  ({ serverId, channelName, setter, timestamp }) => {
    // This provides metadata about who set the topic and when
    // We could store this if we extend the Channel interface
    console.log(
      `Topic for ${channelName} was set by ${setter} at ${new Date(timestamp * 1000).toISOString()}`,
    );
  },
);

ircClient.on("RPL_NOTOPIC", ({ serverId, channelName }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        const updatedChannels = server.channels.map((channel) => {
          if (channel.name === channelName) {
            return { ...channel, topic: undefined };
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

// WHOIS event handlers
ircClient.on("WHOIS_USER", ({ serverId, nick, username, host, realname }) => {
  useStore.setState((state) => {
    const serverWhois = state.whoisData[serverId] || {};
    const existingData = serverWhois[nick] || {
      nick,
      specialMessages: [],
      timestamp: Date.now(),
    };

    return {
      whoisData: {
        ...state.whoisData,
        [serverId]: {
          ...serverWhois,
          [nick]: {
            ...existingData,
            username,
            host,
            realname,
            timestamp: Date.now(),
          },
        },
      },
    };
  });
});

ircClient.on("WHOIS_SERVER", ({ serverId, nick, server, serverInfo }) => {
  useStore.setState((state) => {
    const serverWhois = state.whoisData[serverId] || {};
    const existingData = serverWhois[nick] || {
      nick,
      specialMessages: [],
      timestamp: Date.now(),
    };

    return {
      whoisData: {
        ...state.whoisData,
        [serverId]: {
          ...serverWhois,
          [nick]: {
            ...existingData,
            server,
            serverInfo,
          },
        },
      },
    };
  });
});

ircClient.on("WHOIS_IDLE", ({ serverId, nick, idle, signon }) => {
  useStore.setState((state) => {
    const serverWhois = state.whoisData[serverId] || {};
    const existingData = serverWhois[nick] || {
      nick,
      specialMessages: [],
      timestamp: Date.now(),
    };

    return {
      whoisData: {
        ...state.whoisData,
        [serverId]: {
          ...serverWhois,
          [nick]: {
            ...existingData,
            idle,
            signon,
          },
        },
      },
    };
  });
});

ircClient.on("WHOIS_CHANNELS", ({ serverId, nick, channels }) => {
  useStore.setState((state) => {
    const serverWhois = state.whoisData[serverId] || {};
    const existingData = serverWhois[nick] || {
      nick,
      specialMessages: [],
      timestamp: Date.now(),
    };

    return {
      whoisData: {
        ...state.whoisData,
        [serverId]: {
          ...serverWhois,
          [nick]: {
            ...existingData,
            channels,
          },
        },
      },
    };
  });
});

ircClient.on("WHOIS_ACCOUNT", ({ serverId, nick, account }) => {
  useStore.setState((state) => {
    const serverWhois = state.whoisData[serverId] || {};
    const existingData = serverWhois[nick] || {
      nick,
      specialMessages: [],
      timestamp: Date.now(),
    };

    return {
      whoisData: {
        ...state.whoisData,
        [serverId]: {
          ...serverWhois,
          [nick]: {
            ...existingData,
            account,
          },
        },
      },
    };
  });
});

ircClient.on("WHOIS_SECURE", ({ serverId, nick, message }) => {
  useStore.setState((state) => {
    const serverWhois = state.whoisData[serverId] || {};
    const existingData = serverWhois[nick] || {
      nick,
      specialMessages: [],
      timestamp: Date.now(),
    };

    return {
      whoisData: {
        ...state.whoisData,
        [serverId]: {
          ...serverWhois,
          [nick]: {
            ...existingData,
            secureConnection: message,
          },
        },
      },
    };
  });
});

ircClient.on("WHOIS_SPECIAL", ({ serverId, nick, message }) => {
  useStore.setState((state) => {
    const serverWhois = state.whoisData[serverId] || {};
    const existingData = serverWhois[nick] || {
      nick,
      specialMessages: [],
      timestamp: Date.now(),
    };

    // Deduplicate special messages
    const updatedMessages = existingData.specialMessages.includes(message)
      ? existingData.specialMessages
      : [...existingData.specialMessages, message];

    return {
      whoisData: {
        ...state.whoisData,
        [serverId]: {
          ...serverWhois,
          [nick]: {
            ...existingData,
            specialMessages: updatedMessages,
          },
        },
      },
    };
  });
});

ircClient.on("WHOIS_END", ({ serverId, nick }) => {
  // Mark the whois data as complete
  console.log(`WHOIS completed for ${nick} on server ${serverId}`);

  useStore.setState((state) => {
    const serverWhois = state.whoisData[serverId] || {};
    const existingData = serverWhois[nick];

    if (existingData) {
      return {
        whoisData: {
          ...state.whoisData,
          [serverId]: {
            ...serverWhois,
            [nick]: {
              ...existingData,
              isComplete: true,
            },
          },
        },
      };
    }

    return state;
  });
});

ircClient.on("KICK", ({ serverId, username, target, channelName, reason }) => {
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

  // Add kick message if settings allow
  const state = useStore.getState();
  if (state.globalSettings.showEvents && state.globalSettings.showKicks) {
    const server = state.servers.find((s) => s.id === serverId);
    if (server) {
      const channel = server.channels.find((c) => c.name === channelName);
      if (channel) {
        const kickMessage: Message = {
          id: uuidv4(),
          type: "kick",
          content: reason
            ? `was kicked from ${channelName} by ${username} (${reason})`
            : `was kicked from ${channelName} by ${username}`,
          timestamp: new Date(),
          userId: target,
          channelId: channel.id,
          serverId: serverId,
          reactions: [],
          replyMessage: null,
          mentioned: [],
        };

        const key = `${serverId}-${channel.id}`;
        useStore.setState((state) => ({
          messages: {
            ...state.messages,
            [key]: [...(state.messages[key] || []), kickMessage],
          },
        }));
      }
    }
  }
});

ircClient.on("INVITE", ({ serverId, inviter, target, channel }) => {
  const state = useStore.getState();
  const server = state.servers.find((s) => s.id === serverId);
  if (!server) return;

  // Get current user's nickname to determine the active channel
  const currentUser = ircClient.getCurrentUser(serverId);
  if (!currentUser) return;

  // Determine where to show the invite message
  // Show in the currently selected channel/chat, or fallback to server's first channel
  let targetChannelId: string | null = null;
  let targetChannelName: string | null = null;

  // If we're on this server and have a selected channel, use that
  if (state.ui.selectedServerId === serverId) {
    if (state.ui.selectedChannelId) {
      const selectedChannel = server.channels.find(
        (c) => c.id === state.ui.selectedChannelId,
      );
      if (selectedChannel) {
        targetChannelId = selectedChannel.id;
        targetChannelName = selectedChannel.name;
      }
    } else if (state.ui.selectedPrivateChatId) {
      // For private chats, we'll show it there
      targetChannelId = state.ui.selectedPrivateChatId;
    }
  }

  // If no active channel, use the first channel on the server as fallback
  if (!targetChannelId && server.channels.length > 0) {
    targetChannelId = server.channels[0].id;
    targetChannelName = server.channels[0].name;
  }

  if (!targetChannelId) return;

  // Create the invite message
  const isForCurrentUser =
    target.toLowerCase() === currentUser.username.toLowerCase();
  const content = isForCurrentUser
    ? `${inviter} has invited you to join ${channel}`
    : `${inviter} has invited ${target} to join ${channel}`;

  const inviteMessage: Message = {
    id: uuidv4(),
    type: "invite",
    content,
    timestamp: new Date(),
    userId: inviter,
    channelId: targetChannelId,
    serverId: serverId,
    reactions: [],
    replyMessage: null,
    mentioned: [],
    inviteChannel: channel,
    inviteTarget: target,
  };

  const key = `${serverId}-${targetChannelId}`;
  useStore.setState((state) => ({
    messages: {
      ...state.messages,
      [key]: [...(state.messages[key] || []), inviteMessage],
    },
  }));
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
  ircClient.userOnConnect(serverId);
});

// Handle CAP LS to get informational capabilities like unrealircd.org/link-security
ircClient.on("CAP LS", ({ serverId, cliCaps }) => {
  // Parse link-security from CAP LS (informational capability)
  if (cliCaps.includes("unrealircd.org/link-security=")) {
    const match = cliCaps.match(/unrealircd\.org\/link-security=(\d+)/);
    if (match) {
      const linkSecurityValue = Number.parseInt(match[1], 10) || 0;

      // Update server with link security value
      useStore.setState((state) => {
        const updatedServers = state.servers.map((server) => {
          if (server.id === serverId) {
            return {
              ...server,
              linkSecurity: linkSecurityValue,
            };
          }
          return server;
        });
        return { servers: updatedServers };
      });

      // Check for insecure connection and show warning modal
      const currentState = useStore.getState();
      const currentServer = currentState.servers.find((s) => s.id === serverId);
      const isLocalhost =
        currentServer &&
        (currentServer.host === "localhost" ||
          currentServer.host === "127.0.0.1");
      const hasLowLinkSecurity = linkSecurityValue < 2;

      // Check if we should show warning based on individual skip preferences
      const savedServers = loadSavedServers();
      const serverConfig = currentServer
        ? savedServers.find(
            (s) =>
              s.host === currentServer.host && s.port === currentServer.port,
          )
        : undefined;

      const shouldWarnLocalhost =
        isLocalhost && !serverConfig?.skipLocalhostWarning;
      const shouldWarnLinkSecurity =
        hasLowLinkSecurity && !serverConfig?.skipLinkSecurityWarning;

      if (shouldWarnLocalhost || shouldWarnLinkSecurity) {
        useStore.setState((state) => ({
          ui: {
            ...state.ui,
            linkSecurityWarnings: [
              ...state.ui.linkSecurityWarnings,
              { serverId, timestamp: Date.now() },
            ],
          },
        }));
      }
    }
  }
});

ircClient.on("CAP ACK", ({ serverId, cliCaps }) => {
  const caps = cliCaps.split(" ");

  for (const cap of caps) {
    const tok = cap.split("=");
    const capName = tok[0];
    const capValue = tok[1];

    ircClient.capAck(serverId, capName, capValue ?? null);
  }

  // Update server capabilities in store
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        return {
          ...server,
          capabilities: cliCaps.split(" "),
        };
      }
      return server;
    });
    return { servers: updatedServers };
  });

  // Check if we should prevent CAP END (for SASL, account registration, or link security warning)
  const state = useStore.getState();
  const server = state.servers.find((s) => s.id === serverId);
  let preventCapEnd = false;

  // Check if SASL was requested and acknowledged, AND we have credentials
  if (caps.some((cap) => cap.startsWith("sasl"))) {
    // Only prevent CAP END if we actually have SASL credentials
    const servers = loadSavedServers();
    const savedServer = servers.find((s) => s.id === serverId);
    if (
      savedServer?.saslEnabled &&
      savedServer?.saslAccountName &&
      savedServer?.saslPassword
    ) {
      preventCapEnd = true;
    }
  }

  // Check if there's pending account registration
  const pendingReg = state.pendingRegistration;
  if (pendingReg && pendingReg.serverId === serverId) {
    preventCapEnd = true;
    // Check if server supports account registration
    if (server?.capabilities?.includes("draft/account-registration")) {
      useStore
        .getState()
        .registerAccount(
          serverId,
          pendingReg.account,
          pendingReg.email,
          pendingReg.password,
        );
      // Clear the pending registration
      useStore.setState({ pendingRegistration: null });
    } else {
      // Clear the pending registration
      useStore.setState({ pendingRegistration: null });
      // Send CAP END since registration is not possible
      preventCapEnd = false;
    }
  }

  // Check if link security warning modal is showing - prevent CAP END until user responds
  if (state.ui.linkSecurityWarnings.some((w) => w.serverId === serverId)) {
    preventCapEnd = true;
  }

  if (!preventCapEnd) {
    ircClient.sendRaw(serverId, "CAP END");
    ircClient.userOnConnect(serverId);
  } else {
  }
});

ircClient.on("LIST_CHANNEL", ({ serverId, channel, userCount, topic }) => {
  useStore.setState((state) => {
    if (!state.listingInProgress[serverId]) {
      // Not currently listing, ignore
      return {};
    }
    const currentList = state.channelList[serverId] || [];
    const updatedList = [...currentList, { channel, userCount, topic }];
    return {
      channelList: {
        ...state.channelList,
        [serverId]: updatedList,
      },
    };
  });
});

ircClient.on("LIST_END", ({ serverId }) => {
  // Set listing as complete
  useStore.setState((state) => ({
    listingInProgress: {
      ...state.listingInProgress,
      [serverId]: false,
    },
  }));
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

  // Check if the sender is not the current user for this specific server
  // we don't care about showing our own typing status
  const currentUser = ircClient.getCurrentUser(response.serverId);
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

  // Handle link previews
  if (
    mtags &&
    (mtags["obsidianirc/link-preview-title"] ||
      mtags["obsidianirc/link-preview-snippet"] ||
      mtags["obsidianirc/link-preview-meta"]) &&
    mtags["+reply"]
  ) {
    const replyMessageId = mtags["+reply"];

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

    // Find the message to add link preview to
    const messages = getChannelMessages(server.id, channel.id);
    const messageIndex = messages.findIndex((m) => m.msgid === replyMessageId);
    if (messageIndex === -1) return;

    const message = messages[messageIndex];

    // Helper function to unescape IRC tag values
    const unescapeTagValue = (
      value: string | undefined,
    ): string | undefined => {
      if (!value) return undefined;
      // IRC tag escaping: \: = ; \s = space \\ = \ \r = CR \n = LF
      return value
        .replace(/\\s/g, " ")
        .replace(/\\:/g, ";")
        .replace(/\\r/g, "\r")
        .replace(/\\n/g, "\n")
        .replace(/\\\\/g, "\\");
    };

    useStore.setState((state) => {
      const updatedMessages = [...messages];
      updatedMessages[messageIndex] = {
        ...message,
        linkPreviewTitle: unescapeTagValue(
          mtags["obsidianirc/link-preview-title"],
        ),
        linkPreviewSnippet: unescapeTagValue(
          mtags["obsidianirc/link-preview-snippet"],
        ),
        linkPreviewMeta: unescapeTagValue(
          mtags["obsidianirc/link-preview-meta"],
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
});

ircClient.on("REDACT", ({ serverId, target, msgid, sender }) => {
  useStore.setState((state) => {
    const server = state.servers.find((s) => s.id === serverId);
    if (!server) return {};

    let channel: Channel | PrivateChat | undefined;
    const isChannel = target.startsWith("#");
    if (isChannel) {
      channel = server.channels.find((c) => c.name === target);
    } else {
      // Private chat
      channel = server.privateChats?.find((pc) => pc.username === target);
    }

    if (!channel) return {};

    // Find and replace the message with a system message
    const messages = getChannelMessages(server.id, channel.id);
    const messageIndex = messages.findIndex((m) => m.msgid === msgid);
    if (messageIndex === -1) return {};

    const updatedMessages = [...messages];
    const originalMessage = updatedMessages[messageIndex];

    // Determine if the sender deleted their own message
    const isSender = originalMessage.userId === sender;
    const deletionMessage = isSender
      ? "This message has been deleted by the sender"
      : "This message has been deleted by a member of staff";

    // Replace the entire message with a system message
    updatedMessages[messageIndex] = {
      id: originalMessage.id,
      msgid: originalMessage.msgid,
      content: deletionMessage,
      timestamp: originalMessage.timestamp,
      userId: "system",
      channelId: originalMessage.channelId,
      serverId: originalMessage.serverId,
      type: "system",
      reactions: [],
      replyMessage: null,
      mentioned: [],
      tags: originalMessage.tags,
    };

    const key = `${server.id}-${channel.id}`;
    return {
      messages: {
        ...state.messages,
        [key]: updatedMessages,
      },
    };
  });
});

// Nick error event handler
ircClient.on("NICK_ERROR", ({ serverId, code, error, nick, message }) => {
  // Handle 433 (nickname already in use) with automatic retry
  if (code === "433" && nick) {
    const newNick = `${nick}_`;

    // Attempt to change to the nick with underscore appended
    ircClient.changeNick(serverId, newNick);

    // Add a system message about the retry
    const state = useStore.getState();
    const server = state.servers.find((s) => s.id === serverId);
    if (server && state.ui.selectedChannelId) {
      const channel = server.channels.find(
        (c) => c.id === state.ui.selectedChannelId,
      );
      if (channel) {
        const retryMessage: Message = {
          id: uuidv4(),
          type: "system",
          content: `Nickname '${nick}' already in use, retrying with '${newNick}'`,
          timestamp: new Date(),
          userId: "system",
          channelId: channel.id,
          serverId: serverId,
          reactions: [],
          replyMessage: null,
          mentioned: [],
        };

        const key = `${serverId}-${channel.id}`;
        useStore.setState((state) => ({
          messages: {
            ...state.messages,
            [key]: [...(state.messages[key] || []), retryMessage],
          },
        }));
      }
    }

    // Don't show error notification for 433 since we're auto-retrying
    return;
  }

  // Add to global notifications for visibility (for other error codes)
  const state = useStore.getState();
  state.addGlobalNotification({
    type: "fail",
    command: "NICK",
    code,
    message: `${error}: ${message}`,
    target: nick,
    serverId,
  });

  // Also add a system message to the current channel
  const server = state.servers.find((s) => s.id === serverId);
  if (server && state.ui.selectedChannelId) {
    const channel = server.channels.find(
      (c) => c.id === state.ui.selectedChannelId,
    );
    if (channel) {
      const errorMessage: Message = {
        id: uuidv4(),
        type: "system",
        content: `Nick change failed: ${error} ${nick ? `(${nick})` : ""}`,
        timestamp: new Date(),
        userId: "system",
        channelId: channel.id,
        serverId: serverId,
        reactions: [],
        replyMessage: null,
        mentioned: [],
      };

      const key = `${serverId}-${channel.id}`;
      useStore.setState((state) => ({
        messages: {
          ...state.messages,
          [key]: [...(state.messages[key] || []), errorMessage],
        },
      }));
    }
  }
});

// Standard reply event handlers
ircClient.on("FAIL", ({ serverId, command, code, target, message }) => {
  // Add to global notifications for visibility
  const state = useStore.getState();
  state.addGlobalNotification({
    type: "fail",
    command,
    code,
    message,
    target,
    serverId,
  });
});

ircClient.on("WARN", ({ serverId, command, code, target, message }) => {
  const state = useStore.getState();
  const server = state.servers.find((s) => s.id === serverId);
  if (server) {
    // Try to add to the currently selected channel first, fallback to first channel
    let channel = server.channels.find(
      (c) => c.id === state.ui.selectedChannelId,
    );
    if (!channel) {
      channel = server.channels[0];
    }
    if (channel) {
      const notificationMessage: Message = {
        id: uuidv4(),
        type: "standard-reply",
        content: `WARN ${command} ${code}${target ? ` ${target}` : ""}: ${message}`,
        timestamp: new Date(),
        userId: "system",
        channelId: channel.id,
        serverId: serverId,
        reactions: [],
        replyMessage: null,
        mentioned: [],
        standardReplyType: "WARN",
        standardReplyCommand: command,
        standardReplyCode: code,
        standardReplyTarget: target,
        standardReplyMessage: message,
      };

      const key = `${serverId}-${channel.id}`;
      useStore.setState((state) => ({
        messages: {
          ...state.messages,
          [key]: [...(state.messages[key] || []), notificationMessage],
        },
      }));
    }
  }
});

ircClient.on("NOTE", ({ serverId, command, code, target, message }) => {
  const state = useStore.getState();
  const server = state.servers.find((s) => s.id === serverId);
  if (server) {
    // Try to add to the currently selected channel first, fallback to first channel
    let channel = server.channels.find(
      (c) => c.id === state.ui.selectedChannelId,
    );
    if (!channel) {
      channel = server.channels[0];
    }
    if (channel) {
      const notificationMessage: Message = {
        id: uuidv4(),
        type: "standard-reply",
        content: `NOTE ${command} ${code}${target ? ` ${target}` : ""}: ${message}`,
        timestamp: new Date(),
        userId: "system",
        channelId: channel.id,
        serverId: serverId,
        reactions: [],
        replyMessage: null,
        mentioned: [],
        standardReplyType: "NOTE",
        standardReplyCommand: command,
        standardReplyCode: code,
        standardReplyTarget: target,
        standardReplyMessage: message,
      };

      const key = `${serverId}-${channel.id}`;
      useStore.setState((state) => ({
        messages: {
          ...state.messages,
          [key]: [...(state.messages[key] || []), notificationMessage],
        },
      }));
    }
  }
});

// Account registration event handlers
ircClient.on("REGISTER_SUCCESS", ({ serverId, account, message }) => {
  const state = useStore.getState();
  const server = state.servers.find((s) => s.id === serverId);
  if (server) {
    const channel = server.channels[0];
    if (channel) {
      const notificationMessage: Message = {
        id: uuidv4(),
        type: "system",
        content: `Account registration successful for ${account}: ${message}`,
        timestamp: new Date(),
        userId: "system",
        channelId: channel.id,
        serverId: serverId,
        reactions: [],
        replyMessage: null,
        mentioned: [],
      };

      const key = `${serverId}-${channel.id}`;
      useStore.setState((state) => ({
        messages: {
          ...state.messages,
          [key]: [...(state.messages[key] || []), notificationMessage],
        },
      }));
    }
  }
});

ircClient.on(
  "REGISTER_VERIFICATION_REQUIRED",
  ({ serverId, account, message }) => {
    const state = useStore.getState();
    const server = state.servers.find((s) => s.id === serverId);
    if (server) {
      const channel = server.channels[0];
      if (channel) {
        const notificationMessage: Message = {
          id: uuidv4(),
          type: "system",
          content: `Account registration for ${account} requires verification: ${message}`,
          timestamp: new Date(),
          userId: "system",
          channelId: channel.id,
          serverId: serverId,
          reactions: [],
          replyMessage: null,
          mentioned: [],
        };

        const key = `${serverId}-${channel.id}`;
        useStore.setState((state) => ({
          messages: {
            ...state.messages,
            [key]: [...(state.messages[key] || []), notificationMessage],
          },
        }));
      }
    }
  },
);

ircClient.on("VERIFY_SUCCESS", ({ serverId, account, message }) => {
  const state = useStore.getState();
  const server = state.servers.find((s) => s.id === serverId);
  if (server) {
    const channel = server.channels[0];
    if (channel) {
      const notificationMessage: Message = {
        id: uuidv4(),
        type: "system",
        content: `Account verification successful for ${account}: ${message}`,
        timestamp: new Date(),
        userId: "system",
        channelId: channel.id,
        serverId: serverId,
        reactions: [],
        replyMessage: null,
        mentioned: [],
      };

      const key = `${serverId}-${channel.id}`;
      useStore.setState((state) => ({
        messages: {
          ...state.messages,
          [key]: [...(state.messages[key] || []), notificationMessage],
        },
      }));
    }
  }
});

// Metadata event handlers
ircClient.on("METADATA", ({ serverId, target, key, visibility, value }) => {
  useStore.setState((state) => {
    // Resolve the target - if it's "*", it refers to the current user
    const serverCurrentUser = ircClient.getCurrentUser(serverId);
    const resolvedTarget =
      target === "*"
        ? ircClient.getNick(serverId) || serverCurrentUser?.username || target
        : target;

    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        // Update metadata for users in channels
        const updatedChannels = server.channels.map((channel) => {
          const updatedUsers = channel.users.map((user) => {
            if (user.username === resolvedTarget) {
              const metadata = { ...(user.metadata || {}) };
              if (value) {
                metadata[key] = { value, visibility };
              } else {
                delete metadata[key];
              }
              console.log(
                `[METADATA] Updated user ${resolvedTarget} in channel ${channel.name} with ${key}=${value}`,
              );
              return { ...user, metadata };
            }
            return user;
          });

          // Update metadata for the channel itself if target matches channel name
          const channelMetadata = { ...(channel.metadata || {}) };
          if (resolvedTarget === channel.name) {
            if (value) {
              channelMetadata[key] = { value, visibility };
            } else {
              delete channelMetadata[key];
            }
          }

          return { ...channel, users: updatedUsers, metadata: channelMetadata };
        });

        // Update metadata for the server itself if target is server
        const updatedMetadata = { ...(server.metadata || {}) };
        if (resolvedTarget === server.name) {
          if (value) {
            updatedMetadata[key] = { value, visibility };
          } else {
            delete updatedMetadata[key];
          }
        }

        return {
          ...server,
          channels: updatedChannels,
          metadata: updatedMetadata,
        };
      }
      return server;
    });

    // Update current user metadata if the target matches any connected user
    let updatedCurrentUser = state.currentUser;
    const currentUserForServer = ircClient.getCurrentUser(serverId);

    // Check if this metadata is for the current user on this server
    if (
      currentUserForServer &&
      currentUserForServer.username === resolvedTarget
    ) {
      // If this is the first time setting current user or it's for the selected server, update global state
      if (!updatedCurrentUser || state.ui.selectedServerId === serverId) {
        const metadata = { ...(currentUserForServer.metadata || {}) };
        if (value) {
          metadata[key] = { value, visibility };
        } else {
          delete metadata[key];
        }
        updatedCurrentUser = { ...currentUserForServer, metadata };
      }
      // If there's already a current user but it's for a different server,
      // still update if this is the selected server or if there's no current user
      else if (
        state.currentUser &&
        state.currentUser.username === resolvedTarget
      ) {
        const metadata = { ...(state.currentUser.metadata || {}) };
        if (value) {
          metadata[key] = { value, visibility };
        } else {
          delete metadata[key];
        }
        updatedCurrentUser = { ...state.currentUser, metadata };
      }
    }

    // Save metadata to localStorage
    const savedMetadata = loadSavedMetadata();
    if (!savedMetadata[serverId]) {
      savedMetadata[serverId] = {};
    }
    if (!savedMetadata[serverId][resolvedTarget]) {
      savedMetadata[serverId][resolvedTarget] = {};
    }
    if (value) {
      savedMetadata[serverId][resolvedTarget][key] = { value, visibility };
    } else {
      delete savedMetadata[serverId][resolvedTarget][key];
    }
    saveMetadataToLocalStorage(savedMetadata);

    // Update channel metadata cache if this is for a channel
    if (resolvedTarget.startsWith("#")) {
      const cache = state.channelMetadataCache[serverId] || {};
      const channelCache = cache[resolvedTarget] || { fetchedAt: Date.now() };

      if (key === "avatar") {
        channelCache.avatar = value || undefined;
      } else if (key === "display-name") {
        channelCache.displayName = value || undefined;
      }

      channelCache.fetchedAt = Date.now();

      const updatedCache = {
        ...state.channelMetadataCache,
        [serverId]: {
          ...cache,
          [resolvedTarget]: channelCache,
        },
      };

      // Remove from fetch queue
      const queue = state.channelMetadataFetchQueue[serverId];
      if (queue) {
        const newQueue = new Set(queue);
        newQueue.delete(resolvedTarget);

        return {
          servers: updatedServers,
          currentUser: updatedCurrentUser,
          channelMetadataCache: updatedCache,
          channelMetadataFetchQueue: {
            ...state.channelMetadataFetchQueue,
            [serverId]: newQueue,
          },
        };
      }

      return {
        servers: updatedServers,
        currentUser: updatedCurrentUser,
        channelMetadataCache: updatedCache,
      };
    }

    return { servers: updatedServers, currentUser: updatedCurrentUser };
  });
});

ircClient.on(
  "METADATA_KEYVALUE",
  ({ serverId, target, key, visibility, value }) => {
    const state = useStore.getState();
    const isFetchingOwn = state.metadataFetchInProgress[serverId];

    // Handle individual key-value responses (similar to METADATA)
    useStore.setState((state) => {
      // Resolve the target - if it's "*", it refers to the current user
      const resolvedTarget =
        target === "*"
          ? ircClient.getNick(serverId) || state.currentUser?.username || target
          : target;

      // If we're fetching our own metadata, update saved values
      if (isFetchingOwn && target === "*") {
        const savedMetadata = loadSavedMetadata();
        if (!savedMetadata[serverId]) {
          savedMetadata[serverId] = {};
        }
        if (!savedMetadata[serverId][resolvedTarget]) {
          savedMetadata[serverId][resolvedTarget] = {};
        }
        // Only overwrite saved value with server value if server actually has a value
        // Empty/null values from server mean "not set", so keep our local value
        if (value !== null && value !== undefined && value !== "") {
          savedMetadata[serverId][resolvedTarget][key] = { value, visibility };
          saveMetadataToLocalStorage(savedMetadata);
        }
        // If server has the key but no value, and we have a local value, we'll send ours later
      }

      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          // Update metadata for users in channels
          const updatedChannels = server.channels.map((channel) => {
            const userInChannel = channel.users.find(
              (u) => u.username === resolvedTarget,
            );
            if (userInChannel) {
            }

            const updatedUsers = channel.users.map((user) => {
              if (user.username === resolvedTarget) {
                const metadata = { ...(user.metadata || {}) };
                // Only update metadata if value is present (not empty/null)
                // This prevents server empty responses from clearing local values
                if (value !== null && value !== undefined && value !== "") {
                  metadata[key] = { value, visibility };
                } else {
                  // If server sends empty/null, remove the key (it's not set on server)
                  // But only if we're not in fetch mode - during fetch, keep local values
                  if (!isFetchingOwn || target !== "*") {
                    delete metadata[key];
                  }
                }
                return { ...user, metadata };
              }
              return user;
            });

            // Update metadata for the channel itself if target matches channel name
            let updatedChannelMetadata = channel.metadata || {};
            if (resolvedTarget === channel.name) {
              // Only update THIS channel's metadata if the target matches exactly
              updatedChannelMetadata = { ...updatedChannelMetadata };
              if (value !== null && value !== undefined && value !== "") {
                updatedChannelMetadata[key] = { value, visibility };
              } else {
                delete updatedChannelMetadata[key];
              }
            }

            return {
              ...channel,
              users: updatedUsers,
              metadata: updatedChannelMetadata,
            };
          });

          return {
            ...server,
            channels: updatedChannels,
          };
        }
        return server;
      });

      // Update current user metadata
      let updatedCurrentUser = state.currentUser;
      if (state.currentUser?.username === resolvedTarget) {
        const metadata = { ...(state.currentUser.metadata || {}) };
        // Only update metadata if value is present (not empty/null)
        // This prevents server empty responses from clearing local values
        if (value !== null && value !== undefined && value !== "") {
          metadata[key] = { value, visibility };
        } else {
          // If server sends empty/null, remove the key (it's not set on server)
          // But only if we're not in fetch mode - during fetch, keep local values
          if (!isFetchingOwn || target !== "*") {
            delete metadata[key];
          }
        }
        updatedCurrentUser = { ...state.currentUser, metadata };
        console.log(
          `[METADATA_KEYVALUE] Updated current user ${resolvedTarget} with ${key}=${value}`,
        );
      }

      // Save metadata to localStorage (unless we're in fetch mode - already saved above)
      if (!isFetchingOwn || target !== "*") {
        const savedMetadata = loadSavedMetadata();
        if (!savedMetadata[serverId]) {
          savedMetadata[serverId] = {};
        }
        if (!savedMetadata[serverId][resolvedTarget]) {
          savedMetadata[serverId][resolvedTarget] = {};
        }
        savedMetadata[serverId][resolvedTarget][key] = { value, visibility };
        saveMetadataToLocalStorage(savedMetadata);
      }

      // Update channel metadata cache if this is for a channel
      if (resolvedTarget.startsWith("#")) {
        const cache = state.channelMetadataCache[serverId] || {};
        const channelCache = cache[resolvedTarget] || { fetchedAt: Date.now() };

        if (key === "avatar" && value) {
          channelCache.avatar = value;
        } else if (key === "display-name" && value) {
          channelCache.displayName = value;
        }

        channelCache.fetchedAt = Date.now();

        const updatedCache = {
          ...state.channelMetadataCache,
          [serverId]: {
            ...cache,
            [resolvedTarget]: channelCache,
          },
        };

        // Remove from fetch queue
        const queue = state.channelMetadataFetchQueue[serverId];
        if (queue) {
          const newQueue = new Set(queue);
          newQueue.delete(resolvedTarget);

          return {
            servers: updatedServers,
            currentUser: updatedCurrentUser,
            channelMetadataCache: updatedCache,
            channelMetadataFetchQueue: {
              ...state.channelMetadataFetchQueue,
              [serverId]: newQueue,
            },
          };
        }

        return {
          servers: updatedServers,
          currentUser: updatedCurrentUser,
          channelMetadataCache: updatedCache,
        };
      }

      return { servers: updatedServers, currentUser: updatedCurrentUser };
    });
  },
);

ircClient.on("METADATA_KEYNOTSET", ({ serverId, target, key }) => {
  const state = useStore.getState();
  const isFetchingOwn = state.metadataFetchInProgress[serverId];

  // Resolve the target - if it's "*", it refers to the current user
  const resolvedTarget =
    target === "*"
      ? ircClient.getNick(serverId) || state.currentUser?.username || target
      : target;

  // If we're fetching our own metadata and the key is not set, delete it from saved values
  if (isFetchingOwn && target === "*") {
    const savedMetadata = loadSavedMetadata();
    if (savedMetadata[serverId]?.[resolvedTarget]?.[key]) {
      delete savedMetadata[serverId][resolvedTarget][key];
      saveMetadataToLocalStorage(savedMetadata);
    }
  }

  // Handle key not set responses
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        // Remove metadata for users in channels
        const updatedChannels = server.channels.map((channel) => {
          const updatedUsers = channel.users.map((user) => {
            if (user.username === resolvedTarget) {
              const metadata = user.metadata || {};
              delete metadata[key];
              return { ...user, metadata };
            }
            return user;
          });

          // Remove metadata for the channel itself if target matches channel name
          const channelMetadata = channel.metadata || {};
          if (
            resolvedTarget === channel.name ||
            resolvedTarget.startsWith("#")
          ) {
            delete channelMetadata[key];
          }

          return { ...channel, users: updatedUsers, metadata: channelMetadata };
        });
        return { ...server, channels: updatedChannels };
      }
      return server;
    });

    return { servers: updatedServers };
  });
});

ircClient.on("METADATA_SUBOK", ({ serverId, keys }) => {
  console.log(
    `[METADATA_SUBOK] Successfully subscribed to keys for server ${serverId}:`,
    keys,
  );
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
  console.log(
    `[CAP_ACKNOWLEDGED] Server ${serverId} acknowledged capability: ${key} (${capabilities})`,
  );
  if (capabilities?.startsWith("draft/metadata")) {
    // Check if already subscribed to avoid duplicate subscriptions
    const currentSubs =
      useStore.getState().metadataSubscriptions[serverId] || [];
    console.log(
      `[CAP_ACKNOWLEDGED] Current metadata subscriptions for server ${serverId}:`,
      currentSubs,
    );
    if (currentSubs.length === 0) {
      // Subscribe to common metadata keys
      const defaultKeys = [
        "url",
        "website",
        "status",
        "location",
        "avatar",
        "color",
        "display-name",
        "bot", // Subscribe to bot metadata for tooltip information
      ];
      console.log(
        "[CAP_ACKNOWLEDGED] Attempting to subscribe to default metadata keys:",
        defaultKeys,
      );
      useStore.getState().metadataSub(serverId, defaultKeys);
    }

    // Note: Metadata restoration/sending is now handled in the "ready" event
    // to ensure the server is ready to receive METADATA commands
  }
});

ircClient.on(
  "METADATA_FAIL",
  ({ serverId, subcommand, code, target, key, retryAfter }) => {
    // Handle metadata failures
    console.error(`Metadata ${subcommand} failed: ${code}`, {
      target,
      key,
      retryAfter,
    });
    // Could show user notifications here
  },
);

// Load saved servers on store initialization

// If default server is available, select it
if (__DEFAULT_IRC_SERVER__) {
}

ircClient.on("RENAME", ({ serverId, oldName, newName, reason, user }) => {
  useStore.setState((state) => {
    const server = state.servers.find((s) => s.id === serverId);
    if (!server) return {};

    const channel = server.channels.find((c) => c.name === oldName);
    if (!channel) return {};

    channel.name = newName;

    const renameMessage: Message = {
      id: `rename-${Date.now()}`,
      content: `Channel has been renamed from ${oldName} to ${newName} by ${user}${reason ? ` (${reason})` : ""}`,
      timestamp: new Date(),
      userId: "system",
      channelId: channel.id,
      serverId,
      type: "system",
      reactions: [],
      replyMessage: null,
      mentioned: [],
    };

    const channelKey = `${serverId}-${channel.id}`;
    const currentMessages = state.messages[channelKey] || [];
    return {
      messages: {
        ...state.messages,
        [channelKey]: [...currentMessages, renameMessage],
      },
    };
  });
});

ircClient.on("SETNAME", ({ serverId, user, realname }) => {
  useStore.setState((state) => {
    const server = state.servers.find((s) => s.id === serverId);
    if (!server) return {};

    // Update current user if it's us
    if (user === state.currentUser?.username) {
      return {
        currentUser: {
          ...state.currentUser,
          displayName: realname,
        },
      };
    }

    // Update in channels
    const updatedServers = state.servers.map((s) => {
      if (s.id === serverId) {
        const updatedChannels = s.channels.map((c) => ({
          ...c,
          users: c.users.map((u) =>
            u.username === user ? { ...u, displayName: realname } : u,
          ),
        }));
        return { ...s, channels: updatedChannels };
      }
      return s;
    });

    return { servers: updatedServers };
  });
});

ircClient.on(
  "WHO_REPLY",
  ({
    serverId,
    channel,
    username,
    host,
    server,
    nick,
    flags,
    hopcount,
    realname,
  }) => {
    const state = useStore.getState();
    const serverData = state.servers.find((s) => s.id === serverId);
    if (!serverData) return;

    // Find the channel this WHO reply belongs to
    const channelData = serverData.channels.find((c) => c.name === channel);
    if (!channelData) {
      return;
    }

    // Parse channel status from flags (e.g., "H@" means here and operator)
    let channelStatus = "";
    let isAway = false;

    if (flags) {
      // First character indicates here (H) or gone/away (G)
      if (flags[0] === "G") {
        isAway = true;
      } else if (flags[0] === "H") {
        isAway = false;
      }

      // Extract channel status prefixes from flags
      const statusChars = flags.match(/[~&@%+]/g);
      if (statusChars) {
        channelStatus = statusChars.join("");
      }
    }

    // Create user object from WHO data with proper User type
    const user: User = {
      id: nick,
      username: nick,
      hostname: host, // Store the hostname from WHO reply
      avatar: undefined,
      isOnline: true,
      isAway: isAway,
      isBot: false,
      status: channelStatus, // Set the channel status here
      metadata: {},
    };

    // Check for bot flags if bot mode is enabled
    if (serverData.botMode) {
      const botFlag = serverData.botMode;
      const isBot = flags.includes(botFlag);

      if (isBot) {
        user.isBot = true;
        user.metadata = {
          bot: { value: "true", visibility: "public" },
        };
      }
    }

    // Load saved metadata for this user from localStorage
    const savedMetadata = loadSavedMetadata();
    if (savedMetadata[serverId]?.[nick]) {
      user.metadata = {
        ...user.metadata,
        ...savedMetadata[serverId][nick],
      };
    }

    // Update the channel's user list with this user
    useStore.setState((state) => {
      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          const updatedChannels = s.channels.map((ch) => {
            if (ch.name === channel) {
              // Check if user already exists in the list
              const existingUserIndex = ch.users.findIndex(
                (u) => u.username === nick,
              );

              if (existingUserIndex !== -1) {
                // Update existing user
                const updatedUsers = [...ch.users];
                updatedUsers[existingUserIndex] = {
                  ...updatedUsers[existingUserIndex],
                  ...user,
                  metadata: {
                    ...updatedUsers[existingUserIndex].metadata,
                    ...user.metadata,
                  },
                };
                return { ...ch, users: updatedUsers };
              }
              // Add new user
              return { ...ch, users: [...ch.users, user] };
            }
            return ch;
          });

          return { ...s, channels: updatedChannels };
        }
        return s;
      });

      return { servers: updatedServers };
    });
  },
);

ircClient.on("WHO_END", ({ serverId, mask }) => {
  // When WHO list is complete for a channel, request metadata for all users
  // This ensures we get current metadata for users who were already in the channel
  const state = useStore.getState();
  const serverData = state.servers.find((s) => s.id === serverId);
  if (!serverData) return;

  // Find the channel (mask should be the channel name)
  const channelData = serverData.channels.find((c) => c.name === mask);
  if (!channelData) return;

  // Only request metadata if server supports it
  if (serverSupportsMetadata(serverId)) {
    // Request metadata for all users in the channel
    channelData.users.forEach((user) => {
      // Only request if we don't already have metadata for this user
      const hasMetadata =
        user.metadata && Object.keys(user.metadata).length > 0;
      if (!hasMetadata) {
        setTimeout(() => {
          useStore.getState().metadataList(serverId, user.username);
        }, Math.random() * 1000); // Stagger requests to avoid spam
      }
    });
  }
});

ircClient.on("WHOIS_BOT", ({ serverId, target }) => {
  // Update user objects in channels
  useStore.setState((state) => {
    const updatedServers = state.servers.map((s) => {
      if (s.id === serverId) {
        const updatedChannels = s.channels.map((channel) => {
          const updatedUsers = channel.users.map((user) => {
            if (user.username === target) {
              return {
                ...user,
                isBot: true, // Set the WHOIS-detected bot flag
                metadata: {
                  ...user.metadata,
                  // Keep bot metadata if it exists, but don't require it for display
                  bot: user.metadata?.bot || {
                    value: "true",
                    visibility: "public",
                  },
                },
              };
            }
            return user;
          });
          return { ...channel, users: updatedUsers };
        });
        return { ...s, channels: updatedChannels };
      }
      return s;
    });
    return { servers: updatedServers };
  });
});

// AWAY event handler for away-notify extension
ircClient.on("AWAY", ({ serverId, username, awayMessage }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((s) => {
      if (s.id === serverId) {
        // Update user in all channels they're in
        const updatedChannels = s.channels.map((channel) => {
          const updatedUsers = channel.users.map((user) => {
            if (user.username === username) {
              return {
                ...user,
                isAway: !!awayMessage,
                awayMessage: awayMessage || undefined,
              };
            }
            return user;
          });
          return { ...channel, users: updatedUsers };
        });
        return { ...s, channels: updatedChannels };
      }
      return s;
    });

    // Update current user if this is us
    let updatedCurrentUser = state.currentUser;
    if (state.currentUser?.username === username) {
      updatedCurrentUser = {
        ...state.currentUser,
        isAway: !!awayMessage,
        awayMessage: awayMessage || undefined,
      };
    }

    return { servers: updatedServers, currentUser: updatedCurrentUser };
  });
});

// Handle CHGHOST - update user hostname when it changes
ircClient.on("CHGHOST", ({ serverId, username, newUser, newHost }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((s) => {
      if (s.id === serverId) {
        // Update user in all channels they're in
        const updatedChannels = s.channels.map((channel) => {
          const updatedUsers = channel.users.map((user) => {
            if (user.username === username) {
              return {
                ...user,
                hostname: newHost,
              };
            }
            return user;
          });
          return { ...channel, users: updatedUsers };
        });

        // Update user in server-level users list if present
        const updatedServerUsers = s.users.map((user) => {
          if (user.username === username) {
            return {
              ...user,
              hostname: newHost,
            };
          }
          return user;
        });

        return { ...s, channels: updatedChannels, users: updatedServerUsers };
      }
      return s;
    });

    // Update current user if this is us
    let updatedCurrentUser = state.currentUser;
    if (state.currentUser?.username === username) {
      updatedCurrentUser = {
        ...state.currentUser,
        hostname: newHost,
      };
    }

    return { servers: updatedServers, currentUser: updatedCurrentUser };
  });
});

// Handle 306 numeric - we are now marked as away
ircClient.on("RPL_NOWAWAY", ({ serverId, message }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((s) => {
      if (s.id === serverId) {
        return {
          ...s,
          isAway: true,
          awayMessage: message,
        };
      }
      return s;
    });

    // Update current user if this is the selected server
    let updatedCurrentUser = state.currentUser;
    if (state.ui.selectedServerId === serverId && state.currentUser) {
      updatedCurrentUser = {
        ...state.currentUser,
        isAway: true,
        awayMessage: message,
      };
    }

    return { servers: updatedServers, currentUser: updatedCurrentUser };
  });
});

// Handle 305 numeric - we are no longer marked as away
ircClient.on("RPL_UNAWAY", ({ serverId, message }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((s) => {
      if (s.id === serverId) {
        return {
          ...s,
          isAway: false,
          awayMessage: undefined,
        };
      }
      return s;
    });

    // Update current user if this is the selected server
    let updatedCurrentUser = state.currentUser;
    if (state.ui.selectedServerId === serverId && state.currentUser) {
      updatedCurrentUser = {
        ...state.currentUser,
        isAway: false,
        awayMessage: undefined,
      };
    }

    return { servers: updatedServers, currentUser: updatedCurrentUser };
  });
});

// Batch event handlers
ircClient.on("BATCH_START", ({ serverId, batchId, type, parameters }) => {
  useStore.setState((state) => {
    const serverBatches = state.activeBatches[serverId] || {};
    return {
      activeBatches: {
        ...state.activeBatches,
        [serverId]: {
          ...serverBatches,
          [batchId]: {
            type,
            parameters: parameters || [],
            events: [],
            startTime: new Date(),
          },
        },
      },
    };
  });
});

ircClient.on("BATCH_END", ({ serverId, batchId }) => {
  useStore.setState((state) => {
    const serverBatches = state.activeBatches[serverId];
    if (!serverBatches || !serverBatches[batchId]) {
      return state;
    }

    const batch = serverBatches[batchId];

    // Process the batch based on its type
    if (batch.type === "netsplit") {
      processBatchedNetsplit(serverId, batchId, batch);
    } else if (batch.type === "netjoin") {
      processBatchedNetjoin(serverId, batchId, batch);
    } else if (batch.type === "draft/multiline" || batch.type === "multiline") {
      // Multiline batches are handled by the IRC client directly via MULTILINE_MESSAGE events
      // Don't process individual events here, the IRC client already combined them
    } else if (batch.type === "metadata") {
      // Metadata batches are handled by the IRC client directly via individual METADATA events
      // Don't process individual events here, metadata updates are already processed
    } else if (batch.type === "chathistory") {
      // Chathistory batch completed - turn off loading state for the channel

      // Try to determine the channel from batch parameters
      // Chathistory batch parameters typically include the channel name
      const channelName =
        batch.parameters && batch.parameters.length > 0
          ? batch.parameters[0]
          : null;

      if (channelName) {
        // Trigger event to turn off loading state
        ircClient.triggerEvent("CHATHISTORY_LOADING", {
          serverId,
          channelName,
          isLoading: false,
        });
      }
    } else {
      // For unknown batch types, process events individually
      batch.events.forEach((event) => {
        // Re-trigger the event without batch context based on its type
        switch (event.type) {
          case "JOIN":
            ircClient.triggerEvent("JOIN", event.data);
            break;
          case "QUIT":
            ircClient.triggerEvent("QUIT", event.data);
            break;
          case "PART":
            ircClient.triggerEvent("PART", event.data);
            break;
        }
      });
    }

    // Remove the completed batch
    const { [batchId]: removed, ...remainingBatches } = serverBatches;
    return {
      activeBatches: {
        ...state.activeBatches,
        [serverId]: remainingBatches,
      },
    };
  });
});

// Helper function to process netsplit batches
function processBatchedNetsplit(
  serverId: string,
  batchId: string,
  batch: BatchInfo,
) {
  const store = useStore.getState();
  const batch_info = store.activeBatches[serverId]?.[batchId];
  if (!batch_info) return;

  const quitEvents = batch_info.events;
  const [server1, server2] = batch_info.parameters || ["*.net", "*.split"];

  // Create a single netsplit message
  const netsplitMessage = {
    id: `netsplit-${batchId}`,
    content: "Oops! The net split! ⚠️",
    timestamp: new Date(),
    userId: "system",
    channelId: "", // Will be set per channel
    serverId,
    type: "netsplit" as const,
    batchId,
    quitUsers: quitEvents.map((e) => e.data.username),
    server1,
    server2,
    reactions: [],
    replyMessage: null,
    mentioned: [],
  };

  // Group affected channels and add the netsplit message to each
  const affectedChannels = new Set<string>();

  // Process each quit event to remove users and track affected channels
  quitEvents.forEach((event) => {
    const { username } = event.data;

    // Find which channels this user was in and remove them
    useStore.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((channel) => {
            const userIndex = channel.users.findIndex(
              (u) => u.username === username,
            );
            if (userIndex !== -1) {
              affectedChannels.add(channel.id);
              // Remove the user from the channel
              const updatedUsers = channel.users.filter(
                (u) => u.username !== username,
              );
              return { ...channel, users: updatedUsers };
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

  // Add netsplit message to each affected channel
  affectedChannels.forEach((channelId) => {
    const channelMessage = { ...netsplitMessage, channelId };
    useStore.getState().addMessage(channelMessage);
  });
}

// Helper function to process netjoin batches
function processBatchedNetjoin(
  serverId: string,
  batchId: string,
  batch: BatchInfo,
) {
  const store = useStore.getState();
  const batch_info = store.activeBatches[serverId]?.[batchId];
  if (!batch_info) return;

  const joinEvents = batch_info.events;
  const [server1, server2] = batch_info.parameters || ["*.net", "*.join"];

  // Process each join event normally first
  joinEvents.forEach((event) => {
    // Re-trigger the JOIN event to add users back
    if (event.type === "JOIN") {
      ircClient.triggerEvent("JOIN", event.data);
    }
  });

  // Find and update any existing netsplit messages to show rejoin
  useStore.setState((state) => {
    const updatedMessages = { ...state.messages };

    Object.keys(updatedMessages).forEach((channelKey) => {
      const messages = updatedMessages[channelKey];
      const updatedChannelMessages = messages.map((message) => {
        if (
          message.type === "netsplit" &&
          message.serverId === serverId &&
          message.server1 === server1 &&
          message.server2 === server2
        ) {
          // Update the netsplit message to show rejoin
          return {
            ...message,
            content: "The network split and rejoined. ✅",
            type: "netjoin" as const,
          };
        }
        return message;
      });
      updatedMessages[channelKey] = updatedChannelMessages;
    });

    return { messages: updatedMessages };
  });
}

// Handle chathistory loading state
ircClient.on("CHATHISTORY_LOADING", ({ serverId, channelName, isLoading }) => {
  useStore.setState((state) => {
    const updatedServers = state.servers.map((server) => {
      if (server.id === serverId) {
        const updatedChannels = server.channels.map((channel) => {
          if (channel.name === channelName) {
            return { ...channel, isLoadingHistory: isLoading };
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

export default useStore;
