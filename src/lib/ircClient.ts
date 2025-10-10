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
  JOIN: BaseUserActionEvent & {
    channelName: string;
    batchTag?: string;
    account?: string; // From extended-join
    realname?: string; // From extended-join
  };
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
  MODE: EventWithTags & {
    sender: string;
    target: string;
    modestring: string;
    modeargs: string[];
  };
  CHANMSG: BaseMessageEvent & {
    channelName: string;
  };
  USERMSG: BaseMessageEvent & {
    target: string; // The recipient of the PRIVMSG (for whispers)
  };
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
  MULTILINE_MESSAGE: BaseMessageEvent & {
    channelName?: string;
    lines: string[];
    messageIds: string[]; // All message IDs that make up this multiline message
  };
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
  AWAY: {
    serverId: string;
    username: string;
    awayMessage?: string;
  };
  CHGHOST: {
    serverId: string;
    username: string;
    newUser: string;
    newHost: string;
  };
  RPL_NOWAWAY: {
    serverId: string;
    message: string;
  };
  RPL_UNAWAY: {
    serverId: string;
    message: string;
  };
  NICK_ERROR: {
    serverId: string;
    code: string;
    error: string;
    nick?: string;
    message: string;
  };
  CHATHISTORY_LOADING: {
    serverId: string;
    channelName: string;
    isLoading: boolean;
  };
  RPL_BANLIST: {
    serverId: string;
    channel: string;
    mask: string;
    setter: string;
    timestamp: number;
  };
  RPL_INVITELIST: {
    serverId: string;
    channel: string;
    mask: string;
    setter: string;
    timestamp: number;
  };
  RPL_EXCEPTLIST: {
    serverId: string;
    channel: string;
    mask: string;
    setter: string;
    timestamp: number;
  };
  RPL_ENDOFBANLIST: {
    serverId: string;
    channel: string;
  };
  RPL_ENDOFINVITELIST: {
    serverId: string;
    channel: string;
  };
  RPL_ENDOFEXCEPTLIST: {
    serverId: string;
    channel: string;
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
  private saslCredentials: Map<string, { username: string; password: string }> =
    new Map();
  private pendingConnections: Map<string, Promise<Server>> = new Map();
  private pendingCapReqs: Map<string, number> = new Map(); // Track how many CAP REQ batches are pending ACK
  private activeBatches: Map<
    string,
    Map<
      string,
      {
        type: string;
        parameters?: string[];
        messages: string[];
        concatFlags?: boolean[];
        sender?: string;
        messageIds?: string[];
        batchMsgId?: string;
      }
    >
  > = new Map(); // Track active batches per server

  private ourCaps: string[] = [
    "multi-prefix",
    "message-tags",
    "server-time",
    "echo-message",
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
    "away-notify",
    "chghost",
    "draft/metadata-2",
    "draft/message-redaction",
    "draft/account-registration",
    "batch",
    "draft/multiline",
    "draft/typing",
    "draft/channel-context",
    "znc.in/playback",
    "unrealircd.org/json-log",
    // Note: unrealircd.org/link-security is informational only, don't request it
  ];

  private eventCallbacks: {
    [K in EventKey]?: EventCallback<K>[];
  } = {};

  public version = __APP_VERSION__;

  connect(
    name: string,
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
      // Use provided name, default to host if name is empty
      const finalName = name?.trim() || host;

      const server: Server = {
        id: serverId || uuidv4(),
        name: finalName,
        host,
        port,
        channels: [],
        privateChats: [],
        isConnected: false, // Not connected yet
        users: [],
      };
      this.servers.set(server.id, server);
      this.sockets.set(server.id, socket);
      // Only enable SASL if we have both account name AND password
      this.saslEnabled.set(server.id, !!(_saslAccountName && _saslPassword));

      // Store SASL credentials if provided
      if (_saslAccountName && _saslPassword) {
        this.saslCredentials.set(server.id, {
          username: _saslAccountName,
          password: _saslPassword,
        });
      } else {
      }

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
      console.log(
        `IRC Client: Sending command to server ${serverId}: ${command}`,
      );
      // Log metadata and command-related outgoing messages for debugging
      if (command.startsWith("METADATA") || command.startsWith("/")) {
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
        isLoadingHistory: true, // Start in loading state
      };
      server.channels.push(channel);

      // Trigger event to notify store that history loading started
      this.triggerEvent("CHATHISTORY_LOADING", {
        serverId,
        channelName,
        isLoading: true,
      });

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

    // Check if server supports multiline and message has newlines
    // Note: We'll check server capabilities from the store later via helper function
    const lines = content.split("\n");

    if (lines.length > 1) {
      // For now, send multiline if there are multiple lines
      // Server capability check will be done by the calling code
      this.sendMultilineMessage(serverId, channel.name, lines);
    } else {
      // Send as regular single message
      this.sendRaw(serverId, `PRIVMSG ${channel.name} :${content}`);
    }
  }

  sendWhisper(
    serverId: string,
    targetUser: string,
    channelName: string,
    content: string,
  ): void {
    // Send a whisper with the draft/channel-context tag
    // Format: @+draft/channel-context=#channel PRIVMSG targetUser :message
    this.sendRaw(
      serverId,
      `@+draft/channel-context=${channelName} PRIVMSG ${targetUser} :${content}`,
    );
  }

  sendMultilineMessage(
    serverId: string,
    target: string,
    lines: string[],
  ): void {
    const batchId = `ml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Start multiline batch
    this.sendRaw(serverId, `BATCH +${batchId} draft/multiline ${target}`);

    // Send each line as a separate PRIVMSG with batch tag
    // Handle long lines by splitting them if needed
    for (const line of lines) {
      const splitLines = this.splitLongLine(line);
      for (const splitLine of splitLines) {
        this.sendRaw(
          serverId,
          `@batch=${batchId} PRIVMSG ${target} :${splitLine}`,
        );
      }
    }

    // End batch
    this.sendRaw(serverId, `BATCH -${batchId}`);
  }

  // Split long lines to respect IRC message length limits (512 bytes)
  private splitLongLine(text: string, maxLength = 450): string[] {
    if (!text) return [""];

    // Account for IRC overhead (PRIVMSG + target + formatting)
    // Conservative limit to account for formatting codes and IRC overhead
    const lines: string[] = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      // Try to split at word boundaries
      let splitIndex = maxLength;
      const lastSpace = remaining.lastIndexOf(" ", maxLength);
      if (lastSpace > maxLength * 0.7) {
        // Don't split too early
        splitIndex = lastSpace;
      }

      lines.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex).trim();
    }

    if (remaining) {
      lines.push(remaining);
    }

    return lines.length > 0 ? lines : [""];
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
    this.sendRaw(serverId, command);
  }

  metadataClear(serverId: string, target: string): void {
    this.sendRaw(serverId, `METADATA ${target} CLEAR`);
  }

  metadataSub(serverId: string, keys: string[]): void {
    // Send individual SUB commands for each key to avoid parsing issues
    keys.forEach((key) => {
      const command = `METADATA * SUB ${key}`;
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
    const lines = data.split("\r\n");
    for (let line of lines) {
      let mtags: Record<string, string> | undefined;
      let source: string;
      const parv: string[] = [];
      let i = 0;
      let l: string[];
      line = line.trim();

      // Skip empty lines
      if (!line) continue;

      console.log(`IRC Client: Received line from server ${serverId}: ${line}`);

      // Debug: Log ALL lines that contain CAP to see if CAP ACK is even being processed
      if (line.includes("CAP")) {
      }

      // Debug: Log all incoming IRC messages

      // Handle message tags first, before splitting on trailing parameter
      let lineAfterTags = line;
      if (line[0] === "@") {
        const spaceIndex = line.indexOf(" ");
        if (spaceIndex !== -1) {
          mtags = parseMessageTags(line.substring(0, spaceIndex));
          lineAfterTags = line.substring(spaceIndex + 1);
        }
      }

      // Parse IRC message properly handling colon-prefixed trailing parameter
      const spaceIndex = lineAfterTags.indexOf(" :");
      let trailing = "";
      let mainPart = lineAfterTags;

      if (spaceIndex !== -1) {
        trailing = lineAfterTags.substring(spaceIndex + 2); // Skip ' :'
        mainPart = lineAfterTags.substring(0, spaceIndex);
      }

      l = mainPart.split(" ").filter((part) => part.length > 0);

      // Ensure we have at least one element
      if (l.length === 0) continue;

      // Determine the source. if none, spoof as host server
      if (l[i][0] !== ":") {
        const thisServ = this.servers.get(serverId);
        const thisServName = thisServ?.name;
        if (!thisServName) {
          // something has gone horribly wrong
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

      // Add trailing parameter if it exists
      if (trailing) {
        parv.push(trailing);
      }

      // Debug: ALWAYS log when line contains @time and CAP
      if (line.includes("@time") && line.includes("CAP")) {
      }

      // Debug: log command and parv for CAP messages
      if (command === "CAP" || line.includes("CAP")) {
      }

      // Debug: for message tags, show what l array looks like
      if (line.includes("@time") && line.includes("CAP")) {
      }

      const parc = parv.length;

      if (command === "PING") {
        const key = parv.join(" ");
        this.sendRaw(serverId, `PONG ${key}`);
      } else if (command === "001") {
        const serverName = source;
        const nickname = parv[0]; // Our actual nick as assigned by the server

        // Update our stored nick to match what the server assigned us
        this.nicks.set(serverId, nickname);

        // Update current user's username to match server-assigned nick
        const currentUser = this.currentUsers.get(serverId);
        if (currentUser) {
          this.currentUsers.set(serverId, {
            ...currentUser,
            username: nickname,
          });
        }

        this.triggerEvent("ready", { serverId, serverName, nickname });
      } else if (command === "NICK") {
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
      } else if (command === "AWAY") {
        // AWAY command for away-notify extension
        // Format: :nick!user@host AWAY :away message
        // or:     :nick!user@host AWAY (when user returns)
        const username = getNickFromNuh(source);
        const awayMessage = parv.length > 0 ? parv.join(" ") : undefined;
        this.triggerEvent("AWAY", {
          serverId,
          username,
          awayMessage,
        });
      } else if (command === "CHGHOST") {
        // CHGHOST command for chghost extension
        // Format: :nick!old_user@old_host CHGHOST new_user new_host
        const username = getNickFromNuh(source);
        const newUser = parv[0];
        const newHost = parv[1];
        this.triggerEvent("CHGHOST", {
          serverId,
          username,
          newUser,
          newHost,
        });
      } else if (command === "JOIN") {
        const username = getNickFromNuh(source);
        const channelName = parv[0][0] === ":" ? parv[0].substring(1) : parv[0];

        // Extended-join format: JOIN #channel account :realname
        // Standard join format: JOIN #channel
        let account: string | undefined;
        let realname: string | undefined;

        if (parv.length >= 2) {
          // Extended-join is enabled
          account = parv[1] === "*" ? undefined : parv[1]; // * means no account
          if (parv.length >= 3) {
            realname = parv.slice(2).join(" ");
          }
        }

        this.triggerEvent("JOIN", {
          serverId,
          username,
          channelName,
          batchTag: mtags?.batch,
          account,
          realname,
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
        const reasonText = parv.join(" ").trim();
        const reason = reasonText.startsWith(":")
          ? reasonText.substring(1)
          : reasonText;
        this.triggerEvent("KICK", {
          serverId,
          mtags,
          username,
          channelName,
          target,
          reason,
        });
      } else if (command === "MODE") {
        const sender = getNickFromNuh(source);
        const target = parv[0];
        const modestring = parv[1] || "";
        const modeargs = parv.slice(2);
        this.triggerEvent("MODE", {
          serverId,
          mtags,
          sender,
          target,
          modestring,
          modeargs,
        });
      } else if (command === "PRIVMSG") {
        const target = parv[0];
        const isChannel = target.startsWith("#");
        const sender = getNickFromNuh(source);

        // Message content is in parv[1] and onwards after target
        const message = parv.slice(1).join(" ");

        // Check if this message is part of a multiline batch
        const batchId = mtags?.batch;
        if (batchId) {
          const serverBatches = this.activeBatches.get(serverId);
          const batch = serverBatches?.get(batchId);
          if (
            batch &&
            (batch.type === "multiline" || batch.type === "draft/multiline")
          ) {
            // Add this message line to the batch
            batch.messages.push(message);

            // Store sender from the first message
            if (!batch.sender) {
              batch.sender = sender;
            }

            // Track message IDs for redaction
            if (!batch.messageIds) {
              batch.messageIds = [];
            }
            if (mtags?.msgid) {
              batch.messageIds.push(mtags.msgid);
            } else {
            }

            // Track if this message has the concat flag
            if (!batch.concatFlags) {
              batch.concatFlags = [];
            }
            const hasMultilineConcat =
              mtags && mtags["draft/multiline-concat"] !== undefined;
            batch.concatFlags.push(!!hasMultilineConcat);

            return; // Don't trigger individual message event, wait for batch completion
          }
        }

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
            target, // The recipient of the PRIVMSG
            message,
            timestamp: getTimestampFromTags(mtags),
          });
        }
      } else if (command === "NOTICE") {
        const target = parv[0];
        const isChannel = target.startsWith("#");
        const sender = getNickFromNuh(source);

        // The message content is now properly parsed as the trailing parameter
        const message = trailing || parv.slice(1).join(" ");

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
        const reason = parv.slice(2).join(" "); // No need to remove leading : anymore
        this.triggerEvent("RENAME", {
          serverId,
          oldName,
          newName,
          reason,
          user,
        });
      } else if (command === "SETNAME") {
        const user = getNickFromNuh(source);
        const realname = parv.join(" "); // No need to remove leading : anymore
        this.triggerEvent("SETNAME", {
          serverId,
          user,
          realname,
        });
      } else if (command === "353") {
        const channelName = parv[2];
        const names = parv.slice(3).join(" ").trim().substring(1);
        const newUsers = parseNamesResponse(names); // Parse the user list

        // Trigger an event to notify the UI
        this.triggerEvent("NAMES", {
          serverId,
          channelName,
          users: newUsers,
        });
      } else if (command === "CAP") {
        console.log(
          `[CAP] Processing CAP command, parv: ${JSON.stringify(parv)}, trailing: "${trailing}"`,
        );
        console.log(`[CAP] Received CAP message: ${parv.join(" ")}`);
        console.log(`[CAP] Full parv array: ${JSON.stringify(parv)}`);
        console.log(`[CAP] Trailing parameter: "${trailing}"`);
        let i = 0;
        let caps = "";
        if (parv[i] === "*") {
          i++;
        }
        let subcommand = parv[i++];
        console.log(
          `[CAP] Subcommand: '${subcommand}', i after increment: ${i}, parv length: ${parv.length}`,
        );
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

        // Build caps string - use trailing parameter if available, otherwise join remaining parv
        if (trailing) {
          caps = trailing;
        } else {
          while (parv[i]) {
            caps += parv[i++];
            if (parv[i]) caps += " ";
          }
        }

        console.log(`[CAP] Final caps string: "${caps}"`);

        if (subcommand === "LS") this.onCapLs(serverId, caps, isFinal);
        else if (subcommand === "ACK") {
          this.onCapAck(serverId, caps);
        } else if (subcommand === "NAK") {
          // Server rejected some capabilities, but we should still end CAP negotiation
          this.sendRaw(serverId, "CAP END");
        } else if (subcommand === "NEW") this.onCapNew(serverId, caps);
        else if (subcommand === "DEL") this.onCapDel(serverId, caps);
        else {
        }
      } else if (command === "005") {
        const capabilities = parseIsupport(parv.join(" "));
        for (const [key, value] of Object.entries(capabilities)) {
          if (key === "NETWORK") {
            const server = this.servers.get(serverId);
            if (server) {
              server.name = value;
              this.servers.set(serverId, server);
            }
          }
          this.triggerEvent("ISUPPORT", { serverId, key, value });
        }
      } else if (command === "AUTHENTICATE") {
        const param = parv.join(" ");
        this.triggerEvent("AUTHENTICATE", { serverId, param });

        // Handle SASL PLAIN authentication
        if (param === "+") {
          const creds = this.saslCredentials.get(serverId);
          if (creds) {
            this.sendSaslPlain(serverId, creds.username, creds.password);
          }
        }
      } else if (command === "BATCH") {
        // BATCH +reference-tag type [parameters...] or BATCH -reference-tag
        const batchRef = parv[0];
        const isStart = batchRef.startsWith("+");
        const batchId = batchRef.substring(1); // Remove + or -

        if (isStart) {
          const batchType = parv[1];
          const parameters = parv.slice(2);

          // Initialize batch tracking for this server if not exists
          if (!this.activeBatches.has(serverId)) {
            this.activeBatches.set(serverId, new Map());
          }

          // Track this batch
          this.activeBatches.get(serverId)?.set(batchId, {
            type: batchType,
            parameters,
            messages: [],
            batchMsgId: mtags?.msgid, // Store the msgid from the BATCH command itself
          });

          this.triggerEvent("BATCH_START", {
            serverId,
            batchId,
            type: batchType,
            parameters,
          });
        } else {
          // Process completed batch
          const serverBatches = this.activeBatches.get(serverId);
          const batch = serverBatches?.get(batchId);

          if (
            batch &&
            (batch.type === "multiline" || batch.type === "draft/multiline")
          ) {
            // Handle completed multiline batch
            // For multiline batches, parameters[0] is the target, sender comes from the PRIVMSG lines
            const target =
              batch.parameters && batch.parameters.length > 0
                ? batch.parameters[0]
                : "";
            const sender = batch.sender || "unknown";

            // Combine messages, handling draft/multiline-concat tags
            let combinedMessage = "";
            batch.messages.forEach((message, index) => {
              const wasConcat = batch.concatFlags?.[index];

              if (index === 0) {
                combinedMessage = message;
              } else {
                // Check if this message was tagged with draft/multiline-concat
                if (wasConcat) {
                  // Concatenate directly without separator
                  combinedMessage += message;
                } else {
                  // Join with newline (normal multiline)
                  combinedMessage += `\n${message}`;
                }
              }
            });

            this.triggerEvent("MULTILINE_MESSAGE", {
              serverId,
              mtags: batch.batchMsgId ? { msgid: batch.batchMsgId } : undefined, // Use the msgid from the BATCH command
              sender,
              channelName: target.startsWith("#") ? target : undefined,
              message: combinedMessage,
              lines: batch.messages,
              messageIds: batch.messageIds || [],
              timestamp: getTimestampFromTags(mtags),
            });
          }

          // Clean up batch tracking
          serverBatches?.delete(batchId);

          this.triggerEvent("BATCH_END", {
            serverId,
            batchId,
          });
        }
      } else if (command === "METADATA") {
        // METADATA PARAM1 PARAM2 [PARAM3 PARAM4 etc optional params] :the actual value
        // The trailing value is the last parameter, optional params can be between PARAM2 and value
        const target = parv[0]; // PARAM1
        const key = parv[1]; // PARAM2

        // The actual value is the last parameter (trailing parameter from original message)
        const value = parv[parv.length - 1] || "";

        // Everything between key and value are optional parameters (visibility, etc.)
        const optionalParams = parv.length > 2 ? parv.slice(2, -1) : [];

        // For backward compatibility, assume first optional param is visibility if present
        const visibility = optionalParams.length > 0 ? optionalParams[0] : "";

        this.triggerEvent("METADATA", {
          serverId,
          target,
          key,
          visibility,
          value,
        });
      } else if (command === "760") {
        // RPL_WHOISKEYVALUE
        // RPL_WHOISKEYVALUE <Target> <Key> <Visibility> :<Value>
        const target = parv[0];
        const key = parv[1];
        const visibility = parv[2];
        const value = parv.slice(3).join(" "); // No need to remove leading : anymore
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
        // FAIL METADATA <subcommand> <code> [<target>] [<key>] [<retryAfter>] :[<message>]
        // ERR_METADATATOOMANY, ERR_METADATATARGETINVALID, ERR_METADATANOACCESS, ERR_METADATANOKEY, ERR_METADATARATELIMITED
        const subcommand = parv[1]; // The METADATA subcommand that failed (SUB, SET, etc.)
        const code = parv[2]; // The error code

        // Check if the last parameter is a trailing message (starts with original ":")
        // If so, the parameters before it are the optional params
        let paramCount = parv.length;
        let errorMessage = "";

        // If there are more than 3 params and the last one doesn't look like a number,
        // it's likely a trailing error message
        if (paramCount > 3) {
          const lastParam = parv[paramCount - 1];
          if (lastParam && Number.isNaN(Number.parseInt(lastParam, 10))) {
            errorMessage = lastParam;
            paramCount = paramCount - 1; // Don't count the error message as a regular param
          }
        }

        let target: string | undefined;
        let key: string | undefined;
        let retryAfter: number | undefined;

        if (paramCount > 3) target = parv[3];
        if (paramCount > 4) key = parv[4];
        if (paramCount > 5 && code === "RATE_LIMITED") {
          retryAfter = Number.parseInt(parv[5], 10);
        }

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
        const topic = parv.slice(3).join(" "); // No need to remove leading : anymore
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
        const realname = parv.slice(8).join(" "); // No need to remove leading : anymore
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
      } else if (command === "305") {
        // RPL_UNAWAY: <client> :<message>
        // You are no longer marked as being away
        const message = parv.slice(1).join(" ");
        this.triggerEvent("RPL_UNAWAY", {
          serverId,
          message,
        });
      } else if (command === "306") {
        // RPL_NOWAWAY: <client> :<message>
        // You have been marked as being away
        const message = parv.slice(1).join(" ");
        this.triggerEvent("RPL_NOWAWAY", {
          serverId,
          message,
        });
      } else if (command === "315") {
        // RPL_ENDOFWHO
        const mask = parv[1];
        this.triggerEvent("WHO_END", { serverId, mask });
      } else if (command === "335") {
        // RPL_WHOISBOT: <nick> <target> :<message>
        const nick = parv[0];
        const target = parv[1];
        const message = parv.slice(2).join(" "); // No need to remove leading : anymore
        this.triggerEvent("WHOIS_BOT", { serverId, nick, target, message });
      } else if (command === "431") {
        // ERR_NONICKNAMEGIVEN: :No nickname given
        const message = parv.join(" "); // No need to remove leading : anymore
        this.triggerEvent("NICK_ERROR", {
          serverId,
          code: "431",
          error: "No nickname given",
          message,
        });
      } else if (
        command === "900" ||
        command === "901" ||
        command === "902" ||
        command === "903"
      ) {
        // SASL authentication successful
        const message = parv.slice(2).join(" ");
        // Finish capability negotiation
        this.sendRaw(serverId, "CAP END");
      } else if (
        command === "904" ||
        command === "905" ||
        command === "906" ||
        command === "907"
      ) {
        // SASL authentication failed
        const message = parv.slice(2).join(" ");
        // Still finish capability negotiation even if SASL failed
        this.sendRaw(serverId, "CAP END");
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
        }
      } else if (command === "367") {
        // RPL_BANLIST: <channel> <banmask> <setter> <timestamp>
        const channel = parv[1];
        const mask = parv[2];
        const setter = parv[3];
        const timestamp = Number.parseInt(parv[4], 10);
        console.log(
          `IRC Client: RPL_BANLIST parsed - channel: ${channel}, mask: ${mask}, setter: ${setter}, timestamp: ${timestamp}`,
        );
        this.triggerEvent("RPL_BANLIST", {
          serverId,
          channel,
          mask,
          setter,
          timestamp,
        });
      } else if (command === "346") {
        // RPL_INVITELIST: <channel> <invite mask> <setter> <timestamp>
        const channel = parv[1];
        const mask = parv[2];
        const setter = parv[3];
        const timestamp = Number.parseInt(parv[4], 10);
        console.log(
          `IRC Client: RPL_INVITELIST parsed - channel: ${channel}, mask: ${mask}, setter: ${setter}, timestamp: ${timestamp}`,
        );
        this.triggerEvent("RPL_INVITELIST", {
          serverId,
          channel,
          mask,
          setter,
          timestamp,
        });
      } else if (command === "348") {
        // RPL_EXCEPTLIST: <channel> <exception mask> <setter> <timestamp>
        const channel = parv[1];
        const mask = parv[2];
        const setter = parv[3];
        const timestamp = Number.parseInt(parv[4], 10);
        console.log(
          `IRC Client: RPL_EXCEPTLIST parsed - channel: ${channel}, mask: ${mask}, setter: ${setter}, timestamp: ${timestamp}`,
        );
        this.triggerEvent("RPL_EXCEPTLIST", {
          serverId,
          channel,
          mask,
          setter,
          timestamp,
        });
      } else if (command === "368") {
        // RPL_ENDOFBANLIST: <channel> :End of channel ban list
        const channel = parv[1];
        console.log(
          `IRC Client: RPL_ENDOFBANLIST parsed - channel: ${channel}`,
        );
        this.triggerEvent("RPL_ENDOFBANLIST", {
          serverId,
          channel,
        });
      } else if (command === "347") {
        // RPL_ENDOFINVITELIST: <channel> :End of channel invite list
        const channel = parv[1];
        console.log(
          `IRC Client: RPL_ENDOFINVITELIST parsed - channel: ${channel}`,
        );
        this.triggerEvent("RPL_ENDOFINVITELIST", {
          serverId,
          channel,
        });
      } else if (command === "349") {
        // RPL_ENDOFEXCEPTLIST: <channel> :End of channel exception list
        const channel = parv[1];
        console.log(
          `IRC Client: RPL_ENDOFEXCEPTLIST parsed - channel: ${channel}`,
        );
        this.triggerEvent("RPL_ENDOFEXCEPTLIST", {
          serverId,
          channel,
        });
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
      }
      // Handle informational unrealircd.org/link-security capability
      if (cap === "unrealircd.org/link-security" && value) {
        const linkSecurityValue = Number.parseInt(value, 10) || 0;
        // Trigger event with the link security value so the store can handle it
        this.triggerEvent("CAP LS", {
          serverId,
          cliCaps: `unrealircd.org/link-security=${linkSecurityValue}`,
        });
      }
    }

    if (isFinal) {
      // Now request the caps we want from the accumulated list
      const capsToRequest: string[] = [];
      const saslEnabled = this.saslEnabled.get(serverId) ?? false;
      for (const cap of accumulated) {
        if (
          (this.ourCaps.includes(cap) || cap.startsWith("draft/metadata")) &&
          (cap !== "sasl" || saslEnabled)
        ) {
          capsToRequest.push(cap);
        }
      }

      if (capsToRequest.length > 0) {
        // Send capabilities in batches to avoid IRC line length limits (512 bytes)
        let currentBatch: string[] = [];
        const baseLength = "CAP REQ :".length + 2; // +2 for \r\n
        let currentLength = baseLength;
        let batchCount = 0;

        for (const cap of capsToRequest) {
          const capLength = cap.length + (currentBatch.length > 0 ? 1 : 0); // +1 for space if not first

          if (currentLength + capLength > 500 && currentBatch.length > 0) {
            // Leave some margin
            // Send current batch
            const reqMessage = `CAP REQ :${currentBatch.join(" ")}`;
            this.sendRaw(serverId, reqMessage);
            batchCount++;
            currentBatch = [];
            currentLength = baseLength;
          }

          currentBatch.push(cap);
          currentLength += capLength;
        }

        // Send remaining batch
        if (currentBatch.length > 0) {
          const reqMessage = `CAP REQ :${currentBatch.join(" ")}`;
          this.sendRaw(serverId, reqMessage);
          batchCount++;
        }

        // Track how many CAP REQ batches we sent
        this.pendingCapReqs.set(serverId, batchCount);

        // Set a timeout to send CAP END if server doesn't respond
        setTimeout(() => {
          if (this.pendingCapReqs.has(serverId)) {
            this.pendingCapReqs.delete(serverId);
            this.sendRaw(serverId, "CAP END");
            this.userOnConnect(serverId);
          }
        }, 5000); // 5 second timeout

        if (capsToRequest.includes("draft/extended-isupport")) {
          this.sendRaw(serverId, "ISUPPORT");
        }
      }
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
      }
    }
  }

  onCapAck(serverId: string, cliCaps: string): void {
    // Trigger the original event for compatibility
    this.triggerEvent("CAP ACK", { serverId, cliCaps });

    // Decrement pending CAP REQ count
    const pendingCount = this.pendingCapReqs.get(serverId) || 0;
    if (pendingCount > 0) {
      const newCount = pendingCount - 1;

      if (newCount === 0) {
        // All CAP REQ batches acknowledged
        this.pendingCapReqs.delete(serverId);

        // Note: SASL authentication is handled by the store's event handlers
        // The store will check capabilities and initiate SASL if needed
      } else {
        this.pendingCapReqs.set(serverId, newCount);
      }
    } else {
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
