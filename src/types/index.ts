export interface User {
  id: string;
  username: string;
  hostname?: string; // User's hostname from WHO or CHGHOST
  realname?: string; // User's real name/gecos field from WHO
  avatar?: string;
  displayName?: string;
  account?: string;
  isOnline: boolean;
  isAway?: boolean; // Whether user is marked as away (from WHO flags or AWAY notify)
  awayMessage?: string; // Away message if user is away
  status?: string;
  isBot?: boolean; // Bot detection from WHO response
  metadata?: Record<string, { value: string | undefined; visibility: string }>;
}

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  channels: Channel[];
  privateChats: PrivateChat[];
  icon?: string;
  isConnected: boolean;
  isAway?: boolean; // Whether we are marked as away on this server
  awayMessage?: string; // Our away message on this server
  users: User[];
  capabilities?: string[];
  metadata?: Record<string, { value: string | undefined; visibility: string }>;
  prefix?: string;
  botMode?: string;
  filehost?: string;
  linkSecurity?: number; // Link security level from unrealircd.org/link-security
  jwtToken?: string; // JWT token for filehost authentication
}

export interface ServerConfig {
  id: string;
  name?: string;
  host: string;
  port: number;
  nickname: string;
  password?: string | undefined;
  channels: string[];
  saslAccountName?: string;
  saslPassword?: string;
  saslEnabled: boolean;
  skipLinkSecurityWarning?: boolean;
  skipLocalhostWarning?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  topic?: string;
  isPrivate: boolean;
  serverId: string;
  unreadCount: number;
  isMentioned: boolean;
  messages: Message[];
  users: User[];
  isRead?: boolean;
  isLoadingHistory?: boolean;
  needsWhoRequest?: boolean;
  chathistoryRequested?: boolean;
  metadata?: Record<string, { value: string | undefined; visibility: string }>;
  modes?: string;
  modeArgs?: string[];
  bans?: Array<{ mask: string; setter: string; timestamp: number }>;
  invites?: Array<{ mask: string; setter: string; timestamp: number }>;
  exceptions?: Array<{ mask: string; setter: string; timestamp: number }>;
}

export interface PrivateChat {
  id: string;
  username: string;
  serverId: string;
  unreadCount: number;
  isMentioned: boolean;
  lastActivity?: Date;
  isPinned?: boolean;
  order?: number;
  isOnline?: boolean; // Tracked via MONITOR
  isAway?: boolean; // Tracked via extended-monitor + away-notify
  awayMessage?: string; // Away message from extended-monitor
  realname?: string; // Realname/gecos from WHO or extended-join
  account?: string; // Account name from WHOX
  isBot?: boolean; // Bot status from WHO/WHOX or message tags
}

export interface Reaction {
  emoji: string;
  userId: string;
}

export interface Message {
  id: string;
  msgid?: string; // IRC message ID from IRCv3 message-ids capability
  multilineMessageIds?: string[]; // For multiline messages: all message IDs that make up this message
  type:
    | "message"
    | "system"
    | "error"
    | "join"
    | "part"
    | "quit"
    | "kick"
    | "nick"
    | "leave"
    | "standard-reply"
    | "notice"
    | "netsplit"
    | "netjoin"
    | "mode"
    | "invite";
  content: string;
  timestamp: Date;
  userId: string;
  channelId: string;
  serverId: string;
  reactions: Reaction[];
  replyMessage: Message | null;
  mentioned: string[];
  tags?: Record<string, string>;
  // Whisper fields (for draft/channel-context)
  whisperTarget?: string; // The recipient of a whisper
  // Standard reply fields
  standardReplyType?: "FAIL" | "WARN" | "NOTE";
  standardReplyCommand?: string;
  standardReplyCode?: string;
  standardReplyTarget?: string;
  standardReplyMessage?: string;
  // Batch-related fields for netsplit/netjoin
  batchId?: string;
  quitUsers?: string[];
  server1?: string;
  server2?: string;
  // Invite fields
  inviteChannel?: string; // The channel being invited to
  inviteTarget?: string; // Who is being invited
  // Link preview fields
  linkPreviewUrl?: string;
  linkPreviewTitle?: string;
  linkPreviewSnippet?: string;
  linkPreviewMeta?: string; // URL to preview image/thumbnail
  // JSON log data for server notices
  jsonLogData?: JsonValue;
}

// Alias for backwards compatibility
export type MessageType = Message;

export interface SocketResponse {
  event: string;
  data: unknown;
  error?: string;
}

export interface CommandResponse {
  success: boolean;
  message: string;
  data?: unknown;
}

export type CommandHandler = (
  args: string[],
  channel: Channel,
  server: Server,
) => CommandResponse;

export interface Command {
  name: string;
  description: string;
  usage: string;
  handler: CommandHandler;
}

export type ISupportEvent = {
  serverId: string;
  capabilities: string[];
};

export type MessageTag = {
  key: string;
  value?: string;
};

// Base event interface that all IRC events extend
export interface BaseIRCEvent {
  serverId: string;
}

// Events that include message tags
export interface EventWithTags extends BaseIRCEvent {
  mtags: Record<string, string> | undefined;
}

// Base metadata event interface
export interface BaseMetadataEvent extends BaseIRCEvent {
  target: string;
  key: string;
}

// Metadata event with visibility and value
export interface MetadataValueEvent extends BaseMetadataEvent {
  visibility: string;
  value: string;
}

// Base message event interface
export interface BaseMessageEvent extends EventWithTags {
  sender: string;
  message: string;
  timestamp: Date;
}

// Base user action event interface
export interface BaseUserActionEvent extends BaseIRCEvent {
  username: string;
}

// JSON value type for handling arbitrary JSON data
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export interface WhoisData {
  nick: string;
  username?: string;
  host?: string;
  realname?: string;
  server?: string;
  serverInfo?: string;
  idle?: number;
  signon?: number;
  channels?: string;
  account?: string;
  specialMessages: string[]; // For 320, 378, 379 responses
  secureConnection?: string;
  timestamp: number; // When this data was fetched
  isComplete?: boolean; // Whether we've received WHOIS_END (318)
}
