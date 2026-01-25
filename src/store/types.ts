export type layoutColumn = "serverList" | "chatView" | "memberList";

export interface ConnectionDetails {
  name: string;
  host: string;
  port: string;
  nickname: string;
  useIrcProtocol?: boolean;
  ui?: {
    disableServerConnectionInfo?: boolean;
    hideServerInfo?: boolean;
    hideClose?: boolean;
    title?: string;
  };
}

export type SavedMetadata = Record<
  string,
  Record<string, Record<string, { value: string; visibility: string }>>
>;

export type PinnedPrivateChatsMap = Record<
  string,
  Array<{ username: string; order: number }>
>;

export type ChannelOrderMap = Record<string, string[]>;

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
  awayMessage: string;
  quitMessage: string;
}

export interface UISelections {
  selectedServerId: string | null;
  perServerSelections: Record<
    string,
    { selectedChannelId: string | null; selectedPrivateChatId: string | null }
  >;
}
