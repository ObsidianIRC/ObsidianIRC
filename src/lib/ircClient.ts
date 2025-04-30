import { v4 as uuidv4 } from "uuid";
import type { Channel, Server, User } from "../types";
import { registerAllProtocolHandlers } from "./../protocol";
import { parseFavicon, parseMessageTags, parseNamesResponse } from "./ircUtils";

interface EventMap {
  ready: { serverId: string; serverName: string; nickname: string };
  NICK: {
    serverId: string;
    messageTags: string;
    oldNick: string;
    newNick: string;
  };
  QUIT: { serverId: string; username: string; reason: string };
  JOIN: { serverId: string; username: string; channelName: string };
  PART: {
    serverId: string;
    username: string;
    channelName: string;
    reason?: string;
  };
  KICK: {
    serverId: string;
    messageTags: string;
    username: string;
    channelName: string;
    target: string;
    reason: string;
  };
  PRIVMSG: {
    serverId: string;
    messageTags: Record<string, string>;
    sender: string;
    channelName: string;
    message: string;
    timestamp: Date;
  };
  TAGMSG: {
    serverId: string;
    messageTags: Record<string, string>;
    sender: string;
    channelName: string;
    timestamp: Date;
  };
  NAMES: { serverId: string; channelName: string; users: User[] };
  "CAP LS": { serverId: string; cliCaps: string };
  "CAP ACK": { serverId: string; cliCaps: string };
  ISUPPORT: { serverId: string; capabilities: string[] };
  CAP_ACKNOWLEDGED: { serverId: string; capabilities: string };
}

type EventKey = keyof EventMap;
type EventCallback<K extends EventKey> = (data: EventMap[K]) => void;

export class IRCClient {
  private sockets: Map<string, WebSocket> = new Map();
  private servers: Map<string, Server> = new Map();
  private currentUser: User | null = null;

  private eventCallbacks: {
    [K in EventKey]?: EventCallback<K>[];
  } = {};

  public preventCapEnd = false;
  public version = "1.0.0-beta";

  connect(
    host: string,
    port: number,
    nickname: string,
    password?: string,
    saslAccountName?: string | null,
    saslPassword?: string | null,
  ): Promise<Server> {
    return new Promise((resolve, reject) => {
      // for local testing and automated tests, if domain is localhost or 127.0.0.1 use ws instead of wss
      const protocol = ["localhost", "127.0.0.1"].includes(host) ? "ws" : "wss";
      const url = `${protocol}://${host}:${port}`;
      const socket = new WebSocket(url);

      socket.onopen = () => {

        registerAllProtocolHandlers(this);
        // Send IRC commands to register the user
        socket.send("CAP LS 302");
        socket.send(`NICK ${nickname}`);
        socket.send(`USER ${nickname} 0 * :${nickname}`);
        if (password) {
          socket.send(`PASS ${password}`);
        }

        const server: Server = {
          id: uuidv4(),
          name: host,
          host,
          port,
          channels: [],
          isConnected: true,
          users: [],
          privateMessages: [],
          icon: "",
        };

        this.servers.set(server.id, server);
        this.sockets.set(server.id, socket);
        this.currentUser = {
          id: uuidv4(),
          username: nickname,
          isOnline: true,
          status: "online",
        };

        socket.onclose = () => {
          console.log(`Disconnected from server ${host}`);
          this.sockets.delete(server.id);
        };

        resolve(server);
      };

      socket.onerror = (error) => {
        reject(new Error(`Failed to connect to ${host}:${port}: ${error}`));
      };

      socket.onmessage = (event) => {
        const serverId = Array.from(this.servers.keys()).find(
          (id) => this.sockets.get(id) === socket,
        );
        if (serverId) {
          this.handleMessage(event.data, serverId);
        }
      };
    });
  }

  disconnect(serverId: string): void {
    const socket = this.sockets.get(serverId);
    if (socket) {
      socket.send("QUIT :Client disconnecting");
      socket.close();
      this.sockets.delete(serverId);
    }
    this.servers.delete(serverId);
  }

  sendRaw(serverId: string, command: string): void {
    const socket = this.sockets.get(serverId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(command);
    } else {
      console.error(`Socket for server ${serverId} is not open`);
    }
  }

  joinChannel(serverId: string, channelName: string): Channel {
    const server = this.servers.get(serverId);
    if (server) {
      const existing = server.channels.find((c) => c.name === channelName);
      if (existing) return existing;

      this.sendRaw(serverId, `JOIN ${channelName}`);
      this.sendRaw(serverId, `CHATHISTORY LATEST ${channelName} * 100`);

      const channel: Channel = {
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
      server.channels.push(channel);
      return channel;
    }
    throw new Error(`Server with ID ${serverId} not found`);
  }

  leaveChannel(serverId: string, channelName: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      this.sendRaw(serverId, `PART ${channelName}`);
      server.channels = server.channels.filter((c) => c.name !== channelName);
    }
  }

  sendMessage(serverId: string, channelId: string, content: string): void {
    const server = this.servers.get(serverId);
    if (!server) throw new Error(`Server ${serverId} not found`);
    const channel = server.channels.find((c) => c.id === channelId);
    if (!channel) throw new Error(`Channel ${channelId} not found`);
    this.sendRaw(serverId, `PRIVMSG ${channel.name} :${content}`);
  }

  markChannelAsRead(serverId: string, channelId: string): void {
    const server = this.servers.get(serverId);
    const channel = server?.channels.find((c) => c.id === channelId);
    if (channel) channel.unreadCount = 0;
  }

  capAck(serverId: string, capabilities: string): void {
    this.triggerEvent("CAP_ACKNOWLEDGED", { serverId, capabilities });
  }

  private handleMessage(data: string, serverId: string): void {
    console.log(`IRC Message from serverId=${serverId}:`, data);

    const lines = data.split("\r\n");
    for (let line of lines) {
      line = line.trim();
      if (line.split(" ")[1] === "PING" || line.split(" ")[0] === "PING") {
        const key =
          line.split(" ")[0] === "PING"
            ? line.split(" ")[1]
            : line.split(" ")[2];
        this.sendRaw(serverId, `PONG ${key}`);
        console.log(`PONG sent to server ${serverId} with key ${key}`);
      } else if (line.includes(" 001 ")) {
        const match = line.match(/^(?:@[^ ]+ )?:([^ ]+)\s001\s([^ ]+)\s/);
        if (match) {
          const [, serverName, nickname] = match;
          this.triggerEvent("ready", { serverId, serverName, nickname });
        }
      } else if (line.split(" ")[2] === "NICK") {
        const match = line.match(/^(@[^ ]+ )?:([^!]+)![^@]+@[^ ]+ NICK (.+)$/);
        if (match) {
          const [, messageTags, oldNick, newNick] = match;
          this.triggerEvent("NICK", {
            serverId,
            messageTags,
            oldNick,
            newNick,
          });
        }
      } else if (line.split(" ")[2] === "QUIT") {
        const match = line.match(
          /^(?:@[^ ]+ )?:([^!]+)![^@]+@[^ ]+ QUIT :(.+)$/,
        );
        if (match) {
          const [, username, reason] = match;
          this.triggerEvent("QUIT", { serverId, username, reason });
        }
      } else if (line.split(" ")[2] === "JOIN") {
        const match = line.match(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: We want to match on \x07
          /^(?:@[^ ]+ )?:([^!]+)![^@]+@[^ ]+ JOIN :?([#&][^\s,\x07]{1,199})$/,
        );
        if (match) {
          const [, username, channelName] = match;
          this.triggerEvent("JOIN", { serverId, username, channelName });
        }
      } else if (line.split(" ")[2] === "PART") {
        const match = line.match(
          /^(?:@[^ ]+ )?:([^!]+)![^@]+@[^ ]+ PART ([^ ]+)(?: :(.+))?$/,
        );
        if (match) {
          const [, username, channelName, reason] = match;
          this.triggerEvent("PART", {
            serverId,
            username,
            channelName,
            reason,
          });
        }
      } else if (line.split(" ")[2] === "KICK") {
        const match = line.match(
          /^(@[^ ]+ )?:([^!]+)![^@]+@[^ ]+ KICK (.+) (.+) :(.+)$/,
        );
        if (match) {
          const [, messageTags, username, channelName, target, reason] = match;
          this.triggerEvent("KICK", {
            serverId,
            messageTags,
            username,
            channelName,
            target,
            reason,
          });
        }
      } else if (line.split(" ")[2] === "PRIVMSG") {
        const match = line.match(
          /^(@[^ ]+ )?:([^!]+)![^@]+@[^ ]+ PRIVMSG ([^ ]+) :(.+)$/,
        );
        if (match) {
          const [, mtags, sender, target, message] = match;
          const isChannel = target.startsWith("#");
          const channelName = isChannel ? target : sender;

          const messageTags = parseMessageTags(mtags);

          this.triggerEvent("PRIVMSG", {
            serverId,
            messageTags,
            sender,
            channelName,
            message,
            timestamp: new Date(),
          });
        }
      } else if (line.split(" ")[2] === "TAGMSG") {
        const match = line.match(
          /^(@[^ ]+ )?:([^!]+)![^@]+@[^ ]+ TAGMSG ([^ ]+)$/,
        );
        if (match) {
          const [, mtags, sender, target] = match;
          const isChannel = target.startsWith("#");
          const channelName = isChannel ? target : sender;

          const messageTags = parseMessageTags(mtags);

          this.triggerEvent("TAGMSG", {
            serverId,
            messageTags,
            sender,
            channelName,
            timestamp: new Date(),
          });
        }
      } else if (
        line.match(/^(?:@[^ ]+ )?:[^ ]+\s353\s[^ ]+\s[=|@|*]\s([^ ]+)\s:(.+)$/)
      ) {
        const match = line.match(
          /^(?:@[^ ]+ )?:[^ ]+\s353\s[^ ]+\s[=|@|*]\s([^ ]+)\s:(.+)$/,
        );
        if (match) {
          const [, channelName, names] = match;
          const newUsers = parseNamesResponse(names); // Parse the user list

          // Find the server and channel
          const server = this.servers.get(serverId);
          if (server) {
            const channel = server.channels.find((c) => c.name === channelName);
            if (channel) {
              // Merge new users with existing users
              const existingUsers = channel.users || [];
              const mergedUsers = [...existingUsers];

              for (const newUser of newUsers) {
                if (
                  !existingUsers.some(
                    (user) => user.username === newUser.username,
                  )
                ) {
                  mergedUsers.push(newUser);
                }
              }

              // Update the channel's user list
              channel.users = mergedUsers;

              // Trigger an event to notify the UI
              this.triggerEvent("NAMES", {
                serverId,
                channelName,
                users: mergedUsers,
              });
            }
          } else {
            console.warn(
              `Server ${serverId} not found while processing NAMES response`,
            );
          }
        }
      } else if (line.includes("CAP * LS")) {
        const match = line.match(
          /^(?:@\S+\s)?:(\S+)\sCAP\s\*\sLS\s(?:\*\s)?:(.+)$/,
        );
        if (match) {
          const [, , caps] = match;
          // Trigger an event to notify the UI
          this.triggerEvent("CAP LS", { serverId, cliCaps: caps });
        }
      } else if (line.match(/:[^ ]+ CAP (.*) ACK :(.*)/)) {
        const match = line.match(/:[^ ]+ CAP (.*) ACK :(.*)/);
        if (match) {
          const [, , caps] = match;
          // Trigger an event to notify the UI
          this.triggerEvent("CAP ACK", { serverId, cliCaps: caps });
        }
      } else if (line.split(" ")[1] === "005") {
        console.log("005 detected");
        const capabilities = parseFavicon(line);
        this.triggerEvent("ISUPPORT", { serverId, capabilities });
      } else if (line.includes("005")) {
        console.log("005 detected abnormally");
      }
    }
  }

  on<K extends EventKey>(event: K, callback: EventCallback<K>): void {
    if (!this.eventCallbacks[event]) {
      this.eventCallbacks[event] = [];
    }
    this.eventCallbacks[event]?.push(callback);
  }

  triggerEvent<K extends EventKey>(event: K, data: EventMap[K]): void {
    const cbs = this.eventCallbacks[event];
    if (!cbs) return;
    for (const cb of cbs) {
      cb(data);
    }
  }

  getServers(): Server[] {
    return Array.from(this.servers.values());
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }
}

export const ircClient = new IRCClient();
export default ircClient;
