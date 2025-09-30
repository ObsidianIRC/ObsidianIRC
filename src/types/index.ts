export interface User {
  id: string;
  username: string;
  avatar?: string;
  displayName?: string;
  account?: string;
  isOnline: boolean;
  status?: string;
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
  users: User[];
  capabilities?: string[];
  metadata?: Record<string, { value: string | undefined; visibility: string }>;
  prefix?: string;
  botMode?: string;
}
export interface ServerConfig {
  id: string;
  host: string;
  port: number;
  nickname: string;
  password?: string | undefined;
  channels: string[];
  saslAccountName?: string;
  saslPassword?: string;
  saslEnabled: boolean;
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
  metadata?: Record<string, { value: string | undefined; visibility: string }>;
}

export interface PrivateChat {
  id: string;
  username: string;
  serverId: string;
  unreadCount: number;
  isMentioned: boolean;
  lastActivity?: Date;
}

export interface Reaction {
  emoji: string;
  userId: string;
}

export interface Message {
  id?: string;
  msgid?: string;
  content: string;
  timestamp: Date;
  userId: string;
  channelId: string;
  serverId: string;
  type:
    | "message"
    | "system"
    | "error"
    | "join"
    | "leave"
    | "nick"
    | "standard-reply";
  reactions: Reaction[];
  replyMessage: Message | null | undefined;
  mentioned: string[];
  tags?: Record<string, string>;
  // Standard reply fields
  standardReplyType?: "FAIL" | "WARN" | "NOTE";
  standardReplyCommand?: string;
  standardReplyCode?: string;
  standardReplyTarget?: string;
  standardReplyMessage?: string;
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
