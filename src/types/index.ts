export interface User {
  id: string;
  username: string;
  avatar?: string;
  isOnline: boolean;
  status?: "online" | "idle" | "dnd" | "invisible" | "offline";
}

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  channels: Channel[];
  icon?: string;
  isConnected: boolean;
  users: User[];
}

export interface ServerConfig {
  id: string;
  host: string;
  port: number;
  nickname: string;
  password?: string;
  channels: string[];
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
  id: string;
  content: string;
  timestamp: Date;
  userId: string;
  channelId: string;
  serverId: string;
  type: "message" | "system" | "error" | "join" | "leave" | "nick";
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
