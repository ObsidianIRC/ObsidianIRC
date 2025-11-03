// UI Types
export type layoutColumn = "serverList" | "chatView" | "memberList";

export interface ConnectionDetails {
  name: string;
  host: string;
  port: string;
  nickname: string;
  ui?: {
    disableServerConnectionInfo?: boolean;
    hideServerInfo?: boolean;
    hideClose?: boolean;
    title?: string;
  };
}

export interface Attachment {
  id: string;
  type: "image";
  url: string;
  filename: string;
}

// Batch Event Types
export interface JoinBatchEvent {
  type: "JOIN";
  data: {
    serverId: string;
    username: string;
    channelName: string;
    account?: string;
    realname?: string;
  };
}

export interface QuitBatchEvent {
  type: "QUIT";
  data: {
    serverId: string;
    username: string;
    reason: string;
  };
}

export interface PartBatchEvent {
  type: "PART";
  data: {
    serverId: string;
    username: string;
    channelName: string;
    reason?: string;
  };
}

export type BatchEvent = JoinBatchEvent | QuitBatchEvent | PartBatchEvent;

export interface BatchInfo {
  type: string;
  parameters?: string[];
  events: BatchEvent[];
  startTime: Date;
}

// Storage Types
export type SavedMetadata = Record<
  string,
  Record<string, Record<string, { value: string; visibility: string }>>
>;

export type PinnedPrivateChatsMap = Record<
  string,
  Array<{ username: string; order: number }>
>;

export type ChannelOrderMap = Record<string, string[]>;

// Global Settings
export interface GlobalSettings {
  enableNotifications: boolean;
  notificationSound: string;
  enableNotificationSounds: boolean;
  notificationVolume: number;
  enableHighlights: boolean;
  sendTypingNotifications: boolean;
  showEvents: boolean;
  showNickChanges: boolean;
  showJoinsParts: boolean;
  showQuits: boolean;
  showKicks: boolean;
  customMentions: string[];
  ignoreList: string[];
  nickname: string;
  accountName: string;
  accountPassword: string;
  enableMultilineInput: boolean;
  multilineOnShiftEnter: boolean;
  autoFallbackToSingleLine: boolean;
  showSafeMedia: boolean;
  showExternalContent: boolean;
  enableMarkdownRendering: boolean;
}

// UI State
export interface UIState {
  selectedServerId: string | null;
  perServerSelections: Record<
    string,
    {
      selectedChannelId: string | null;
      selectedPrivateChatId: string | null;
    }
  >;
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
  inputAttachments: Attachment[];
  linkSecurityWarnings: Array<{ serverId: string; timestamp: number }>;
  isServerNoticesPopupOpen: boolean;
  serverNoticesPopupMinimized: boolean;
  profileViewRequest: { serverId: string; username: string } | null;
  serverShimmer?: Set<string>;
  modals: Record<string, { isOpen: boolean; props?: unknown }>;
  modalHistory: string[];
}

// Notification Types
export interface GlobalNotification {
  id: string;
  type: "fail" | "warn" | "note";
  command: string;
  code: string;
  message: string;
  target?: string;
  serverId: string;
  timestamp: Date;
}

// Channel List Types
export interface ChannelListEntry {
  channel: string;
  userCount: number;
  topic: string;
}

export interface ChannelListFilters {
  minUsers?: number;
  maxUsers?: number;
  minCreationTime?: number;
  maxCreationTime?: number;
  minTopicTime?: number;
  maxTopicTime?: number;
  mask?: string;
  notMask?: string;
}

export interface ChannelMetadata {
  avatar?: string;
  displayName?: string;
  fetchedAt: number;
}

// Metadata Types
export interface MetadataBatchMessage {
  target: string;
  key: string;
  visibility: string;
  value: string;
}

export interface MetadataBatch {
  type: string;
  messages: MetadataBatchMessage[];
}

// Account Registration
export interface PendingRegistration {
  serverId: string;
  account: string;
  email: string;
  password: string;
}

// Store slice interfaces will be defined in their respective slice files
// and combined to form the complete AppState
import type { ChannelSlice } from "./slices/channelSlice";
import type { IRCActionsSlice } from "./slices/ircActionsSlice";
import type { MessageSlice } from "./slices/messageSlice";
import type { MetadataSlice } from "./slices/metadataSlice";
import type { NotificationSlice } from "./slices/notificationSlice";
import type { PrivateChatSlice } from "./slices/privateChatSlice";
import type { ServerSlice } from "./slices/serverSlice";
import type { SettingsSlice } from "./slices/settingsSlice";
import type { UISlice } from "./slices/uiSlice";

// Combined app state type
export type AppState = SettingsSlice &
  NotificationSlice &
  UISlice &
  MessageSlice &
  PrivateChatSlice &
  ChannelSlice &
  MetadataSlice &
  ServerSlice &
  IRCActionsSlice;
