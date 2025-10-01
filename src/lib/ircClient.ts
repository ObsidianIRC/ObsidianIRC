import { v4 as uuidv4 } from "uuid";
import type {
  BaseIRCEvent,
  BaseMessageEvent,
  BaseMetadataEvent,
  BaseUserActionEvent,
  Channel,
  EventWithTags,
  MetadataValueEvent,
  Server,
  User,
} from "../types";
import {
  parseIsupport,
  parseMessageTags,
  parseNamesResponse,
} from "./ircUtils";

export interface EventMap {
  ready: BaseIRCEvent & { serverName: string; nickname: string };
  NICK: EventWithTags & {
    oldNick: string;
    newNick: string;
  };
  QUIT: BaseUserActionEvent & { reason: string; batchTag?: string };
  JOIN: BaseUserActionEvent & { channelName: string; batchTag?: string };
  PART: BaseUserActionEvent & {
    channelName: string;
    reason?: string;
  };
  KICK: EventWithTags & {
    username: string;
    channelName: string;
    target: string;
    reason: string;
  };
  CHANMSG: BaseMessageEvent & {
    channelName: string;
  };
  USERMSG: BaseMessageEvent;
  CHANNNOTICE: BaseMessageEvent & {
    channelName: string;
  };
  USERNOTICE: BaseMessageEvent;
  TAGMSG: EventWithTags & {
    sender: string;
    channelName: string;
    timestamp: Date;
  };
  REDACT: EventWithTags & {
    target: string;
    msgid: string;
    reason: string;
    sender: string;
  };
  NAMES: BaseIRCEvent & { channelName: string; users: User[] };
  "CAP LS": BaseIRCEvent & { cliCaps: string };
  "CAP ACK": BaseIRCEvent & { cliCaps: string };
  ISUPPORT: BaseIRCEvent & { key: string; value: string };
  CAP_ACKNOWLEDGED: BaseIRCEvent & { key: string; capabilities: string };
  CAP_END: BaseIRCEvent;
  AUTHENTICATE: BaseIRCEvent & { param: string };
  METADATA: MetadataValueEvent;
  METADATA_WHOIS: MetadataValueEvent;
  METADATA_KEYVALUE: MetadataValueEvent;
  METADATA_KEYNOTSET: BaseMetadataEvent;
  METADATA_SUBOK: BaseIRCEvent & { keys: string[] };
  METADATA_UNSUBOK: BaseIRCEvent & { keys: string[] };
  METADATA_SUBS: BaseIRCEvent & { keys: string[] };
  METADATA_SYNCLATER: BaseIRCEvent & { target: string; retryAfter?: number };
  BATCH_START: BaseIRCEvent & {
    batchId: string;
    type: string;
    parameters?: string[];
  };
  BATCH_END: BaseIRCEvent & { batchId: string };
  METADATA_FAIL: BaseIRCEvent & {
    subcommand: string;
    code: string;
    target?: string;
    key?: string;
    retryAfter?: number;
  };
  LIST_CHANNEL: {
    serverId: string;
    channel: string;
    userCount: number;
    topic: string;
  };
  LIST_END: { serverId: string };
  RENAME: {
    serverId: string;
    oldName: string;
    newName: string;
    reason: string;
    user: string;
  };
  SETNAME: { serverId: string; user: string; realname: string };
  FAIL: EventWithTags & {
    command: string;
    code: string;
    target?: string;
    message: string;
  };
  WARN: EventWithTags & {
    command: string;
    code: string;
    target?: string;
    message: string;
  };
  NOTE: EventWithTags & {
    command: string;
    code: string;
    target?: string;
    message: string;
  };
  SUCCESS: EventWithTags & {
    command: string;
    code: string;
    target?: string;
    message: string;
  };
  REGISTER_SUCCESS: EventWithTags & {
    account: string;
    message: string;
  };
  REGISTER_VERIFICATION_REQUIRED: EventWithTags & {
    account: string;
    message: string;
  };
  VERIFY_SUCCESS: EventWithTags & {
    account: string;
    message: string;
  };
  WHO_REPLY: {
    serverId: string;
    channel: string;
    username: string;
    host: string;
    server: string;
    nick: string;
    flags: string;
    hopcount: string;
    realname: string;
  };
  WHO_END: { serverId: string; mask: string };
  WHOIS_BOT: {
    serverId: string;
    nick: string;
    target: string;
    message: string;
  };
  NICK_ERROR: {
    serverId: string;
    code: string;
    error: string;
    nick?: string;
    message: string;
  };
}

type EventKey = keyof EventMap;
type EventCallback<K extends EventKey> = (data: EventMap[K]) => void;

export class IRCClient {
  private sockets: Map<string, WebSocket> = new Map();
  private servers: Map<string, Server> = new Map();
  private nicks: Map<string, string> = new Map();
  private currentUsers: Map<string, User | null> = new Map(); // Per-server current users
  private saslMechanisms: Map<string, string[]> = new Map();
  private capLsAccumulated: Map<string, Set<string>> = new Map();
  private saslEnabled: Map<string, boolean> = new Map();
  private pendingConnections: Map<string, Promise<Server>> = new Map();

  private eventCallbacks: {
    [K in EventKey]?: EventCallback<K>[];
  } = {};

  public version = __APP_VERSION__;

  connect(
    host: string,
    port: number,
    nickname: string,
    password?: string,
    _saslAccountName?: string,
    _saslPassword?: string,
    serverId?: string,
  ): Promise<Server> {
    const connectionKey = `${host}:${port}`;

    // Check if there's already a pending connection to this server
    const existingConnection = this.pendingConnections.get(connectionKey);
    if (existingConnection) {
      return existingConnection;
    }

    // Check if already connected to this server
    const existingServer = Array.from(this.servers.values()).find(
      (server) => server.host === host && server.port === port,
    );
    if (existingServer) {
      return Promise.resolve(existingServer);
    }

    // Create a new connection promise and store it
    const connectionPromise = new Promise<Server>((resolve, reject) => {
      // for local testing and automated tests, if domain is localhost or 127.0.0.1 use ws instead of wss
      const protocol = ["localhost", "127.0.0.1"].includes(host) ? "ws" : "wss";
      const url = `${protocol}://${host}:${port}`;

      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (error) {
        reject(new Error(`Failed to connect to ${host}:${port}`));
        return;
      }

      // Create server object immediately and add to servers map
      const server: Server = {
        id: serverId || uuidv4(),
        name: host,
        host,
        port,
        channels: [],
        privateChats: [],
        isConnected: false, // Not connected yet
        users: [],
      };
      this.servers.set(server.id, server);
      this.sockets.set(server.id, socket);
      this.saslEnabled.set(server.id, !!_saslAccountName);
      this.currentUsers.set(server.id, {
        id: uuidv4(),
        username: nickname,
        isOnline: true,
        status: "online",
      });
      this.nicks.set(server.id, nickname);

      socket.onopen = () => {
        //registerAllProtocolHandlers(this);
        // Send IRC commands to register the user
        if (password) {
          socket.send(`PASS ${password}`);
        }

        socket.send("CAP LS 302");
        socket.send(`NICK ${nickname}`);

        // Update server to mark as connected
        server.isConnected = true;

        socket.onclose = () => {
          console.log(`Disconnected from server ${host}`);
          this.sockets.delete(server.id);
          server.isConnected = false;
          this.pendingConnections.delete(connectionKey);
        };

        resolve(server);
      };

      socket.onerror = (error) => {
        // Clean up failed connection
        this.servers.delete(server.id);
        this.sockets.delete(server.id);
        this.pendingConnections.delete(connectionKey);
        reject(new Error(`Failed to connect to ${host}:${port}`));
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

    // Store the pending connection
    this.pendingConnections.set(connectionKey, connectionPromise);

    // Clean up the pending connection when it resolves or rejects
    connectionPromise.finally(() => {
      this.pendingConnections.delete(connectionKey);
    });

    return connectionPromise;
  }

  disconnect(serverId: string): void {
    const socket = this.sockets.get(serverId);
    if (socket) {
      socket.send("QUIT :ObsidianIRC - Bringing IRC into the future");
      socket.close();
      this.sockets.delete(serverId);
    }
    const server = this.servers.get(serverId);
    if (server) {
      server.isConnected = false;
      const connectionKey = `${server.host}:${server.port}`;
      this.pendingConnections.delete(connectionKey);
    }
  }

  sendRaw(serverId: string, command: string): void {
    const socket = this.sockets.get(serverId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      // Log metadata and command-related outgoing messages for debugging
      if (command.startsWith("METADATA") || command.startsWith("/")) {
        console.log(`[IRC] Sending: ${command}`);
      }
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
      this.sendRaw(serverId, `WHO ${channelName}`);

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

  sendTyping(serverId: string, target: string, isActive: boolean): void {
    const typingState = isActive ? "active" : "done";
    this.sendRaw(serverId, `@+typing=${typingState} TAGMSG ${target}`);
  }

  sendRedact(
    serverId: string,
    target: string,
    msgid: string,
    reason?: string,
  ): void {
    const command = reason
      ? `REDACT ${target} ${msgid} :${reason}`
      : `REDACT ${target} ${msgid}`;
    this.sendRaw(serverId, command);
  }

  registerAccount(
    serverId: string,
    account: string,
    email: string,
    password: string,
  ): void {
    this.sendRaw(serverId, `REGISTER ${account} ${email} ${password}`);
  }

  verifyAccount(serverId: string, account: string, code: string): void {
    this.sendRaw(serverId, `VERIFY ${account} ${code}`);
  }

  listChannels(serverId: string): void {
    this.sendRaw(serverId, "LIST");
  }

  renameChannel(
    serverId: string,
    oldName: string,
    newName: string,
    reason?: string,
  ): void {
    const command = reason
      ? `RENAME ${oldName} ${newName} :${reason}`
      : `RENAME ${oldName} ${newName}`;
    this.sendRaw(serverId, command);
  }

  setName(serverId: string, realname: string): void {
    this.sendRaw(serverId, `SETNAME :${realname}`);
  }

  changeNick(serverId: string, newNick: string): void {
    this.sendRaw(serverId, `NICK ${newNick}`);
  }

  // Metadata commands
  metadataGet(serverId: string, target: string, keys: string[]): void {
    const keysStr = keys.join(" ");
    this.sendRaw(serverId, `METADATA ${target} GET ${keysStr}`);
  }

  metadataList(serverId: string, target: string): void {
    this.sendRaw(serverId, `METADATA ${target} LIST`);
  }

  metadataSet(
    serverId: string,
    target: string,
    key: string,
    value?: string,
    visibility?: string,
  ): void {
    // Use the provided target. If it's "*" or the current user's nickname, use "*"
    // Otherwise use the provided target (for channels, other users if admin, etc.)
    const currentNick = this.getNick(serverId);
    const actualTarget =
      target === "*" || target === currentNick ? "*" : target;
    const command =
      value !== undefined && value !== ""
        ? `METADATA ${actualTarget} SET ${key} :${value}`
        : `METADATA ${actualTarget} SET ${key}`;
    console.log(`[IRC] Sending metadata SET command: ${command}`);
    this.sendRaw(serverId, command);
  }

  metadataClear(serverId: string, target: string): void {
    this.sendRaw(serverId, `METADATA ${target} CLEAR`);
  }

  metadataSub(serverId: string, keys: string[]): void {
    // Send individual SUB commands for each key to avoid parsing issues
    keys.forEach((key) => {
      const command = `METADATA * SUB ${key}`;
      console.log(`[IRC] Sending metadata subscription command: ${command}`);
      this.sendRaw(serverId, command);
    });
  }

  metadataUnsub(serverId: string, keys: string[]): void {
    const keysStr = keys.join(" ");
    this.sendRaw(serverId, `METADATA * UNSUB ${keysStr}`);
  }

  metadataSubs(serverId: string): void {
    this.sendRaw(serverId, "METADATA * SUBS");
  }

  metadataSync(serverId: string, target: string): void {
    this.sendRaw(serverId, `METADATA ${target} SYNC`);
  }

  markChannelAsRead(serverId: string, channelId: string): void {
    const server = this.servers.get(serverId);
    const channel = server?.channels.find((c) => c.id === channelId);
    if (channel) channel.unreadCount = 0;
  }

  capAck(serverId: string, key: string, capabilities: string): void {
    this.triggerEvent("CAP_ACKNOWLEDGED", { serverId, key, capabilities });
  }

  capEnd(_serverId: string) {}

  getNick(serverId: string): string | undefined {
    return this.nicks.get(serverId);
  }

  userOnConnect(serverId: string) {
    const nickname = this.nicks.get(serverId);
    if (!nickname) {
      console.error(`No nickname found for serverId ${serverId}`);
      return;
    }
    // NICK is already sent before CAP negotiation, only send USER now
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
          console.log("No source, this will break parsing");
          return;
        }
        source = thisServName;
      } else {
        source = l[i].substring(1);
        i++;
      }

      const command = l[i];
      for (i++; l[i]; i++) {
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
        console.log("triggered nickchange");
        const oldNick = getNickFromNuh(source);
        let newNick = parv[0];

        // Remove leading colon if present
        if (newNick.startsWith(":")) {
          newNick = newNick.substring(1);
        }

        // We changed our own nick
        if (oldNick === this.nicks.get(serverId)) {
          this.nicks.set(serverId, newNick);
          // Update current user's username for this server
          const currentUser = this.currentUsers.get(serverId);
          if (currentUser) {
            this.currentUsers.set(serverId, {
              ...currentUser,
              username: newNick,
            });
          }
        }

        console.log(oldNick, newNick, this.nicks);
        this.triggerEvent("NICK", {
          serverId,
          mtags,
          oldNick,
          newNick,
        });
      } else if (command === "QUIT") {
        const username = getNickFromNuh(source);
        const reason = parv.join(" ");
        this.triggerEvent("QUIT", {
          serverId,
          username,
          reason,
          batchTag: mtags?.batch,
        });
      } else if (command === "JOIN") {
        const username = getNickFromNuh(source);
        const channelName = parv[0][0] === ":" ? parv[0].substring(1) : parv[0];
        this.triggerEvent("JOIN", {
          serverId,
          username,
          channelName,
          batchTag: mtags?.batch,
        });
      } else if (command === "PART") {
        const username = getNickFromNuh(source);
        const channelName = parv[0];
        parv[0] = "";
        const reason = parv.join(" ").trim();
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
        parv[0] = "";
        parv[1] = "";
        const reason = parv.join(" ").trim().substring(1);
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
        const message = parv.join(" ").trim().substring(1);

        if (isChannel) {
          const channelName = target;
          this.triggerEvent("CHANMSG", {
            serverId,
            mtags,
            sender,
            channelName,
            message,
            timestamp: getTimestampFromTags(mtags),
          });
        } else {
          this.triggerEvent("USERMSG", {
            serverId,
            mtags,
            sender,
            message,
            timestamp: getTimestampFromTags(mtags),
          });
        }
      } else if (command === "NOTICE") {
        const target = parv[0];
        const isChannel = target.startsWith("#");
        const sender = getNickFromNuh(source);

        parv[0] = "";
        const message = parv.join(" ").trim().substring(1);

        if (isChannel) {
          const channelName = target;
          this.triggerEvent("CHANNNOTICE", {
            serverId,
            mtags,
            sender,
            channelName,
            message,
            timestamp: getTimestampFromTags(mtags),
          });
        } else {
          this.triggerEvent("USERNOTICE", {
            serverId,
            mtags,
            sender,
            message,
            timestamp: getTimestampFromTags(mtags),
          });
        }
      } else if (command === "TAGMSG") {
        const rawTarget = parv[0] || "";
        const target = rawTarget.startsWith(":")
          ? rawTarget.substring(1)
          : rawTarget;
        const sender = getNickFromNuh(source);
        this.triggerEvent("TAGMSG", {
          serverId,
          mtags,
          sender,
          channelName: target,
          timestamp: getTimestampFromTags(mtags),
        });
      } else if (command === "REDACT") {
        const target = parv[0];
        const msgid = parv[1];
        const reason = parv[2] ? parv[2].substring(1) : ""; // Remove leading :
        const sender = getNickFromNuh(source);
        this.triggerEvent("REDACT", {
          serverId,
          mtags,
          target,
          msgid,
          reason,
          sender,
        });
      } else if (command === "RENAME") {
        const user = getNickFromNuh(source);
        const oldName = parv[0];
        const newName = parv[1];
        const reason = parv.slice(2).join(" ").substring(1); // Remove leading :
        this.triggerEvent("RENAME", {
          serverId,
          oldName,
          newName,
          reason,
          user,
        });
      } else if (command === "SETNAME") {
        const user = getNickFromNuh(source);
        const realname = parv.join(" ").substring(1); // Remove leading :
        this.triggerEvent("SETNAME", {
          serverId,
          user,
          realname,
        });
      } else if (command === "353") {
        const channelName = parv[2];
        const names = parv.slice(3).join(" ").trim().substring(1);
        console.log(names);
        const newUsers = parseNamesResponse(names); // Parse the user list
        console.log(newUsers);

        // Trigger an event to notify the UI
        this.triggerEvent("NAMES", {
          serverId,
          channelName,
          users: newUsers,
        });
      } else if (command === "CAP") {
        let i = 0;
        let caps = "";
        if (parv[i] === "*") i++;
        let subcommand = parv[i++];
        // Handle CAP ACK which has nickname before subcommand
        if (
          subcommand !== "LS" &&
          subcommand !== "ACK" &&
          subcommand !== "NEW" &&
          subcommand !== "DEL" &&
          subcommand !== "NAK"
        ) {
          // This is likely a nickname, skip it and get the real subcommand
          subcommand = parv[i++];
        }
        const isFinal = subcommand === "LS" && parv[i] !== "*";
        if (parv[i] === "*") i++;
        parv[i] = parv[i].substring(1); // trim the ":" lol
        while (parv[i]) {
          caps += parv[i++];
          if (parv[i]) caps += " ";
        }

        if (subcommand === "LS") this.onCapLs(serverId, caps, isFinal);
        else if (subcommand === "ACK")
          this.triggerEvent("CAP ACK", { serverId, cliCaps: caps });
        else if (subcommand === "NEW") this.onCapNew(serverId, caps);
        else if (subcommand === "DEL") this.onCapDel(serverId, caps);
      } else if (command === "005") {
        const capabilities = parseIsupport(parv.join(" "));
        console.log("ISUPPORT capabilities:", capabilities);
        for (const [key, value] of Object.entries(capabilities)) {
          if (key === "NETWORK") {
            const server = this.servers.get(serverId);
            if (server) {
              server.name = value;
              this.servers.set(serverId, server);
            }
            console.log(
              `Network name set to: ${this.servers.get(serverId)?.name}`,
            );
          }
          this.triggerEvent("ISUPPORT", { serverId, key, value });
        }
      } else if (command === "AUTHENTICATE") {
        const param = parv.join(" ");
        this.triggerEvent("AUTHENTICATE", { serverId, param });
      } else if (command === "BATCH") {
        // BATCH +reference-tag type [parameters...] or BATCH -reference-tag
        const batchRef = parv[0];
        const isStart = batchRef.startsWith("+");
        const batchId = batchRef.substring(1); // Remove + or -

        if (isStart) {
          const batchType = parv[1];
          const parameters = parv.slice(2);
          console.log(
            `[IRC] Starting batch: id=${batchId}, type=${batchType}, params=${parameters.join(" ")}`,
          );
          this.triggerEvent("BATCH_START", {
            serverId,
            batchId,
            type: batchType,
            parameters,
          });
        } else {
          console.log(`[IRC] Ending batch: id=${batchId}`);
          this.triggerEvent("BATCH_END", {
            serverId,
            batchId,
          });
        }
      } else if (command === "METADATA") {
        const target = parv[0];
        const key = parv[1];
        const visibility = parv[2];
        const value = parv.slice(3).join(" ");
        // Remove leading : only if it exists
        const cleanValue = value.startsWith(":") ? value.substring(1) : value;
        console.log(
          `[IRC] Received METADATA: target=${target}, key=${key}, visibility=${visibility}, value=${cleanValue}`,
        );
        this.triggerEvent("METADATA", {
          serverId,
          target,
          key,
          visibility,
          value: cleanValue,
        });
      } else if (command === "760") {
        // RPL_WHOISKEYVALUE
        // RPL_WHOISKEYVALUE <Target> <Key> <Visibility> :<Value>
        const target = parv[0];
        const key = parv[1];
        const visibility = parv[2];
        const value = parv.slice(3).join(" ").substring(1);
        this.triggerEvent("METADATA_WHOIS", {
          serverId,
          target,
          key,
          visibility,
          value,
        });
      } else if (command === "761") {
        // RPL_KEYVALUE
        // Format: 761 <recipient> <target> <key> <visibility> :<value>
        const recipient = parv[0]; // The user receiving this message (usually current user)
        const target = parv[1]; // The user whose metadata this is
        let key = parv[2];
        let visibility = parv[3];
        let valueStartIndex = 4;

        // If target is duplicated (server bug), adjust parsing
        if (parv[1] === parv[2] && parv.length > 5) {
          key = parv[3];
          visibility = parv[4];
          valueStartIndex = 5;
        }

        const value = parv.slice(valueStartIndex).join(" ");
        // Remove leading ":" if present
        const cleanValue = value.startsWith(":") ? value.substring(1) : value;

        this.triggerEvent("METADATA_KEYVALUE", {
          serverId,
          target,
          key,
          visibility,
          value: cleanValue,
        });
      } else if (command === "766") {
        // RPL_KEYNOTSET
        // RPL_KEYNOTSET <Target> <Key> :key not set
        const target = parv[0];
        const key = parv[1];
        this.triggerEvent("METADATA_KEYNOTSET", { serverId, target, key });
      } else if (command === "770") {
        // RPL_METADATASUBOK
        // Format: 770 <target> <key1> [<key2> ...]
        const target = parv[0];
        const keys = parv
          .slice(1)
          .map((key) => (key.startsWith(":") ? key.substring(1) : key));
        console.log(
          `[IRC] Received METADATA_SUBOK for target ${target}, keys:`,
          keys,
        );
        this.triggerEvent("METADATA_SUBOK", { serverId, keys });
      } else if (command === "771") {
        // RPL_METADATAUNSUBOK
        // Format: 771 <target> <key1> [<key2> ...]
        const target = parv[0];
        const keys = parv
          .slice(1)
          .map((key) => (key.startsWith(":") ? key.substring(1) : key));
        this.triggerEvent("METADATA_UNSUBOK", { serverId, keys });
      } else if (command === "772") {
        // RPL_METADATASUBS
        // Format: 772 <target> <key1> [<key2> ...]
        const target = parv[0];
        const keys = parv
          .slice(1)
          .map((key) => (key.startsWith(":") ? key.substring(1) : key));
        this.triggerEvent("METADATA_SUBS", { serverId, keys });
      } else if (command === "774") {
        // RPL_METADATASYNCLATER
        // RPL_METADATASYNCLATER <Target> [<RetryAfter>]
        const target = parv[0];
        const retryAfter = parv[1] ? Number.parseInt(parv[1], 10) : undefined;
        this.triggerEvent("METADATA_SYNCLATER", {
          serverId,
          target,
          retryAfter,
        });
      } else if (command === "FAIL" && parv[0] === "METADATA") {
        // FAIL METADATA <subcommand> <code> [<target>] [<key>] [<retryAfter>]
        // ERR_METADATATOOMANY, ERR_METADATATARGETINVALID, ERR_METADATANOACCESS, ERR_METADATANOKEY, ERR_METADATARATELIMITED
        const subcommand = parv[1]; // The METADATA subcommand that failed (SUB, SET, etc.)
        const code = parv[2]; // The error code
        let target: string | undefined;
        let key: string | undefined;
        let retryAfter: number | undefined;
        if (parv[3]) target = parv[3];
        if (parv[4]) key = parv[4];
        if (parv[5] && code === "RATE_LIMITED") {
          retryAfter = Number.parseInt(parv[5], 10);
        }
        console.log(
          `[IRC] Received METADATA FAIL: subcommand=${subcommand}, code=${code}, target=${target}, key=${key}, retryAfter=${retryAfter}`,
        );
        this.triggerEvent("METADATA_FAIL", {
          serverId,
          subcommand,
          code,
          target,
          key,
          retryAfter,
        });
      } else if (command === "322") {
        // RPL_LIST: <channel> <usercount> :<topic>
        const channelName = parv[1];
        const userCount = parv[2] ? Number.parseInt(parv[2], 10) : 0;
        const topic = parv.slice(3).join(" ").substring(1); // Remove leading :
        this.triggerEvent("LIST_CHANNEL", {
          serverId,
          channel: channelName,
          userCount,
          topic,
        });
      } else if (command === "323") {
        // RPL_LISTEND
        this.triggerEvent("LIST_END", { serverId });
      } else if (command === "352") {
        // RPL_WHOREPLY: <channel> <user> <host> <server> <nick> <flags> :<hopcount> <realname>
        const channel = parv[1];
        const username = parv[2];
        const host = parv[3];
        const server = parv[4];
        const nick = parv[5];
        const flags = parv[6];
        const hopcount = parv[7];
        const realname = parv.slice(8).join(" ").substring(1);
        this.triggerEvent("WHO_REPLY", {
          serverId,
          channel,
          username,
          host,
          server,
          nick,
          flags,
          hopcount,
          realname,
        });
      } else if (command === "315") {
        // RPL_ENDOFWHO
        const mask = parv[1];
        this.triggerEvent("WHO_END", { serverId, mask });
      } else if (command === "335") {
        // RPL_WHOISBOT: <nick> <target> :<message>
        const nick = parv[0];
        const target = parv[1];
        const message = parv.slice(2).join(" ").substring(1);
        this.triggerEvent("WHOIS_BOT", { serverId, nick, target, message });
      } else if (command === "431") {
        // ERR_NONICKNAMEGIVEN: :No nickname given
        const message = parv.join(" ").substring(1);
        this.triggerEvent("NICK_ERROR", {
          serverId,
          code: "431",
          error: "No nickname given",
          message,
        });
      } else if (command === "432") {
        // ERR_ERRONEUSNICKNAME: <nick> :Erroneous nickname
        const nick = parv[1];
        const message = parv.slice(2).join(" ").substring(1);
        this.triggerEvent("NICK_ERROR", {
          serverId,
          code: "432",
          error: "Invalid nickname",
          nick,
          message,
        });
      } else if (command === "433") {
        // ERR_NICKNAMEINUSE: <nick> :Nickname is already in use
        const nick = parv[1];
        const message = parv.slice(2).join(" ").substring(1);
        this.triggerEvent("NICK_ERROR", {
          serverId,
          code: "433",
          error: "Nickname already in use",
          nick,
          message,
        });
      } else if (command === "436") {
        // ERR_NICKCOLLISION: <nick> :Nickname collision KILL from <user>@<host>
        const nick = parv[1];
        const message = parv.slice(2).join(" ").substring(1);
        this.triggerEvent("NICK_ERROR", {
          serverId,
          code: "436",
          error: "Nickname collision",
          nick,
          message,
        });
      } else if (command === "FAIL") {
        // Standard replies: FAIL <command> <code> <target> :<message>
        const cmd = parv[0];
        const code = parv[1];
        const target = parv[2] || undefined;
        const message = parv.slice(3).join(" ").substring(1); // Remove leading :
        this.triggerEvent("FAIL", {
          serverId,
          mtags,
          command: cmd,
          code,
          target,
          message,
        });
      } else if (command === "WARN") {
        // Standard replies: WARN <command> <code> <target> :<message>
        const cmd = parv[0];
        const code = parv[1];
        const target = parv[2] || undefined;
        const message = parv.slice(3).join(" ").substring(1); // Remove leading :
        this.triggerEvent("WARN", {
          serverId,
          mtags,
          command: cmd,
          code,
          target,
          message,
        });
      } else if (command === "NOTE") {
        // Standard replies: NOTE <command> <code> <target> :<message>
        const cmd = parv[0];
        const code = parv[1];
        const target = parv[2] || undefined;
        const message = parv.slice(3).join(" ").substring(1); // Remove leading :
        this.triggerEvent("NOTE", {
          serverId,
          mtags,
          command: cmd,
          code,
          target,
          message,
        });
      } else if (command === "SUCCESS") {
        // Standard replies: SUCCESS <command> <code> <target> :<message>
        const cmd = parv[0];
        const code = parv[1];
        const target = parv[2] || undefined;
        const message = parv.slice(3).join(" ").substring(1); // Remove leading :
        this.triggerEvent("SUCCESS", {
          serverId,
          mtags,
          command: cmd,
          code,
          target,
          message,
        });
      } else if (command === "REGISTER") {
        // Account registration responses
        const subcommand = parv[0];
        if (subcommand === "SUCCESS") {
          const account = parv[1];
          const message = parv.slice(2).join(" ").substring(1);
          this.triggerEvent("REGISTER_SUCCESS", {
            serverId,
            mtags,
            account,
            message,
          });
        } else if (subcommand === "VERIFICATION_REQUIRED") {
          const account = parv[1];
          const message = parv.slice(2).join(" ").substring(1);
          this.triggerEvent("REGISTER_VERIFICATION_REQUIRED", {
            serverId,
            mtags,
            account,
            message,
          });
        }
      } else if (command === "VERIFY") {
        // Account verification responses
        const subcommand = parv[0];
        if (subcommand === "SUCCESS") {
          const account = parv[1];
          const message = parv.slice(2).join(" ").substring(1);
          this.triggerEvent("VERIFY_SUCCESS", {
            serverId,
            mtags,
            account,
            message,
          });
        }
      }
    }
  }

  /* Send SASL plain */
  sendSaslPlain(serverId: string, username: string, password: string) {
    this.sendRaw(
      serverId,
      `AUTHENTICATE ${btoa(`${username}\x00${username}\x00${password}`)}`,
    );
  }

  onCapLs(serverId: string, cliCaps: string, isFinal: boolean): void {
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
      "cap-notify",
      "draft/channel-rename",
      "setname",
      "account-notify",
      "account-tag",
      "extended-join",
      "draft/metadata-2",
      "draft/message-redaction",
      "draft/account-registration",
      "batch",
    ];

    let accumulated = this.capLsAccumulated.get(serverId);
    if (!accumulated) {
      accumulated = new Set();
      this.capLsAccumulated.set(serverId, accumulated);
    }

    const caps = cliCaps.split(" ");
    for (const c of caps) {
      const [cap, value] = c.split("=", 2);
      accumulated.add(cap);
      if (cap === "sasl" && value) {
        const mechanisms = value.split(",");
        this.saslMechanisms.set(serverId, mechanisms);
        console.log(
          `Available SASL mechanisms for ${serverId}: ${mechanisms.join(", ")}`,
        );
      }
    }

    if (isFinal) {
      // Now request the caps we want from the accumulated list
      let toRequest = "CAP REQ :";
      const saslEnabled = this.saslEnabled.get(serverId) ?? false;
      for (const cap of accumulated) {
        if (
          (ourCaps.includes(cap) || cap.startsWith("draft/metadata")) &&
          (cap !== "sasl" || saslEnabled)
        ) {
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
      console.log(
        `Server ${serverId} supports capabilities: ${Array.from(accumulated).join(" ")}`,
      );
      // Clean up
      this.capLsAccumulated.delete(serverId);
    }
  }

  onCapNew(serverId: string, cliCaps: string): void {
    const caps = cliCaps.split(" ");
    for (const c of caps) {
      const [cap, value] = c.split("=", 2);
      if (cap === "sasl" && value) {
        const mechanisms = value.split(",");
        this.saslMechanisms.set(serverId, mechanisms);
        console.log(
          `SASL mechanisms updated for ${serverId}: ${mechanisms.join(", ")}`,
        );
        // If sasl becomes available, perhaps request it if not already
        // But for now, just log
      }
    }
  }

  onCapDel(serverId: string, cliCaps: string): void {
    const caps = cliCaps.split(" ");
    for (const c of caps) {
      const [cap] = c.split("=", 2);
      if (cap === "sasl") {
        this.saslMechanisms.delete(serverId);
        console.log(`SASL capability removed for ${serverId}`);
      }
    }
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

  getCurrentUser(serverId?: string): User | null {
    // If no serverId provided, return null (we need server context now)
    if (!serverId) return null;
    return this.currentUsers.get(serverId) || null;
  }

  getAllUsers(serverId: string): User[] {
    const server = this.servers.get(serverId);
    if (!server) return [];

    const allUsers = new Map<string, User>();

    // Collect users from all joined channels
    for (const channel of server.channels) {
      for (const user of channel.users) {
        allUsers.set(user.username, user);
      }
    }

    return Array.from(allUsers.values());
  }
}

function getNickFromNuh(nuh: string) {
  const nick = nuh.split("!")[0];
  return nick.startsWith(":") ? nick.substring(1) : nick;
}

function getTimestampFromTags(mtags: Record<string, string> | undefined): Date {
  if (mtags?.time) {
    return new Date(mtags.time);
  }
  return new Date();
}

export const ircClient = new IRCClient();

export default ircClient;
