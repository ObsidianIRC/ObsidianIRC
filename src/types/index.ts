export interface User {
  id: string;
  username: string;
  avatar?: string;
  displayName?: string;
  account?: string;
  isOnline: boolean;
  status?: string;
  awaymsg?: string;
}

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  channels: Channel[];
  privateMessages?: User[];
  icon?: string;
  isConnected: boolean;
  users: User[];
  isupport: Record<
    string,
    string | string[] | Record<string, string | undefined>
  >;
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
}

export interface Message {
  id?: string;
  content: string;
  timestamp: Date;
  userId: string;
  channelId: string;
  serverId: string;
  type: "message" | "system" | "error" | "join" | "leave" | "nick";
  reacts: string[];
  replyMessage: Message | null | undefined;
  mentioned: string[];
}

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

export type ParsedValue =
  | string
  | Record<string, string | undefined>
  | string[];
