import { v4 as uuidv4 } from "uuid";
import type { Channel, Server, User, ParsedValue } from "../types";
import {
  parseIsupport,
  parseMessageTags,
  parseNamesResponse,
  parseWhoxResponse,
} from "./ircUtils";

export interface EventMap {
  ready: { serverId: string; serverName: string; nickname: string };
  NICK: {
    serverId: string;
    mtags: Record<string, string> | undefined;
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
    mtags: Record<string, string> | undefined;
    username: string;
    channelName: string;
    target: string;
    reason: string;
  };
  CHANMSG: {
    serverId: string;
    mtags: Record<string, string> | undefined;
    sender: string;
    channelName: string;
    message: string;
    timestamp: Date;
  };
  USERMSG: {
    serverId: string;
    mtags: Record<string, string> | undefined;
    sender: string;
    message: string;
    timestamp: Date;
  };
  TAGMSG: {
    serverId: string;
    mtags: Record<string, string> | undefined;
    sender: string;
    channelName: string;
    timestamp: Date;
  };
  NAMES: { serverId: string; channelName: string; users: User[] };
  "CAP LS": { serverId: string; cliCaps: string };
  "CAP ACK": { serverId: string; cliCaps: string };
  ISUPPORT: { serverId: string; capabilities: string[] };
  CAP_ACKNOWLEDGED: { serverId: string; key: string; capabilities: string };
  CAP_END: { serverId: string };
  AUTHENTICATE: { serverId: string; param: string };
}

type EventKey = keyof EventMap;
type EventCallback<K extends EventKey> = (data: EventMap[K]) => void;

export class IRCClient {
  private sockets: Map<string, WebSocket> = new Map();
  private servers: Map<string, Server> = new Map();
  private nicks: Map<string, string> = new Map();
  private currentUser: User | null = null;

  private eventCallbacks: {
    [K in EventKey]?: EventCallback<K>[];
  } = {};

  public version = __APP_VERSION__;

  connect(
    host: string,
    port: number,
    nickname: string,
    password?: string,
    saslAccountName?: string,
    saslPassword?: string,
  ): Promise<Server> {
    return new Promise((resolve, reject) => {
      // for local testing and automated tests, if domain is localhost or 127.0.0.1 use ws instead of wss
      const protocol = ["localhost", "127.0.0.1"].includes(host) ? "ws" : "wss";
      const url = `${protocol}://${host}:${port}`;
      const socket = new WebSocket(url);

      socket.onopen = () => {
        //registerAllProtocolHandlers(this);
        // Send IRC commands to register the user
        if (password) {
          socket.send(`PASS ${password}`);
        }

        socket.send("CAP LS 302");

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
          isupport: {},
        };

        this.servers.set(server.id, server);
        this.sockets.set(server.id, socket);
        this.currentUser = {
          id: uuidv4(),
          username: nickname,
          isOnline: true,
          status: "online",
        };
        this.nicks.set(server.id, nickname);

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
      const existing = server.channels.find(
        (c) => c.name.toLowerCase().trim() === channelName.toLowerCase().trim(),
      );
      if (existing) {
        this.sendRaw(serverId, `WHO ${channelName} %ncfao`);
        this.sendRaw(serverId, `CHATHISTORY LATEST ${channelName} * 100`);
        return existing;
      }

      this.sendRaw(serverId, `JOIN ${channelName}`);
      const channel: Channel = {
        id: uuidv4(),
        name: channelName.trim(),
        topic: "",
        isPrivate: false,
        serverId,
        unreadCount: 0,
        isMentioned: false,
        messages: [],
        users: [],
      };
      server.channels.push(channel);
      this.sendRaw(serverId, `WHO ${channelName} %ncfao`);
      this.sendRaw(serverId, `CHATHISTORY LATEST ${channelName} * 100`);
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

  capAck(serverId: string, key: string, capabilities: string): void {
    this.triggerEvent("CAP_ACKNOWLEDGED", { serverId, key, capabilities });
  }

  capEnd(serverId: string) {}

  nickOnConnect(serverId: string) {
    const nickname = this.nicks.get(serverId);
    if (!nickname) {
      console.error(`No nickname found for serverId ${serverId}`);
      return;
    }
    this.sendRaw(serverId, `NICK ${nickname}`);
    this.sendRaw(serverId, `USER ${nickname} 0 * :${nickname}`);
  }

  private handleMessage(data: string, serverId: string): void {
    console.log(`IRC Message from serverId=${serverId}:`, data);

    const lines = data.split("\r\n");
    for (let line of lines) {
      let mtags: Record<string, string> | undefined;
      let source: string;
      const parv = [];
      let i = 0;
      let l: string[];
      line = line.trim();
      l = line.split(" ") ?? line;

      if (l[i][0] === "@") {
        mtags = parseMessageTags(l[i]);
        i++;
      }

      // Determine the source. if none, spoof as host server
      if (l[i][0] !== ":") {
        const thisServ = this.servers.get(serverId);
        const thisServName = thisServ?.name;
        if (!thisServName) {
          // something has gone horribly wrong
          console.error("No source, this will break parsing");
          return;
        }
        source = thisServName;
      } else {
        source = l[i].substring(1);
        i++;
      }

      const command = l[i];

      /* This goes and splits IRC lines properly and sets parv by the
       * trailing ":" argument.
       * For example, using the paramN from the following:
       * @tag=value :source COMMAND param1 param2 :param3 param4 param5
       *
       * We would extract for parv[]:
       * 0 = "param1"
       * 1 = "param2"
       * 2 = "param3 param4 param5"
       */
      for (i++; l[i]; i++) {
        if (l[i][0] === ":") {
          let lastParv = l[i].substring(1);
          if (l[i++]) lastParv += " ";
          while (l[i]) {
            lastParv += l[i];
            if (l[i++]) lastParv += " ";
          }
          parv.push(lastParv.trim());
          break;
        }
        parv.push(l[i]);
      }

      const parc = parv.length;

      if (command === "PING") {
        const key = parv.join(" ");
        this.sendRaw(serverId, `PONG ${key}`);
        console.log(`PONG sent to server ${serverId} with key ${key}`);
      } else if (command === "001") {
        const serverName = source;
        const nickname = parv.join(" ");
        this.triggerEvent("ready", { serverId, serverName, nickname });
      } else if (command === "NICK") {
        const oldNick = getNickFromNuh(source);
        const newNick = parv[0];

        // We changed our own nick
        if (oldNick === this.nicks.get(serverId))
          this.nicks.set(serverId, newNick);

        this.triggerEvent("NICK", {
          serverId,
          mtags,
          oldNick,
          newNick,
        });
      } else if (command === "QUIT") {
        const username = getNickFromNuh(source);
        const reason = parv.join(" ");
        this.triggerEvent("QUIT", { serverId, username, reason });
      } else if (command === "JOIN") {
        const username = getNickFromNuh(source);
        const channelName = parv[0];
        this.triggerEvent("JOIN", { serverId, username, channelName });
      } else if (command === "PART") {
        const username = getNickFromNuh(source);
        const channelName = parv[0];
        parv[0] = "";
        const reason = parv[1];
        this.triggerEvent("PART", {
          serverId,
          username,
          channelName,
          reason,
        });
      } else if (command === "KICK") {
        const username = getNickFromNuh(source);
        const channelName = parv[0];
        const target = parv[1];
        const reason = parv[2];
        this.triggerEvent("KICK", {
          serverId,
          mtags,
          username,
          channelName,
          target,
          reason,
        });
      } else if (command === "PRIVMSG") {
        const target = parv[0];
        const isChannel = target.startsWith("#");
        const sender = getNickFromNuh(source);

        parv[0] = "";
        const message = parv[1].trim();

        if (isChannel) {
          const channelName = target;
          this.triggerEvent("CHANMSG", {
            serverId,
            mtags,
            sender,
            channelName,
            message,
            timestamp: new Date(),
          });
        } else {
          this.triggerEvent("USERMSG", {
            serverId,
            mtags,
            sender,
            message,
            timestamp: new Date(),
          });
        }
      } else if (command === "TAGMSG") {
        const isChannel = parv[0].startsWith("#");
        const sender = getNickFromNuh(source);
        if (isChannel) {
          const channelName = parv[0];
          this.triggerEvent("TAGMSG", {
            serverId,
            mtags,
            sender,
            channelName,
            timestamp: new Date(),
          });
        }
      } else if (command === "353") {
        const channelName = parv[2];
        const names = parv[3];
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
          } else {
            console.warn(
              `Channel ${channelName} not found when processing NAMES response`,
            );
          }
        } else {
          console.warn(
            `Server ${serverId} not found while processing NAMES response`,
          );
        }
      } else if (command === "354") {
        const channelName = parv[1];
        const newUser = parseWhoxResponse(parv); // Parse the user list
        // Find the server and channel
        const server = this.servers.get(serverId);
        if (server) {
          const channel = server.channels.find(
            (c) =>
              c.name.toLowerCase().trim() === channelName.toLowerCase().trim(),
          );
          if (channel) {
            // Merge new users with existing users
            const existingUsers = channel.users || [];
            const mergedUsers = [...existingUsers];

            if (
              !existingUsers.some((user) => user.username === newUser.username)
            ) {
              mergedUsers.push(newUser);
            }

            // Update the channel's user list
            channel.users = mergedUsers;

            // Trigger an event to notify the UI
            this.triggerEvent("NAMES", {
              serverId,
              channelName,
              users: mergedUsers,
            });
          } else {
            console.warn(
              `Lol: Channel "${channelName}" not found when processing WHOX response`,
            );
          }
        } else {
          console.warn(
            `Lol: Server ${serverId} not found while processing WHOX response`,
          );
        }
      } else if (command === "CAP") {
        const subcommand = parv[1];
        const caps = parv[parv.length - 1];
        if (subcommand === "LS") this.onCapLs(serverId, caps);
        else if (subcommand === "ACK")
          this.triggerEvent("CAP ACK", { serverId, cliCaps: caps });
      } else if (command === "005") {
        console.log("005 detected");
        const capabilities = parseIsupport(line);
        const parv2 = [];
        for (let i = 1; i <= parv.length - 2; i++) parv2.push(parv[i]);

        const parsedTokens = this.parseISupportTokens(parv2);
        const server = this.servers.get(serverId);
        if (server) {
          server.isupport = { ...server.isupport, ...parsedTokens };
        } else {
          console.warn(
            `Server with ID ${serverId} not found while updating isupport`,
          );
        }

        this.triggerEvent("ISUPPORT", { serverId, capabilities });
      } else if (command === "AUTHENTICATE") {
        const param = parv.join(" ");
        this.triggerEvent("AUTHENTICATE", { serverId, param });
      }
    }
  }

  parseISupportTokens(tokens: string[]): Record<string, ParsedValue> {
    const result: Record<string, ParsedValue> = {};

    for (const token of tokens) {
      const [key, rawValue] = token.split("=", 2);

      // No '=' means it's just a flag with true
      if (rawValue === undefined) {
        result[key] = true.toString();
        continue;
      }

      // Handle comma-separated values
      if (rawValue.includes(",")) {
        const items = rawValue.split(",");
        const hasColon = items.some((item) => item.includes(":"));

        if (hasColon) {
          const map: Record<string, string | undefined> = {};
          for (const item of items) {
            const [k, v] = item.split(":", 2);
            map[k] = v;
          }
          result[key] = map;
        } else {
          result[key] = items;
        }
      } else if (rawValue.includes(":")) {
        // Handle single key:value pair
        const [subKey, subValue] = rawValue.split(":", 2);
        result[key] = { [subKey]: subValue };
      } else {
        result[key] = rawValue;
      }
    }

    return result;
  }

  parseChannelMode(
    serverId: string,
    parv: string[],
  ): Record<string, Record<string, string | undefined>> | undefined {
    const server = this.servers.get(serverId);
    const target = parv[0];
    const modes = parv[1];
    let set = true;
    let i = 2; // start from any potential param in parv[]
    const record = {} as Record<string, Record<string, string | undefined>>;
    const toSet = {} as Record<string, string | undefined>;
    const toUnset = {} as Record<string, string | undefined>;

    for (let j = 0; modes[j]; j++) {
      if (modes[j] === "+") {
        set = true;
        continue;
      }
      if (modes[j] === "-") {
        set = false;
        continue;
      }
      const needParam = this.chanModeRequiresParam(serverId, set, modes[j]);
      const param = needParam ? parv[i++] : undefined;
      if (set) {
        toSet[modes[j]] = param;
      } else {
        toUnset[modes[j]] = param;
      }

      record.set = toSet;
      record.unset = toUnset;
      return record;
    }
  }

  private chanModeRequiresParam(
    serverId: string,
    set: boolean,
    mode: string,
  ): boolean {
    const group = this.getChanModeGroupNumber(serverId, mode);
    if (group < 1) return false;

    if (set) {
      if (group >= 1 && group <= 3) return true;
      return false;
    }
    if (group === 1 || group === 2) return true;
    return false;
  }

  private getChanModeGroupNumber(serverId: string, mode: string): number {
    const server = this.servers.get(serverId);
    if (!server || !server.isupport) return -1; // panties were shat

    for (const [key, value] of Object.entries(server.isupport)) {
      if (key === "CHANMODES") {
        for (const [key2, value2] of Object.entries(value)) {
          if (value2?.includes(mode)) return Number.parseInt(key2, 10) + 1;
        }
      }
    }

    return -1;
  }

  /* Send SASL plain */
  sendSaslPlain(serverId: string, username: string, password: string) {
    this.sendRaw(
      serverId,
      `AUTHENTICATE ${btoa(`${username}\x00${username}\x00${password}`)}`,
    );
  }

  onCapLs(serverId: string, cliCaps: string): void {
    const ourCaps = [
      "multi-prefix",
      "message-tags",
      "server-time",
      "echo-message",
      "message-tags",
      "userhost-in-names",
      "draft/chathistory",
      "draft/extended-isupport",
      "sasl",
      "away-notify",
      "draft/no-implicit-names",
    ];

    const caps = cliCaps.split(" ");
    let toRequest = "CAP REQ :";
    for (const c of caps) {
      const cap = c.includes("=") ? c.split("=")[0] : c;
      if (ourCaps.includes(cap)) {
        if (toRequest.length + cap.length + 1 > 400) {
          this.sendRaw(serverId, toRequest);
          toRequest = "CAP REQ :";
        }
        toRequest += `${cap} `;
        console.log(`Requesting capability: ${cap}`);
      }
    }
    if (toRequest.length > 9) {
      this.sendRaw(serverId, toRequest);
      if (toRequest.includes("draft/extended-isupport"))
        this.sendRaw(serverId, "ISUPPORT");
    }
    console.log(`Server ${serverId} supports capabilities: ${cliCaps}`);
  }

  on<K extends EventKey>(event: K, callback: EventCallback<K>): void {
    if (!this.eventCallbacks[event]) {
      this.eventCallbacks[event] = [];
    }
    this.eventCallbacks[event]?.push(callback);
  }

  deleteHook<K extends EventKey>(event: K, callback: EventCallback<K>): void {
    const cbs = this.eventCallbacks[event];
    if (!cbs) return;
    const index = cbs.indexOf(callback);
    if (index !== -1) {
      cbs.splice(index, 1);
    }
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

function getNickFromNuh(nuh: string) {
  return nuh.substring(0, nuh.indexOf("!"));
}

export const ircClient = new IRCClient();

export default ircClient;
