import { v4 as uuidv4, v5 as uuidv5 } from "uuid";
import { create } from "zustand";
import ircClient from "../lib/ircClient";
import {
  clearServerConnectionTimeout,
  registerAllProtocolHandlers,
} from "../protocol";
import type {
  Message,
  PrivateChat,
  Server,
  ServerConfig,
  User,
  WhoisData,
} from "../types";
import { registerAllHandlers } from "./handlers";
import { readyProcessedServers } from "./handlers/connection";
import { MAX_MESSAGES_PER_CHANNEL } from "./helpers";
import * as storage from "./localStorage";
import { runPendingMigrations } from "./migrations";
import type {
  ChannelOrderMap,
  ConnectionDetails,
  GlobalSettings,
  layoutColumn,
  MediaVisibilityLevel,
  UISelections,
} from "./types";

const NARROW_VIEW_QUERY = "(max-width: 768px)";

// Namespace UUID for generating deterministic channel/chat IDs
const CHANNEL_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/**
 * Generate a deterministic UUID for a channel or private chat
 * based on the server ID and channel/chat name
 */
function generateDeterministicId(serverId: string, name: string): string {
  return uuidv5(`${serverId}:${name}`, CHANNEL_NAMESPACE);
}

// Helper function to normalize host for comparison (extract hostname from URL or return as-is)
function normalizeHost(host: string): string {
  if (host.includes("://")) {
    // Extract hostname from URL format
    const withoutProtocol = host.replace(/^(irc|ircs|wss):\/\//, "");
    return withoutProtocol.split(":")[0]; // Get just hostname, strip port if present
  }
  return host;
}

// Helper function to ensure host is in URL format
function ensureUrlFormat(host: string, port: number): string {
  if (host.includes("://")) {
    return host; // Already in URL format
  }
  // Convert old hostname-only format to URL — always wss://
  return `wss://${host}:${port}`;
}

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
  return messages.find(
    (message) =>
      message.msgid === messageId ||
      message.multilineMessageIds?.includes(messageId),
  );
};

const resolveReplyMessage = (
  mtags: Record<string, string> | undefined,
  serverId: string,
  channelId: string,
): Message | null => {
  const replyId =
    (mtags?.["+reply"] ?? mtags?.["+draft/reply"])?.trim() || null;
  return replyId
    ? (findChannelMessageById(serverId, channelId, replyId) ?? null)
    : null;
};

// ============================================================================
// LocalStorage Operations
// ============================================================================

// Servers
export const loadSavedServers = storage.servers.load;
export const saveServersToLocalStorage = storage.servers.save;
export const loadSavedMetadata = storage.metadata.load;
const saveMetadataToLocalStorage = storage.metadata.save;
const loadSavedGlobalSettings = storage.settings.load;
const saveGlobalSettingsToLocalStorage = storage.settings.save;
const loadChannelOrder = storage.channelOrder.load;
const saveChannelOrder = storage.channelOrder.save;
const loadPinnedPrivateChats = storage.pinnedChats.load;
const savePinnedPrivateChats = storage.pinnedChats.save;
const loadUISelections = storage.uiSelections.load;
const saveUISelections = storage.uiSelections.save;
// Merges a partial update into the stored UISelections so callers only pass
// the fields they actually change — adding new persisted fields won't silently
// break unrelated call sites.
const patchUISelections = (patch: Partial<UISelections>) =>
  saveUISelections({ ...loadUISelections(), ...patch });

function serverSupportsMetadata(serverId: string): boolean;
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
      "pronouns",
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
  // Per-server tab selections - remembers what was selected in each server
  perServerSelections: Record<
    string,
    {
      selectedChannelId: string | null;
      selectedChannelName?: string | null;
      selectedPrivateChatId: string | null;
      selectedPrivateChatUsername?: string | null;
    }
  >;
  sidebarPreferences?: {
    channelList: { isVisible: boolean; width: number };
    memberList: { isVisible: boolean; width: number };
  };
  isAddServerModalOpen: boolean | undefined;
  isEditServerModalOpen: boolean;
  editServerId: string | null;
  isSettingsModalOpen: boolean;
  isQuickActionsOpen: boolean;
  isDarkMode: boolean;
  isNarrowView: boolean;
  isMobileMenuOpen: boolean;
  isMemberListVisible: boolean;
  isChannelListVisible: boolean;
  isChannelListModalOpen: boolean;
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
  topicModalRequest: { serverId: string; channelId: string } | null;
  // Settings navigation - for Quick Actions to specify which category and setting to open/highlight
  settingsNavigation: {
    category?:
      | "profile"
      | "notifications"
      | "preferences"
      | "media"
      | "account";
    highlightedSettingId?: string;
  } | null;
  // Shimmer effect for newly connected servers
  serverShimmer?: Set<string>; // Set of server IDs that should show shimmer
  // Request focus on chat input (used when closing modals)
  shouldFocusChatInput: boolean;
  isUserProfileModalOpen: boolean;
  // Request state for ChatArea modals (using request pattern)
  channelSettingsRequest: { serverId: string; channelId: string } | null;
  inviteUserRequest: { serverId: string; channelId: string } | null;
  // Global media viewer state — kept at root level so resizing never closes it
  openedMedia: {
    url: string;
    sourceMsgId?: string;
    serverId?: string;
    channelId?: string;
    preferTopicEntry?: boolean;
    preferLastEntry?: boolean;
  } | null;
  activeMedia: {
    url: string;
    type: "video" | "audio" | "embed";
    thumbnailUrl?: string;
    isPlaying: boolean;
    isInlineVisible: boolean;
    currentTime?: number;
    msgid?: string;
    serverId?: string;
    channelId?: string;
  } | null;
}

export type { GlobalSettings };

export interface AppState {
  servers: Server[];
  currentUser: User | null;
  isConnecting: boolean;
  connectingServerId: string | null;
  isAddingNewServer: boolean;
  selectedServerId: string | null;
  connectionError: string | null;
  messages: Record<string, Message[]>;
  globalUsers: Record<string, User>; // serverId-username -> User (Normalized identity store)
  typingUsers: Record<string, User[]>;
  typingTimers: Record<string, Record<string, NodeJS.Timeout>>;
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
  channelListBuffer: Record<
    string,
    { channel: string; userCount: number; topic: string }[]
  >; // serverId -> channels (temporary buffer during listing)
  channelListFilters: Record<
    string,
    {
      minUsers?: number;
      maxUsers?: number;
      minCreationTime?: number; // minutes ago
      maxCreationTime?: number; // minutes ago
      minTopicTime?: number; // minutes ago
      maxTopicTime?: number; // minutes ago
      mask?: string;
      notMask?: string;
    }
  >; // serverId -> filter settings
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
  userMetadataRequested: Record<string, Set<string>>; // serverId -> Set of usernames we've requested metadata for
  metadataChangeCounter: number; // Counter incremented on metadata changes for reactivity
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
  // Message deduplication tracking
  processedMessageIds: Map<string, number>; // msgid -> timestamp of processing
  processedMessageCleanupTimer?: NodeJS.Timeout;
  // Auto-connect prevention
  hasConnectedToSavedServers: boolean;
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
    isNewServer?: boolean,
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
  setAway: (serverId: string, message?: string) => void;
  clearAway: (serverId: string) => void;
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
  listChannels: (
    serverId: string,
    filters?: {
      minUsers?: number;
      maxUsers?: number;
      minCreationTime?: number; // minutes ago
      maxCreationTime?: number; // minutes ago
      minTopicTime?: number; // minutes ago
      maxTopicTime?: number; // minutes ago
      mask?: string;
      notMask?: string;
    },
  ) => void;
  updateChannelListFilters: (
    serverId: string,
    filters: {
      minUsers?: number;
      maxUsers?: number;
      minCreationTime?: number; // minutes ago
      maxCreationTime?: number; // minutes ago
      minTopicTime?: number; // minutes ago
      maxTopicTime?: number; // minutes ago
      mask?: string;
      notMask?: string;
    },
  ) => void;
  renameChannel: (
    serverId: string,
    oldName: string,
    newName: string,
    reason?: string,
  ) => void;
  setName: (serverId: string, realname: string) => void;
  changeNick: (serverId: string, newNick: string) => void;
  changeGlobalNick: (
    serverId: string,
    oldNick: string,
    newNick: string,
  ) => void;
  addMessage: (message: Message) => void;
  updateGlobalUser: (
    serverId: string,
    user: Partial<User> & { username: string },
  ) => void;
  pruneProcessedMessageIds: () => void;
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
  selectServer: (
    serverId: string | null,
    options?: { clearSelection?: boolean },
  ) => void;
  selectChannel: (
    channelId: string | null,
    options?: { navigate?: boolean },
  ) => void;
  selectPrivateChat: (
    privateChatId: string | null,
    options?: { navigate?: boolean },
  ) => void;
  openPrivateChat: (serverId: string, username: string) => void;
  deletePrivateChat: (serverId: string, privateChatId: string) => void;
  pinPrivateChat: (serverId: string, privateChatId: string) => void;
  unpinPrivateChat: (serverId: string, privateChatId: string) => void;
  reorderPrivateChats: (serverId: string, privateChatIds: string[]) => void;
  markChannelAsRead: (serverId: string, channelId: string) => void;
  reorderChannels: (serverId: string, channelIds: string[]) => void;
  connectToSavedServers: () => void; // New action to load servers from localStorage
  reconnectServer: (serverId: string) => Promise<void>; // Reconnect to an existing server
  deleteServer: (serverId: string) => void; // New action to delete a server
  updateServer: (serverId: string, config: Partial<ServerConfig>) => void; // Update server configuration
  capAck: (serverId: string, key: string, capabilities: string) => void; // Handle CAP ACK
  // UI actions
  toggleAddServerModal: (
    isOpen?: boolean,
    prefillDetails?: ConnectionDetails | null,
  ) => void;
  toggleEditServerModal: (isOpen?: boolean, serverId?: string | null) => void;
  toggleSettingsModal: (isOpen?: boolean) => void;
  toggleQuickActions: (isOpen?: boolean) => void;
  requestChatInputFocus: () => void;
  clearChatInputFocus: () => void;
  toggleUserProfileModal: (isOpen?: boolean) => void;
  setProfileViewRequest: (serverId: string, username: string) => void;
  clearProfileViewRequest: () => void;
  setTopicModalRequest: (serverId: string, channelId: string) => void;
  clearTopicModalRequest: () => void;
  setSettingsNavigation: (navigation: {
    category?:
      | "profile"
      | "notifications"
      | "preferences"
      | "media"
      | "account";
    highlightedSettingId?: string;
  }) => void;
  clearSettingsNavigation: () => void;
  toggleDarkMode: () => void;
  toggleMobileMenu: (isOpen?: boolean) => void;
  toggleMemberList: (isVisible?: boolean) => void;
  toggleChannelList: (isOpen?: boolean) => void;
  updateSidebarPreferences: (preferences: {
    channelList?: { isVisible: boolean; width: number };
    memberList?: { isVisible: boolean; width: number };
  }) => void;
  toggleChannelListModal: (isOpen?: boolean) => void;
  toggleServerMenu: (isOpen?: boolean) => void;
  // New modal actions for QuickActions
  toggleTopicModal: (
    isOpen: boolean,
    context?: { serverId: string; channelId: string },
  ) => void;
  toggleUserProfileModalWithContext: (
    isOpen: boolean,
    context?: { serverId: string; username: string },
  ) => void;
  setChannelSettingsRequest: (
    serverId: string | null,
    channelId: string | null,
  ) => void;
  setInviteUserRequest: (
    serverId: string | null,
    channelId: string | null,
  ) => void;
  openMedia: (
    url: string,
    sourceMsgId?: string,
    serverId?: string,
    channelId?: string,
  ) => void;
  openTopicMedia: (url: string, serverId: string, channelId: string) => void;
  openMediaExplorer: (serverId: string, channelId: string) => void;
  closeMedia: () => void;
  playMedia: (
    url: string,
    type: "video" | "audio" | "embed",
    thumbnailUrl?: string,
    msgid?: string,
    serverId?: string,
    channelId?: string,
  ) => void;
  pauseActiveMedia: () => void;
  stopActiveMedia: () => void;
  setMediaInlineVisible: (visible: boolean, currentTime?: number) => void;
  setActiveMediaThumbnail: (url: string, thumbnailUrl: string) => void;
  toggleNotificationVolume: () => void;
  setIsNarrowView: (isNarrow: boolean) => void;
  showContextMenu: (
    x: number,
    y: number,
    type: "server" | "channel" | "user" | "message",
    itemId: string,
  ) => void;
  hideContextMenu: () => void;
  setMobileViewActiveColumn: (column: layoutColumn) => void;
  setMobileView: (view: layoutColumn) => void;
  // Server notices popup actions
  toggleServerNoticesPopup: (isOpen?: boolean) => void;
  minimizeServerNoticesPopup: (isMinimized?: boolean) => void;
  // Shimmer actions
  triggerServerShimmer: (serverId: string) => void;
  clearServerShimmer: (serverId: string) => void;
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

// Helper functions for per-server tab selections
const getServerSelection = (state: AppState, serverId: string) => {
  return (
    state.ui.perServerSelections[serverId] || {
      selectedChannelId: null,
      selectedPrivateChatId: null,
    }
  );
};

const setServerSelection = (
  state: AppState,
  serverId: string,
  selection: {
    selectedChannelId: string | null;
    selectedChannelName?: string | null;
    selectedPrivateChatId: string | null;
    selectedPrivateChatUsername?: string | null;
  },
) => {
  return {
    ...state.ui.perServerSelections,
    [serverId]: selection,
  };
};

const getCurrentSelection = (state: AppState) => {
  if (!state.ui.selectedServerId) {
    return {
      selectedChannelId: null,
      selectedPrivateChatId: null,
    };
  }
  return getServerSelection(state, state.ui.selectedServerId);
};

// Create store with Zustand
const useStore = create<AppState>((set, get) => ({
  servers: [],
  currentUser: null,
  isConnecting: false,
  connectingServerId: null,
  isAddingNewServer: false,
  connectionError: null,
  messages: {},
  typingUsers: {},
  typingTimers: {},
  globalNotifications: [],
  channelList: {},
  channelListBuffer: {},
  channelListFilters: {},
  listingInProgress: {},
  channelMetadataCache: {},
  channelMetadataFetchQueue: {},
  metadataSubscriptions: {},
  metadataBatches: {},
  activeBatches: {},
  metadataFetchInProgress: {},
  userMetadataRequested: {},
  metadataChangeCounter: 0,
  whoisData: {},
  pendingRegistration: null,
  channelOrder: loadChannelOrder(),
  processedMessageIds: new Map<string, number>(),
  hasConnectedToSavedServers: false,
  selectedServerId: null,
  globalUsers: {},

  // UI state
  ui: {
    selectedServerId: loadUISelections().selectedServerId, // Load immediately from localStorage
    perServerSelections: loadUISelections().perServerSelections, // Load immediately from localStorage
    sidebarPreferences: loadUISelections().sidebarPreferences || {
      channelList: { isVisible: true, width: 264 },
      memberList: { isVisible: true, width: 280 },
    },
    isAddServerModalOpen: false,
    isEditServerModalOpen: false,
    editServerId: null,
    isSettingsModalOpen: false,
    isQuickActionsOpen: false,
    isDarkMode: true,
    isNarrowView:
      typeof window !== "undefined"
        ? window.matchMedia(NARROW_VIEW_QUERY).matches
        : false,
    isMobileMenuOpen: false,
    isMemberListVisible:
      // Only restore member list on startup if the window is wide enough for the sidebar.
      // At intermediate widths the member list replaces the chat area which is bad UX on startup.
      typeof window !== "undefined" &&
      !window.matchMedia("(max-width: 1080px)").matches
        ? (loadUISelections().sidebarPreferences?.memberList.isVisible ?? true)
        : false,
    isChannelListVisible:
      loadUISelections().sidebarPreferences?.channelList.isVisible ?? true,
    isChannelListModalOpen: false,
    mobileViewActiveColumn: "serverList", // Always start on server/channel list, never auto-navigate to chat
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
    topicModalRequest: null,
    // Settings navigation
    settingsNavigation: null,
    // Chat input focus request
    shouldFocusChatInput: false,
    isUserProfileModalOpen: false,
    // Request state for ChatArea modals
    channelSettingsRequest: null,
    inviteUserRequest: null,
    openedMedia: null,
    activeMedia: null,
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
    // Media settings
    mediaVisibilityLevel: 1 as MediaVisibilityLevel,
    // Markdown settings
    enableMarkdownRendering: false,
    // Status messages
    awayMessage: "",
    quitMessage: "ObsidianIRC - Bringing IRC to the future",
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
    isNewServer = false,
  ) => {
    // Check if already connected to this server
    const state = get();
    const existingServer = state.servers.find(
      (s) =>
        normalizeHost(s.host) === normalizeHost(host) &&
        s.port === port &&
        s.isConnected,
    );
    if (existingServer) {
      // Already connected, just return the existing server
      return existingServer;
    }

    set({
      isConnecting: true,
      isAddingNewServer: isNewServer,
      connectionError: null,
    });

    try {
      // Look up saved server to get its ID
      const existingSavedServers: ServerConfig[] = loadSavedServers();
      const existingSavedServer = existingSavedServers.find(
        (s) => normalizeHost(s.host) === normalizeHost(host) && s.port === port,
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

      // Ensure host is in URL format for storage
      const urlHost = ensureUrlFormat(host, port);

      // Find existing server using normalized comparison
      const savedServer = savedServers.find(
        (s) =>
          normalizeHost(s.host) === normalizeHost(urlHost) && s.port === port,
      );
      const channelsToJoin = savedServer?.channels || [];

      // Remove existing server entry using normalized comparison
      const updatedServers = savedServers.filter(
        (s) =>
          normalizeHost(s.host) !== normalizeHost(urlHost) || s.port !== port,
      );

      updatedServers.push({
        id: server.id,
        name: server.name,
        host: urlHost, // Always save as full URL
        port,
        nickname,
        saslEnabled: !!saslPassword,
        password,
        channels: channelsToJoin,
        saslAccountName,
        saslPassword,
        // Preserve existing oper credentials and warning preferences
        operUsername: savedServer?.operUsername,
        operPassword: savedServer?.operPassword,
        operOnConnect: savedServer?.operOnConnect,
        skipLocalhostWarning: savedServer?.skipLocalhostWarning,
        skipLinkSecurityWarning: savedServer?.skipLinkSecurityWarning,
        // Preserve existing addedAt timestamp or set current time for new servers
        addedAt: savedServer?.addedAt || Date.now(),
      });
      saveServersToLocalStorage(updatedServers);

      set((state) => {
        const existingServerIndex = state.servers.findIndex(
          (s) =>
            normalizeHost(s.host) === normalizeHost(server.host) &&
            s.port === port,
        );
        if (existingServerIndex !== -1) {
          const updatedServers = [...state.servers];
          const existingServer = updatedServers[existingServerIndex];
          updatedServers[existingServerIndex] = {
            ...existingServer,
            ...server,
            id: existingServer.id,
          };
          return {
            servers: updatedServers,
            connectingServerId: server.id,
          };
        }
        return {
          servers: [...state.servers, server],
          connectingServerId: server.id,
        };
      });

      // Check for localhost connection warning (unencrypted ws://)
      const isLocalhost = host === "localhost" || host === "127.0.0.1";
      if (isLocalhost) {
        const savedServers = loadSavedServers();
        const serverConfig = savedServers.find(
          (s) =>
            normalizeHost(s.host) === normalizeHost(host) && s.port === port,
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
      // Even if connection fails, add the server to the store as disconnected
      // so it appears in the UI and can be reconnected later
      const disconnectedServer: Server = {
        id: uuidv4(),
        name: name || host,
        host,
        port,
        channels: [],
        privateChats: [],
        isConnected: false,
        connectionState: "disconnected",
        users: [],
      };

      set((state) => {
        const existingServerIndex = state.servers.findIndex(
          (s) =>
            normalizeHost(s.host) === normalizeHost(host) && s.port === port,
        );
        if (existingServerIndex !== -1) {
          // Update existing server to disconnected
          const updatedServers = [...state.servers];
          updatedServers[existingServerIndex] = {
            ...updatedServers[existingServerIndex],
            isConnected: false,
            connectionState: "disconnected",
          };
          return {
            servers: updatedServers,
            isConnecting: false,
            connectionError:
              error instanceof Error ? error.message : "Unknown error",
          };
        }
        return {
          servers: [...state.servers, disconnectedServer],
          isConnecting: false,
          connectionError:
            error instanceof Error ? error.message : "Unknown error",
        };
      });

      throw error;
    }
  },

  disconnect: (serverId) => {
    clearServerConnectionTimeout(serverId);
    const quitMessage = get().globalSettings.quitMessage;
    ircClient.disconnect(serverId, quitMessage);

    // Clear ready handler processed flag to allow reconnection
    readyProcessedServers.delete(serverId);

    set((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          return {
            ...server,
            isConnected: false,
            connectionState: "disconnected" as const,
          };
        }
        return server;
      });

      let newUi = { ...state.ui };
      if (state.ui.selectedServerId === serverId) {
        const nextServer = updatedServers.find(
          (s) => s.isConnected && s.id !== serverId,
        );
        if (nextServer) {
          const serverSelection = getServerSelection(state, nextServer.id);
          newUi = {
            ...newUi,
            selectedServerId: nextServer.id,
            perServerSelections: setServerSelection(
              state,
              nextServer.id,
              serverSelection,
            ),
          };
        } else {
          newUi = {
            ...newUi,
            selectedServerId: null,
          };
        }
      }

      const clearConnectionState =
        state.connectingServerId === serverId
          ? { isConnecting: false, connectingServerId: null }
          : {};

      return {
        servers: updatedServers,
        ...clearConnectionState,
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
              (c) => c.name.toLowerCase() === channelName.toLowerCase(),
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
            normalizeHost(s.host) ===
              normalizeHost(currentServer?.host || "") &&
            s.port === currentServer?.port,
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

          return {
            servers: updatedServers,
            channelOrder: newChannelOrder,
          };
        }

        return {
          servers: updatedServers,
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
        (s) =>
          normalizeHost(s.host) === normalizeHost(currentServer?.host || "") &&
          s.port === currentServer?.port,
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

      // Clear selection if the left channel was the selected one
      const currentSelection = getServerSelection(state, serverId);
      const server = state.servers.find((s) => s.id === serverId);
      const leftChannel = server?.channels.find((c) => c.name === channelName);

      let updatedUI = state.ui;
      if (
        leftChannel &&
        currentSelection?.selectedChannelId === leftChannel.id
      ) {
        const remainingChannels =
          updatedServers.find((s) => s.id === serverId)?.channels || [];
        const nextChannel = remainingChannels[0] || null;
        updatedUI = {
          ...state.ui,
          perServerSelections: setServerSelection(state, serverId, {
            selectedChannelId: nextChannel?.id || null,
            selectedChannelName: nextChannel?.name || null,
            selectedPrivateChatId: null,
            selectedPrivateChatUsername: null,
          }),
        };
      }

      return {
        servers: updatedServers,
        channelOrder: newChannelOrder,
        ui: updatedUI,
      };
    });

    patchUISelections({
      selectedServerId: get().ui.selectedServerId,
      perServerSelections: get().ui.perServerSelections,
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

  setAway: (serverId, message) => {
    const awayMsg = message || get().globalSettings.awayMessage || "Away";
    ircClient.setAway(serverId, awayMsg);
  },

  clearAway: (serverId) => {
    ircClient.clearAway(serverId);
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

  listChannels: (serverId, filters?) => {
    const state = get();
    if (state.listingInProgress[serverId]) {
      // Already listing, ignore
      return;
    }
    // Find the server to check for ELIST support
    const server = state.servers.find((s) => s.id === serverId);
    const elist = server?.elist;

    // Use provided filters or get stored filters
    const filterSettings = filters || state.channelListFilters[serverId] || {};

    // Clear the channel list and buffer before starting a new list
    set((state) => ({
      channelList: {
        ...state.channelList,
        [serverId]: [],
      },
      channelListBuffer: {
        ...state.channelListBuffer,
        [serverId]: [],
      },
      listingInProgress: {
        ...state.listingInProgress,
        [serverId]: true,
      },
    }));
    ircClient.listChannels(serverId, elist, filterSettings);
  },

  updateChannelListFilters: (serverId, filters) => {
    set((state) => ({
      channelListFilters: {
        ...state.channelListFilters,
        [serverId]: filters,
      },
    }));
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

  changeGlobalNick: (serverId, oldNick, newNick) => {
    set((state) => {
      const oldKey = `${serverId}-${oldNick.toLowerCase()}`;
      const newKey = `${serverId}-${newNick.toLowerCase()}`;
      const user = state.globalUsers[oldKey];

      if (!user) return {};

      const { [oldKey]: _, ...remainingUsers } = state.globalUsers;
      const updatedUser = { ...user, username: newNick };

      // Propagate to channel lists
      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          return {
            ...s,
            channels: s.channels.map((ch) => ({
              ...ch,
              users: ch.users.map((u) =>
                u.username.toLowerCase() === oldNick.toLowerCase()
                  ? { ...u, username: newNick }
                  : u,
              ),
            })),
          };
        }
        return s;
      });

      return {
        globalUsers: { ...remainingUsers, [newKey]: updatedUser },
        servers: updatedServers,
      };
    });
  },

  addMessage: (message) => {
    set((state) => {
      const channelKey = `${message.serverId}-${message.channelId}`;
      const existing = state.messages[channelKey] || [];

      // Check for duplicates using the optimized Map-based tracking
      if (message.msgid && state.processedMessageIds.has(message.msgid)) {
        return state;
      }

      // Fallback for messages without msgid (basic content duplication check)
      if (!message.msgid) {
        const isDuplicate = existing.some((existingMessage) => {
          return (
            existingMessage.content === message.content &&
            new Date(existingMessage.timestamp).getTime() ===
              new Date(message.timestamp).getTime() &&
            existingMessage.userId === message.userId
          );
        });
        if (isDuplicate) return state;
      }

      const updated = [...existing, message].sort((a, b) => {
        const tA = new Date(a.timestamp).getTime();
        const tB = new Date(b.timestamp).getTime();
        return tA - tB;
      });

      // Enforce global history limit
      const pruned = updated.slice(-MAX_MESSAGES_PER_CHANNEL);

      const nextMessages = { ...state.messages, [channelKey]: pruned };
      const nextProcessed = new Map(state.processedMessageIds);

      // Track this msgid with current timestamp for TTL pruning
      if (message.msgid) {
        nextProcessed.set(message.msgid, Date.now());
      }
      if (message.multilineMessageIds) {
        for (const id of message.multilineMessageIds) {
          nextProcessed.set(id, Date.now());
        }
      }

      // Initialize pruning timer (runs once an hour)
      if (!state.processedMessageCleanupTimer) {
        const timer = setInterval(
          () => {
            get().pruneProcessedMessageIds();
          },
          60 * 60 * 1000,
        ) as unknown as NodeJS.Timeout;
        return {
          messages: nextMessages,
          processedMessageIds: nextProcessed,
          processedMessageCleanupTimer: timer,
        };
      }

      return {
        messages: nextMessages,
        processedMessageIds: nextProcessed,
      };
    });
  },

  updateGlobalUser: (serverId, user) => {
    set((state) => {
      const key = `${serverId}-${user.username.toLowerCase()}`;
      const existing = state.globalUsers[key];
      const updated = {
        ...(existing || {
          id: uuidv4(),
          username: user.username,
          isOnline: true,
          metadata: {},
        }),
        ...user,
      };

      // Propagate changes to all views for immediate UI reactivity
      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          return {
            ...s,
            channels: s.channels.map((ch) => ({
              ...ch,
              users: ch.users.map((u) =>
                u.username.toLowerCase() === user.username.toLowerCase()
                  ? { ...u, ...user }
                  : u,
              ),
            })),
            privateChats: s.privateChats?.map((pc) =>
              pc.username.toLowerCase() === user.username.toLowerCase()
                ? { ...pc, ...user }
                : pc,
            ),
          };
        }
        return s;
      });

      return {
        globalUsers: { ...state.globalUsers, [key]: updated },
        servers: updatedServers,
      };
    });
  },

  pruneProcessedMessageIds: () => {
    set((state) => {
      const now = Date.now();
      const TTL = 24 * 60 * 60 * 1000; // 24 hours
      const nextMap = new Map<string, number>();

      for (const [id, ts] of state.processedMessageIds.entries()) {
        if (now - ts < TTL) {
          nextMap.set(id, ts);
        }
      }

      return { processedMessageIds: nextMap };
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

  selectServer: (serverId, options) => {
    set((state) => {
      // If selecting null (no server), just update the selectedServerId
      if (serverId === null) {
        // Save cleared selection to localStorage
        patchUISelections({
          selectedServerId: null,
          perServerSelections: state.ui.perServerSelections,
        });
        return {
          ui: {
            ...state.ui,
            selectedServerId: null,
            isMobileMenuOpen: false,
          },
        };
      }

      // Find the server
      const server = state.servers.find((s) => s.id === serverId);

      const serverSelection = getServerSelection(state, serverId);
      let selectedChannelId = serverSelection.selectedChannelId;
      let selectedPrivateChatId = serverSelection.selectedPrivateChatId;

      // Only clear selection on mobile if explicitly requested (user-initiated server switch)
      if (state.ui.isNarrowView && options?.clearSelection) {
        selectedChannelId = null;
        selectedPrivateChatId = null;
      } else if (!state.ui.isNarrowView && server) {
        // On desktop, restore previous selection or select first channel
        const channelExists =
          selectedChannelId &&
          server.channels.some((c) => c.id === selectedChannelId);
        const privateChatExists =
          selectedPrivateChatId &&
          server.privateChats?.some((pc) => pc.id === selectedPrivateChatId);

        if (!channelExists && !privateChatExists) {
          selectedChannelId = server.channels[0]?.id || null;
          selectedPrivateChatId = null;
        }
      }

      const selectedChannelName =
        server?.channels.find((c) => c.id === selectedChannelId)?.name || null;
      const selectedPrivateChatUsername =
        server?.privateChats?.find((pc) => pc.id === selectedPrivateChatId)
          ?.username || null;

      // When the user switches *to* a server, the channel or PM that
      // restores into focus has now been "looked at" -- clear its
      // unread / mention indicators.  Without this the badge sticks
      // on the just-foregrounded buffer until the user clicks somewhere
      // else and back.
      let updatedServers = state.servers;
      if (selectedChannelId || selectedPrivateChatId) {
        updatedServers = state.servers.map((s) => {
          if (s.id !== serverId) return s;
          let touched = false;
          const channels = s.channels.map((ch) => {
            if (ch.id !== selectedChannelId) return ch;
            if (
              ch.unreadCount === 0 &&
              !ch.isMentioned &&
              (ch.mentionCount ?? 0) === 0
            )
              return ch;
            touched = true;
            return {
              ...ch,
              unreadCount: 0,
              mentionCount: 0,
              isMentioned: false,
            };
          });
          const privateChats = s.privateChats?.map((pc) => {
            if (pc.id !== selectedPrivateChatId) return pc;
            if (
              pc.unreadCount === 0 &&
              !pc.isMentioned &&
              (pc.mentionCount ?? 0) === 0
            )
              return pc;
            touched = true;
            return {
              ...pc,
              unreadCount: 0,
              mentionCount: 0,
              isMentioned: false,
            };
          });
          if (!touched) return s;
          return { ...s, channels, privateChats };
        });
      }

      return {
        servers: updatedServers,
        ui: {
          ...state.ui,
          selectedServerId: serverId,
          perServerSelections: {
            ...state.ui.perServerSelections,
            [serverId]: {
              selectedChannelId,
              selectedChannelName,
              selectedPrivateChatId,
              selectedPrivateChatUsername,
            },
          },
          isMobileMenuOpen: false,
        },
      };
    });

    // Save UI selections to localStorage
    const newState = get();
    const selectedServer = newState.servers.find(
      (s) => s.id === newState.ui.selectedServerId,
    );
    const selection =
      newState.ui.perServerSelections[newState.ui.selectedServerId || ""];
    patchUISelections({
      selectedServerId: newState.ui.selectedServerId,
      perServerSelections: newState.ui.perServerSelections,
      lastSelection: {
        serverHost: selectedServer?.host || "",
        channelName:
          selectedServer?.channels.find(
            (c) => c.id === selection?.selectedChannelId,
          )?.name || null,
        privateChatUsername:
          selectedServer?.privateChats?.find(
            (pc) => pc.id === selection?.selectedPrivateChatId,
          )?.username || null,
      },
    });
  },

  selectChannel: (channelId, options) => {
    set((state) => {
      // Special case for server notices
      if (channelId === "server-notices") {
        return {
          ui: {
            ...state.ui,
            perServerSelections: setServerSelection(
              state,
              state.ui.selectedServerId || "",
              {
                selectedChannelId: channelId,
                selectedPrivateChatId: null,
              },
            ),
            isMobileMenuOpen: false,
            mobileViewActiveColumn:
              state.ui.isNarrowView && options?.navigate
                ? "chatView"
                : state.ui.mobileViewActiveColumn,
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

        const server = state.servers.find((s) => s.id === serverId);
        const channelName =
          server?.channels.find((c) => c.id === channelId)?.name || null;

        // Update unread state in store
        const updatedServers = state.servers.map((server) => {
          if (server.id === serverId) {
            const updatedChannels = server.channels.map((channel) => {
              if (channel.id === channelId) {
                return {
                  ...channel,
                  unreadCount: 0,
                  mentionCount: 0,
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
            perServerSelections: setServerSelection(state, serverId, {
              selectedChannelId: channelId,
              selectedChannelName: channelName,
              selectedPrivateChatId: null,
            }),
            isMobileMenuOpen: false,
            mobileViewActiveColumn:
              state.ui.isNarrowView && options?.navigate
                ? "chatView"
                : state.ui.mobileViewActiveColumn,
          },
        };
      }

      const currentServerId = state.ui.selectedServerId || "";
      const currentServer = state.servers.find((s) => s.id === currentServerId);
      const channelName =
        currentServer?.channels.find((c) => c.id === channelId)?.name || null;

      return {
        ui: {
          ...state.ui,
          perServerSelections: setServerSelection(state, currentServerId, {
            selectedChannelId: channelId,
            selectedChannelName: channelName,
            selectedPrivateChatId: null,
          }),
          isMobileMenuOpen: false,
          mobileViewActiveColumn:
            state.ui.isNarrowView && options?.navigate
              ? "chatView"
              : state.ui.mobileViewActiveColumn,
        },
      };
    });

    // Save UI selections to localStorage with name-based fallback
    const newState = get();
    const selectedServer = newState.servers.find(
      (s) => s.id === newState.ui.selectedServerId,
    );
    const selection =
      newState.ui.perServerSelections[newState.ui.selectedServerId || ""];
    const channelObj = selectedServer?.channels.find(
      (c) => c.id === selection?.selectedChannelId,
    );
    patchUISelections({
      selectedServerId: newState.ui.selectedServerId,
      perServerSelections: newState.ui.perServerSelections,
      lastSelection: {
        serverHost: selectedServer?.host || "",
        channelName: channelObj?.name || null,
        privateChatUsername: null,
      },
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
                mentionCount: 0,
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
          (s) =>
            normalizeHost(s.host) === normalizeHost(server.host) &&
            s.port === server.port,
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

  selectPrivateChat: (privateChatId, options) => {
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

      // If already selected, only navigate on mobile if requested
      if (
        serverId &&
        state.ui.perServerSelections[serverId]?.selectedPrivateChatId ===
          privateChatId
      ) {
        if (state.ui.isNarrowView && options?.navigate) {
          return {
            ...state,
            ui: { ...state.ui, mobileViewActiveColumn: "chatView" },
          };
        }
        return state;
      }

      // Mark private chat as read
      if (serverId && privateChatId) {
        const server = state.servers.find((s) => s.id === serverId);
        const pcUsername =
          server?.privateChats?.find((pc) => pc.id === privateChatId)
            ?.username || null;

        const updatedServers = state.servers.map((server) => {
          if (server.id === serverId) {
            const updatedPrivateChats =
              server.privateChats?.map((privateChat) => {
                if (privateChat.id === privateChatId) {
                  return {
                    ...privateChat,
                    unreadCount: 0,
                    mentionCount: 0,
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
            perServerSelections: setServerSelection(state, serverId, {
              selectedChannelId: null,
              selectedPrivateChatId: privateChatId,
              selectedPrivateChatUsername: pcUsername,
            }),
            isMobileMenuOpen: false,
            mobileViewActiveColumn:
              state.ui.isNarrowView && options?.navigate
                ? "chatView"
                : state.ui.mobileViewActiveColumn,
          },
        };
      }

      const currentServerId = state.ui.selectedServerId || "";
      const currentServer = state.servers.find((s) => s.id === currentServerId);
      const pcUsername =
        currentServer?.privateChats?.find((pc) => pc.id === privateChatId)
          ?.username || null;

      return {
        ui: {
          ...state.ui,
          perServerSelections: setServerSelection(state, currentServerId, {
            selectedChannelId: null,
            selectedPrivateChatId: privateChatId,
            selectedPrivateChatUsername: pcUsername,
          }),
          isMobileMenuOpen: false,
          mobileViewActiveColumn:
            state.ui.isNarrowView && options?.navigate
              ? "chatView"
              : state.ui.mobileViewActiveColumn,
        },
      };
    });

    // Save UI selections to localStorage with name-based fallback
    const newState = get();
    const selectedServer = newState.servers.find(
      (s) => s.id === newState.ui.selectedServerId,
    );
    const selection =
      newState.ui.perServerSelections[newState.ui.selectedServerId || ""];
    const pcObj = selectedServer?.privateChats?.find(
      (pc) => pc.id === selection?.selectedPrivateChatId,
    );
    patchUISelections({
      selectedServerId: newState.ui.selectedServerId,
      perServerSelections: newState.ui.perServerSelections,
      lastSelection: {
        serverHost: selectedServer?.host || "",
        channelName: null,
        privateChatUsername: pcObj?.username || null,
      },
    });
  },

  openPrivateChat: (serverId, username) => {
    set((state) => {
      const server = state.servers.find((s) => s.id === serverId);
      if (!server) return {};

      // Get the current user for this specific server
      const currentUser = ircClient.getCurrentUser(serverId);

      // Don't allow opening private chats with ourselves
      if (currentUser?.username.toLowerCase() === username.toLowerCase()) {
        return {};
      }

      // Check if private chat already exists (IRC nicks are case-insensitive)
      const existingChat = server.privateChats?.find(
        (pc) => pc.username.toLowerCase() === username.toLowerCase(),
      );
      if (existingChat) {
        // MONITOR the user if not already monitored
        ircClient.monitorAdd(serverId, [username]);

        // Request chathistory for this PM (if server supports it)
        if (server.capabilities?.includes("draft/chathistory")) {
          setTimeout(() => {
            ircClient.sendRaw(serverId, `CHATHISTORY LATEST ${username} * 50`);
          }, 50);
        }

        // Check if we already have user info from channels
        let hasUserInfo = false;
        for (const channel of server.channels) {
          const user = channel.users.find(
            (u) => u.username.toLowerCase() === username.toLowerCase(),
          );
          if (user?.realname && user.account !== undefined) {
            // We have complete user info, copy it to the PM
            hasUserInfo = true;
            useStore.setState((state) => ({
              servers: state.servers.map((s) => {
                if (s.id === serverId) {
                  return {
                    ...s,
                    privateChats: s.privateChats?.map((pm) => {
                      if (
                        pm.username.toLowerCase() === username.toLowerCase()
                      ) {
                        return {
                          ...pm,
                          realname: user.realname,
                          account: user.account,
                          isBot: user.isBot,
                        };
                      }
                      return pm;
                    }),
                  };
                }
                return s;
              }),
            }));
            break;
          }
        }

        // Only request WHO if we don't already have complete user info
        if (!hasUserInfo) {
          // Request WHO to get current status using WHOX to also get account
          // Fields: u=username, h=hostname, n=nickname, f=flags, a=account, r=realname
          setTimeout(() => {
            ircClient.sendRaw(serverId, `WHO ${username} %cuhnfrao`);
          }, 100);
        }

        // Note: We don't request METADATA GET for individual users as some servers reject this.
        // Instead, we rely on metadata from shared channels (if user is in a channel with us)
        // or from localStorage if we previously got their metadata.

        // Select existing private chat
        return {
          ui: {
            ...state.ui,
            perServerSelections: setServerSelection(state, serverId, {
              selectedChannelId: getCurrentSelection(state).selectedChannelId,
              selectedPrivateChatId:
                getCurrentSelection(state).selectedPrivateChatId,
            }),
          },
        };
      }

      // Create new private chat
      const newPrivateChat: PrivateChat = {
        id: generateDeterministicId(serverId, username),
        username,
        serverId,
        unreadCount: 0,
        isMentioned: false,
        lastActivity: new Date(),
        isOnline: false, // Will be updated by MONITOR response
        isAway: false,
      };

      // Check if we already have user info from channels
      let hasUserInfo = false;
      for (const channel of server.channels) {
        const user = channel.users.find(
          (u) => u.username.toLowerCase() === username.toLowerCase(),
        );
        if (user?.realname && user.account !== undefined) {
          // We have complete user info, copy it to the new PM
          hasUserInfo = true;
          newPrivateChat.realname = user.realname;
          newPrivateChat.account = user.account;
          newPrivateChat.isBot = user.isBot;
          break;
        }
      }

      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          return {
            ...s,
            privateChats: [...(s.privateChats || []), newPrivateChat],
          };
        }
        return s;
      });

      // Add MONITOR for this user (server-specific)
      ircClient.monitorAdd(serverId, [username]);

      // Request chathistory for this new PM (if server supports it)
      if (server.capabilities?.includes("draft/chathistory")) {
        setTimeout(() => {
          ircClient.sendRaw(serverId, `CHATHISTORY LATEST ${username} * 50`);
        }, 50);
      }

      // Only request WHO if we don't already have complete user info
      if (!hasUserInfo) {
        // Request WHO to get their current status (H=here/green, G=gone/yellow) using WHOX to also get account
        // Fields: u=username, h=hostname, n=nickname, f=flags, a=account, r=realname
        setTimeout(() => {
          ircClient.sendRaw(serverId, `WHO ${username} %cuhnfrao`);
        }, 100);
      }

      // Note: We don't request METADATA GET for individual users as some servers reject this.
      // Instead, we rely on metadata from shared channels (if user is in a channel with us)
      // or from localStorage if we previously got their metadata.

      return {
        servers: updatedServers,
        ui: {
          ...state.ui,
          perServerSelections: setServerSelection(state, serverId, {
            selectedChannelId: getCurrentSelection(state).selectedChannelId,
            selectedPrivateChatId:
              getCurrentSelection(state).selectedPrivateChatId,
          }),
        },
      };
    });
  },

  deletePrivateChat: (serverId, privateChatId) => {
    set((state) => {
      const server = state.servers.find((s) => s.id === serverId);
      if (!server) return {};

      const privateChat = server.privateChats?.find(
        (pc) => pc.id === privateChatId,
      );

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

      // If unpinned, remove MONITOR (but don't UNSUB from metadata - that's global)
      if (privateChat && !privateChat.isPinned) {
        ircClient.monitorRemove(serverId, [privateChat.username]);
      }

      // If the deleted private chat was selected, clear the selection
      const newState: Partial<AppState> = {
        servers: updatedServers,
      };

      if (getCurrentSelection(state).selectedPrivateChatId === privateChatId) {
        newState.ui = {
          ...state.ui,
          perServerSelections: setServerSelection(state, serverId, {
            selectedChannelId: getCurrentSelection(state).selectedChannelId,
            selectedPrivateChatId: null,
          }),
        };
      }

      // Update localStorage if it was pinned
      if (privateChat?.isPinned) {
        const pinnedChats = loadPinnedPrivateChats();
        if (pinnedChats[serverId]) {
          pinnedChats[serverId] = pinnedChats[serverId].filter(
            (pc) => pc.username !== privateChat.username,
          );
          savePinnedPrivateChats(pinnedChats);
        }
      }

      return newState;
    });
  },

  pinPrivateChat: (serverId, privateChatId) => {
    set((state) => {
      const server = state.servers.find((s) => s.id === serverId);
      if (!server) return {};

      const privateChat = server.privateChats?.find(
        (pc) => pc.id === privateChatId,
      );
      if (!privateChat) return {};

      // Calculate the new order (highest + 1)
      const maxOrder = Math.max(
        0,
        ...(server.privateChats
          ?.filter((pc) => pc.isPinned && pc.order !== undefined)
          .map((pc) => pc.order as number) || []),
      );

      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          const updatedPrivateChats = s.privateChats?.map((pc) => {
            if (pc.id === privateChatId) {
              return { ...pc, isPinned: true, order: maxOrder + 1 };
            }
            return pc;
          });
          return { ...s, privateChats: updatedPrivateChats };
        }
        return s;
      });

      // Save to localStorage
      const pinnedChats = loadPinnedPrivateChats();
      if (!pinnedChats[serverId]) {
        pinnedChats[serverId] = [];
      }
      pinnedChats[serverId].push({
        username: privateChat.username,
        order: maxOrder + 1,
      });
      savePinnedPrivateChats(pinnedChats);

      return { servers: updatedServers };
    });
  },

  unpinPrivateChat: (serverId, privateChatId) => {
    set((state) => {
      const server = state.servers.find((s) => s.id === serverId);
      if (!server) return {};

      const privateChat = server.privateChats?.find(
        (pc) => pc.id === privateChatId,
      );
      if (!privateChat) return {};

      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          const updatedPrivateChats = s.privateChats?.map((pc) => {
            if (pc.id === privateChatId) {
              return { ...pc, isPinned: false, order: undefined };
            }
            return pc;
          });
          return { ...s, privateChats: updatedPrivateChats };
        }
        return s;
      });

      // Remove from localStorage
      const pinnedChats = loadPinnedPrivateChats();
      if (pinnedChats[serverId]) {
        pinnedChats[serverId] = pinnedChats[serverId].filter(
          (pc) => pc.username !== privateChat.username,
        );
        savePinnedPrivateChats(pinnedChats);
      }

      return { servers: updatedServers };
    });
  },

  reorderPrivateChats: (serverId, privateChatIds) => {
    set((state) => {
      const server = state.servers.find((s) => s.id === serverId);
      if (!server) return {};

      // Update order for each private chat
      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          const updatedPrivateChats = s.privateChats?.map((pc) => {
            const newOrder = privateChatIds.indexOf(pc.id);
            if (newOrder !== -1 && pc.isPinned) {
              return { ...pc, order: newOrder };
            }
            return pc;
          });
          return { ...s, privateChats: updatedPrivateChats };
        }
        return s;
      });

      // Save to localStorage
      const pinnedChats = loadPinnedPrivateChats();
      if (pinnedChats[serverId]) {
        // Update order for all pinned chats
        pinnedChats[serverId] = pinnedChats[serverId].map((pc) => {
          const privateChat = server.privateChats?.find(
            (p) => p.username === pc.username,
          );
          if (privateChat) {
            const newOrder = privateChatIds.indexOf(privateChat.id);
            if (newOrder !== -1) {
              return { ...pc, order: newOrder };
            }
          }
          return pc;
        });
        savePinnedPrivateChats(pinnedChats);
      }

      return { servers: updatedServers };
    });
  },

  connectToSavedServers: async () => {
    const state = get();
    if (state.hasConnectedToSavedServers) {
      return; // Already connected, don't do it again
    }

    set({ hasConnectedToSavedServers: true });

    runPendingMigrations();

    const savedServers = loadSavedServers();
    const connectionPromises = [];

    for (const savedServer of savedServers) {
      const {
        id,
        name,
        host,
        port,
        nickname,
        password,
        channels,
        saslEnabled,
        saslAccountName,
        saslPassword,
      } = savedServer;

      // Ensure host is in URL format (handles old hostname-only entries)
      const urlHost = ensureUrlFormat(host, port);

      // Check if server already exists in store using normalized comparison
      const existingServer = get().servers.find(
        (s) =>
          normalizeHost(s.host) === normalizeHost(urlHost) && s.port === port,
      );

      if (!existingServer) {
        // Add server to store with connecting state
        const connectingServer: Server = {
          id,
          name: name || normalizeHost(urlHost),
          host: normalizeHost(urlHost), // Store normalized hostname in state
          port,
          channels: [],
          privateChats: [],
          isConnected: false,
          connectionState: "connecting",
          users: [],
        };

        set((state) => ({
          servers: [...state.servers, connectingServer],
        }));
      }

      const connectionPromise = get()
        .connect(
          name || normalizeHost(urlHost),
          urlHost, // Use full URL
          port,
          nickname,
          saslEnabled,
          password,
          saslAccountName,
          saslPassword,
        )
        .catch((error) => {
          console.error(`Failed to reconnect to server ${urlHost}`, error);
          // Update server state to disconnected using normalized comparison
          set((state) => ({
            servers: state.servers.map((s) =>
              normalizeHost(s.host) === normalizeHost(urlHost) &&
              s.port === port
                ? { ...s, connectionState: "disconnected" as const }
                : s,
            ),
          }));
        });

      connectionPromises.push(connectionPromise);
    }

    // Wait for all connections to complete
    await Promise.all(connectionPromises);

    // Note: UI selection is now loaded immediately from localStorage in initial state,
    // so no need for delayed restoration here
  },

  reconnectServer: async (serverId: string) => {
    const state = get();
    const server = state.servers.find((s) => s.id === serverId);
    if (!server) {
      console.error(`Server ${serverId} not found`);
      return;
    }

    // Update server state to connecting
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === serverId
          ? { ...s, connectionState: "connecting" as const }
          : s,
      ),
    }));

    try {
      // Get saved server config to get credentials
      const savedServers = loadSavedServers();
      const savedServer = savedServers.find(
        (s) =>
          normalizeHost(s.host) === normalizeHost(server.host) &&
          s.port === server.port,
      );

      if (!savedServer) {
        console.error(`No saved configuration found for server ${serverId}`, {
          host: server.host,
          port: server.port,
          savedServers,
        });
        throw new Error(`No saved configuration found for server ${serverId}`);
      }

      // Ensure host is in URL format (handles old hostname-only entries)
      const urlHost = ensureUrlFormat(savedServer.host, savedServer.port);

      await get().connect(
        savedServer.name || normalizeHost(savedServer.host),
        urlHost, // Use full URL
        savedServer.port,
        savedServer.nickname,
        savedServer.saslEnabled,
        savedServer.password,
        savedServer.saslAccountName,
        savedServer.saslPassword,
      );
    } catch (error) {
      console.error(`Failed to reconnect to server ${serverId}`, error);
      // Update server state back to disconnected
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === serverId
            ? { ...s, connectionState: "disconnected" as const }
            : s,
        ),
      }));
    }
  },

  deleteServer: (serverId) => {
    clearServerConnectionTimeout(serverId);
    ircClient.removeServer(serverId);

    set((state) => {
      const serverToDelete = state.servers.find(
        (server) => server.id === serverId,
      );

      const savedServers = loadSavedServers();
      const updatedServers = savedServers.filter(
        (s) =>
          normalizeHost(s.host) !== normalizeHost(serverToDelete?.host || "") ||
          s.port !== serverToDelete?.port,
      );
      saveServersToLocalStorage(updatedServers);

      const savedMetadata = loadSavedMetadata();
      delete savedMetadata[serverId];
      saveMetadataToLocalStorage(savedMetadata);

      const remainingServers = state.servers.filter(
        (server) => server.id !== serverId,
      );
      const newSelectedServerId =
        remainingServers.length > 0 ? remainingServers[0].id : null;

      const clearConnectionState =
        state.connectingServerId === serverId
          ? { isConnecting: false, connectingServerId: null }
          : {};

      return {
        servers: remainingServers,
        ...clearConnectionState,
        ui: {
          ...state.ui,
          selectedServerId: newSelectedServerId,
          selectedChannelId: newSelectedServerId
            ? remainingServers[0].channels[0]?.id || null
            : null,
        },
      };
    });
  },

  updateServer: (serverId, config) => {
    const savedServers = loadSavedServers();
    const serverIndex = savedServers.findIndex((s) => s.id === serverId);

    if (serverIndex !== -1) {
      savedServers[serverIndex] = { ...savedServers[serverIndex], ...config };
      saveServersToLocalStorage(savedServers);
    }
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

  toggleEditServerModal: (isOpen, serverId = null) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isEditServerModalOpen: isOpen ?? false,
        editServerId: serverId,
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

  toggleQuickActions: (isOpen) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isQuickActionsOpen:
          isOpen !== undefined ? isOpen : !state.ui.isQuickActionsOpen,
      },
    }));
  },

  requestChatInputFocus: () => {
    set((state) => ({
      ui: { ...state.ui, shouldFocusChatInput: true },
    }));
  },

  clearChatInputFocus: () => {
    set((state) => ({
      ui: { ...state.ui, shouldFocusChatInput: false },
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
        topicModalRequest: null,
      },
    }));
  },

  setTopicModalRequest: (serverId, channelId) => {
    set((state) => ({
      ui: {
        ...state.ui,
        topicModalRequest: { serverId, channelId },
      },
    }));
  },

  clearTopicModalRequest: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        topicModalRequest: null,
      },
    }));
  },

  setSettingsNavigation: (navigation) => {
    set((state) => ({
      ui: {
        ...state.ui,
        settingsNavigation: navigation,
      },
    }));
  },

  clearSettingsNavigation: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        settingsNavigation: null,
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
        isOpen !== undefined ? isOpen : !state.ui.isMemberListVisible;

      return {
        ui: {
          ...state.ui,
          isMemberListVisible: openState,
          mobileViewActiveColumn: state.ui.isNarrowView
            ? openState
              ? "memberList"
              : state.ui.mobileViewActiveColumn === "memberList"
                ? "chatView"
                : state.ui.mobileViewActiveColumn
            : state.ui.mobileViewActiveColumn,
        },
      };
    });

    const newState = get();
    const currentPrefs = newState.ui.sidebarPreferences || {
      channelList: { isVisible: true, width: 264 },
      memberList: { isVisible: true, width: 280 },
    };
    patchUISelections({
      sidebarPreferences: {
        ...currentPrefs,
        memberList: {
          ...currentPrefs.memberList,
          isVisible: newState.ui.isMemberListVisible,
        },
      },
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
        },
      };
    });

    const newState = get();
    const currentPrefs = newState.ui.sidebarPreferences || {
      channelList: { isVisible: true, width: 264 },
      memberList: { isVisible: true, width: 280 },
    };
    patchUISelections({
      sidebarPreferences: {
        ...currentPrefs,
        channelList: {
          ...currentPrefs.channelList,
          isVisible: newState.ui.isChannelListVisible,
        },
      },
    });
  },

  updateSidebarPreferences: (preferences) => {
    set((state) => {
      const currentPrefs = state.ui.sidebarPreferences || {
        channelList: { isVisible: true, width: 264 },
        memberList: { isVisible: true, width: 280 },
      };

      const newPrefs = {
        channelList: preferences.channelList || currentPrefs.channelList,
        memberList: preferences.memberList || currentPrefs.memberList,
      };

      patchUISelections({ sidebarPreferences: newPrefs });

      return {
        ui: { ...state.ui, sidebarPreferences: newPrefs },
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

  toggleServerMenu: (isOpen) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isServerMenuOpen:
          isOpen !== undefined ? isOpen : !state.ui.isServerMenuOpen,
      },
    }));
  },

  toggleTopicModal: (isOpen, context) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isTopicModalOpen: isOpen,
        topicModalContext: isOpen && context ? context : null,
      },
    }));
  },

  toggleUserProfileModalWithContext: (isOpen, context) => {
    set((state) => ({
      ui: {
        ...state.ui,
        isSettingsModalOpen: isOpen,
        userProfileModalContext: isOpen && context ? context : null,
      },
    }));
  },

  setChannelSettingsRequest: (serverId, channelId) => {
    set((state) => ({
      ui: {
        ...state.ui,
        channelSettingsRequest:
          serverId && channelId ? { serverId, channelId } : null,
      },
    }));
  },

  setInviteUserRequest: (serverId, channelId) => {
    set((state) => ({
      ui: {
        ...state.ui,
        inviteUserRequest:
          serverId && channelId ? { serverId, channelId } : null,
      },
    }));
  },

  openMedia: (url, sourceMsgId, serverId, channelId) => {
    get().stopActiveMedia();
    set((state) => ({
      ui: {
        ...state.ui,
        openedMedia: { url, sourceMsgId, serverId, channelId },
      },
    }));
  },

  openTopicMedia: (url, serverId, channelId) => {
    get().stopActiveMedia();
    set((state) => ({
      ui: {
        ...state.ui,
        openedMedia: { url, serverId, channelId, preferTopicEntry: true },
      },
    }));
  },

  openMediaExplorer: (serverId, channelId) => {
    get().stopActiveMedia();
    set((state) => ({
      ui: {
        ...state.ui,
        openedMedia: { url: "", serverId, channelId, preferLastEntry: true },
      },
    }));
  },

  closeMedia: () => {
    set((state) => ({ ui: { ...state.ui, openedMedia: null } }));
  },

  playMedia: (url, type, thumbnailUrl, msgid, serverId, channelId) => {
    set((state) => {
      const prev = state.ui.activeMedia;
      // Preserve isInlineVisible for the same URL so MiniMediaPlayer can resume
      // its hidden video when VideoPreview is unmounted (channel evicted).
      // New URLs always start inline-visible; VideoPreview will set it on mount.
      const isInlineVisible = prev?.url === url ? prev.isInlineVisible : true;
      return {
        ui: {
          ...state.ui,
          activeMedia: {
            url,
            type,
            thumbnailUrl,
            isPlaying: true,
            isInlineVisible,
            msgid,
            serverId,
            channelId,
          },
        },
      };
    });
  },

  pauseActiveMedia: () => {
    set((state) => {
      if (state.ui.activeMedia === null) return state;
      return {
        ui: {
          ...state.ui,
          activeMedia: { ...state.ui.activeMedia, isPlaying: false },
        },
      };
    });
  },

  stopActiveMedia: () => {
    set((state) => ({ ui: { ...state.ui, activeMedia: null } }));
  },

  setActiveMediaThumbnail: (url, thumbnailUrl) => {
    set((state) => {
      if (state.ui.activeMedia?.url !== url) return state;
      return {
        ui: {
          ...state.ui,
          activeMedia: { ...state.ui.activeMedia, thumbnailUrl },
        },
      };
    });
  },

  setMediaInlineVisible: (visible, currentTime) => {
    set((state) => {
      if (state.ui.activeMedia === null) return state;
      return {
        ui: {
          ...state.ui,
          activeMedia: {
            ...state.ui.activeMedia,
            isInlineVisible: visible,
            ...(currentTime !== undefined ? { currentTime } : {}),
          },
        },
      };
    });
  },

  toggleNotificationVolume: () => {
    set((state) => {
      const newVolume = state.globalSettings.notificationVolume > 0 ? 0 : 0.4;
      const newGlobalSettings = {
        ...state.globalSettings,
        notificationVolume: newVolume,
      };
      saveGlobalSettingsToLocalStorage(newGlobalSettings);
      return {
        globalSettings: newGlobalSettings,
      };
    });
  },

  setIsNarrowView: (isNarrow: boolean) => {
    set((state) => {
      if (state.ui.isNarrowView === isNarrow) return state;

      if (isNarrow) {
        const isResizingFromDesktop = !state.ui.isNarrowView;
        const shouldShowChat =
          isResizingFromDesktop &&
          state.ui.selectedServerId &&
          state.ui.mobileViewActiveColumn === "serverList";

        const activeColumn = shouldShowChat
          ? "chatView"
          : state.ui.mobileViewActiveColumn || "serverList";

        return {
          ui: {
            ...state.ui,
            isNarrowView: true,
            isChannelListVisible: false,
            isMemberListVisible: false,
            mobileViewActiveColumn: activeColumn,
          },
        };
      }

      return {
        ui: {
          ...state.ui,
          isNarrowView:
            typeof window !== "undefined"
              ? window.matchMedia(NARROW_VIEW_QUERY).matches
              : false,
          isChannelListVisible: true,
          isMemberListVisible: !window.matchMedia("(max-width: 1080px)")
            .matches,
        },
      };
    });
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
    // Dismiss mobile keyboard when navigating away
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    set((state) => ({
      ui: {
        ...state.ui,
        mobileViewActiveColumn: column,
        isMemberListVisible:
          state.ui.isNarrowView && column === "memberList"
            ? true
            : state.ui.isNarrowView && column !== "memberList"
              ? false
              : state.ui.isMemberListVisible,
      },
    }));
  },

  // Single source of truth for mobile navigation - syncs all related states
  setMobileView: (view: layoutColumn) => {
    set((state) => {
      const isNarrowView = state.ui.isNarrowView;
      if (!isNarrowView) return state;

      const updates = {
        serverList: {
          isChannelListVisible: true,
          isMemberListVisible: false,
        },
        chatView: {
          isChannelListVisible: false,
          isMemberListVisible: false,
        },
        memberList: {
          isChannelListVisible: false,
          isMemberListVisible: true,
        },
      }[view];

      return {
        ui: {
          ...state.ui,
          mobileViewActiveColumn: view,
          ...updates,
        },
      };
    });
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

  triggerServerShimmer: (serverId) => {
    set((state) => {
      const newShimmer = new Set(state.ui.serverShimmer);
      newShimmer.add(serverId);
      return {
        ui: {
          ...state.ui,
          serverShimmer: newShimmer,
        },
      };
    });
    // Clear shimmer after animation duration (e.g., 2 seconds)
    setTimeout(() => {
      get().clearServerShimmer(serverId);
    }, 2000);
  },

  clearServerShimmer: (serverId) => {
    set((state) => {
      const newShimmer = new Set(state.ui.serverShimmer);
      newShimmer.delete(serverId);
      return {
        ui: {
          ...state.ui,
          serverShimmer: newShimmer,
        },
      };
    });
  },

  updateGlobalSettings: (settings: Partial<GlobalSettings>) => {
    set((state) => {
      const newGlobalSettings = {
        ...state.globalSettings,
        ...settings,
      };
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
    if (!serverSupportsMetadata(serverId)) {
      return;
    }

    // Check if we've already requested metadata for this user
    const requestedUsers = get().userMetadataRequested[serverId] || new Set();
    if (requestedUsers.has(target)) {
      return; // Already requested
    }

    // Check if we already have metadata for this user (case-insensitive)
    const savedMetadata = loadSavedMetadata();
    const serverMetadata = savedMetadata[serverId];
    const targetLc = target.toLowerCase();
    const savedKey = serverMetadata
      ? Object.keys(serverMetadata).find((k) => k.toLowerCase() === targetLc)
      : undefined;
    if (savedKey && Object.keys(serverMetadata[savedKey]).length > 0) {
      // We already have metadata, mark as requested to avoid future requests
      set((state) => ({
        userMetadataRequested: {
          ...state.userMetadataRequested,
          [serverId]: new Set([
            ...(state.userMetadataRequested[serverId] || []),
            target,
          ]),
        },
      }));
      return; // No need to request
    }

    // Check if user is in any channel and has metadata there
    const server = get().servers.find((s) => s.id === serverId);
    if (server) {
      for (const channel of server.channels) {
        const user = channel.users.find(
          (u) => u.username.toLowerCase() === target.toLowerCase(),
        );
        if (user?.metadata && Object.keys(user.metadata).length > 0) {
          // We already have metadata, mark as requested
          set((state) => ({
            userMetadataRequested: {
              ...state.userMetadataRequested,
              [serverId]: new Set([
                ...(state.userMetadataRequested[serverId] || []),
                target,
              ]),
            },
          }));
          return; // No need to request
        }
      }
    }

    // Mark as requested and fetch metadata
    set((state) => ({
      userMetadataRequested: {
        ...state.userMetadataRequested,
        [serverId]: new Set([
          ...(state.userMetadataRequested[serverId] || []),
          target,
        ]),
      },
    }));

    ircClient.metadataList(serverId, target);
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

export default useStore;
registerAllHandlers(useStore);
