import type { Channel, Server, User } from "../../types";
import { CapabilityNegotiator } from "./capabilities/capabilityNegotiator";
import { MetadataManager } from "./capabilities/metadata";
import { SaslAuthenticator } from "./capabilities/sasl";
import { ConnectionManager } from "./core/connection";
import { PingManager } from "./core/ping";
import { ReconnectionManager } from "./core/reconnection";
import { StateManager } from "./core/state";
import { EventEmitter } from "./events/eventEmitter";
import { BatchHandler } from "./handlers/batchHandlers";
import {
  ModeHandler,
  RenameHandler,
  SetnameHandler,
  TopicHandler,
} from "./handlers/channelHandlers";
import {
  NoticeHandler,
  PrivmsgHandler,
  RedactHandler,
  TagmsgHandler,
} from "./handlers/messageHandlers";
import {
  BanListHandler,
  ChannelModeIsHandler,
  EndOfBanListHandler,
  EndOfExceptListHandler,
  EndOfInviteListHandler,
  EndOfMonListHandler,
  EndOfWhoHandler,
  EndOfWhoisHandler,
  ExceptListHandler,
  InviteListHandler,
  IsupportHandler,
  KeyNotSetHandler,
  KeyValueHandler,
  ListChannelHandler,
  ListEndHandler,
  MetadataSubOkHandler,
  MetadataSubsHandler,
  MetadataSyncLaterHandler,
  MetadataUnsubOkHandler,
  MonListHandler,
  MonOfflineHandler,
  MonOnlineHandler,
  NamesHandler,
  NickErrorHandler,
  NoTopicHandler,
  RplAwayHandler,
  RplNowawayHandler,
  RplTopicHandler,
  RplUnawayHandler,
  TopicWhoTimeHandler,
  WelcomeHandler,
  WhoisAccountHandler,
  WhoisBotHandler,
  WhoisChannelsHandler,
  WhoisIdleHandler,
  WhoisKeyValueHandler,
  WhoisSecureHandler,
  WhoisServerHandler,
  WhoisSpecialHandler,
  WhoisUserHandler,
  WhoReplyHandler,
  WhoxReplyHandler,
  YoureOperHandler,
  YourHostHandler,
} from "./handlers/numericHandlers";
import {
  FailHandler,
  NoteHandler,
  SuccessHandler,
  WarnHandler,
} from "./handlers/standardReplyHandlers";
// Import all handlers
import {
  AwayHandler,
  ChghostHandler,
  InviteHandler,
  JoinHandler,
  KickHandler,
  NickHandler,
  PartHandler,
  QuitHandler,
} from "./handlers/userHandlers";
import { CommandRouter } from "./protocol/commandRouter";
import { MessageBuilder } from "./protocol/messageBuilder";
import { MessageParser, type ParsedMessage } from "./protocol/messageParser";
import type { EventCallback, EventKey, EventMap } from "./types";

declare const __APP_VERSION__: string;

/**
 * Main IRC Client facade that orchestrates all modules
 */
export class IRCClient {
  // Core modules
  private eventEmitter: EventEmitter;
  private stateManager: StateManager;
  private connectionManager: ConnectionManager;
  private reconnectionManager: ReconnectionManager;
  private pingManager: PingManager;

  // Protocol modules
  private messageParser: MessageParser;
  private commandRouter: CommandRouter;
  private messageBuilder: MessageBuilder;

  // Capability modules
  private capabilityNegotiator: CapabilityNegotiator;
  private saslAuthenticator: SaslAuthenticator;
  private metadataManager: MetadataManager;

  public version = __APP_VERSION__;

  constructor() {
    this.eventEmitter = new EventEmitter();
    this.stateManager = new StateManager();
    this.messageBuilder = new MessageBuilder();
    this.messageParser = new MessageParser();
    this.commandRouter = new CommandRouter();
    this.connectionManager = new ConnectionManager(this.eventEmitter);
    this.reconnectionManager = new ReconnectionManager(this.eventEmitter);
    this.pingManager = new PingManager();
    this.capabilityNegotiator = new CapabilityNegotiator(
      this.eventEmitter,
      this.stateManager,
      this.sendRaw.bind(this),
      this.userOnConnect.bind(this),
    );
    this.saslAuthenticator = new SaslAuthenticator(
      this.eventEmitter,
      this.sendRaw.bind(this),
    );
    this.metadataManager = new MetadataManager(
      this.eventEmitter,
      this.sendRaw.bind(this),
      (serverId: string) => this.stateManager.getNick(serverId),
    );
    this.registerHandlers();
  }

  /**
   * Register all IRC command handlers with the CommandRouter
   */
  private registerHandlers(): void {
    const CLASS_BASED_HANDLERS = [
      { cmd: "NICK", Handler: NickHandler },
      { cmd: "JOIN", Handler: JoinHandler },
      { cmd: "PART", Handler: PartHandler },
      { cmd: "QUIT", Handler: QuitHandler },
      { cmd: "KICK", Handler: KickHandler },
      { cmd: "AWAY", Handler: AwayHandler },
      { cmd: "CHGHOST", Handler: ChghostHandler },
      { cmd: "INVITE", Handler: InviteHandler },
      { cmd: "PRIVMSG", Handler: PrivmsgHandler },
      { cmd: "NOTICE", Handler: NoticeHandler },
      { cmd: "TAGMSG", Handler: TagmsgHandler },
      { cmd: "REDACT", Handler: RedactHandler },
      { cmd: "MODE", Handler: ModeHandler },
      { cmd: "TOPIC", Handler: TopicHandler },
      { cmd: "RENAME", Handler: RenameHandler },
      { cmd: "SETNAME", Handler: SetnameHandler },
      { cmd: "BATCH", Handler: BatchHandler },
      { cmd: "FAIL", Handler: FailHandler },
      { cmd: "WARN", Handler: WarnHandler },
      { cmd: "NOTE", Handler: NoteHandler },
      { cmd: "SUCCESS", Handler: SuccessHandler },
      { cmd: "001", Handler: WelcomeHandler },
      { cmd: "002", Handler: YourHostHandler },
      { cmd: "005", Handler: IsupportHandler },
      { cmd: "381", Handler: YoureOperHandler },
      { cmd: "301", Handler: RplAwayHandler },
      { cmd: "305", Handler: RplUnawayHandler },
      { cmd: "306", Handler: RplNowawayHandler },
      { cmd: "311", Handler: WhoisUserHandler },
      { cmd: "312", Handler: WhoisServerHandler },
      { cmd: "317", Handler: WhoisIdleHandler },
      { cmd: "318", Handler: EndOfWhoisHandler },
      { cmd: "319", Handler: WhoisChannelsHandler },
      { cmd: "320", Handler: WhoisSpecialHandler },
      { cmd: "378", Handler: WhoisSpecialHandler },
      { cmd: "379", Handler: WhoisSpecialHandler },
      { cmd: "330", Handler: WhoisAccountHandler },
      { cmd: "671", Handler: WhoisSecureHandler },
      { cmd: "335", Handler: WhoisBotHandler },
      { cmd: "353", Handler: NamesHandler },
      { cmd: "331", Handler: NoTopicHandler },
      { cmd: "332", Handler: RplTopicHandler },
      { cmd: "333", Handler: TopicWhoTimeHandler },
      { cmd: "324", Handler: ChannelModeIsHandler },
      { cmd: "367", Handler: BanListHandler },
      { cmd: "368", Handler: EndOfBanListHandler },
      { cmd: "348", Handler: ExceptListHandler },
      { cmd: "349", Handler: EndOfExceptListHandler },
      { cmd: "346", Handler: InviteListHandler },
      { cmd: "347", Handler: EndOfInviteListHandler },
      { cmd: "352", Handler: WhoReplyHandler },
      { cmd: "354", Handler: WhoxReplyHandler },
      { cmd: "315", Handler: EndOfWhoHandler },
      { cmd: "322", Handler: ListChannelHandler },
      { cmd: "323", Handler: ListEndHandler },
      { cmd: "431", Handler: NickErrorHandler },
      { cmd: "432", Handler: NickErrorHandler },
      { cmd: "433", Handler: NickErrorHandler },
      { cmd: "436", Handler: NickErrorHandler },
      { cmd: "730", Handler: MonOnlineHandler },
      { cmd: "731", Handler: MonOfflineHandler },
      { cmd: "732", Handler: MonListHandler },
      { cmd: "733", Handler: EndOfMonListHandler },
      { cmd: "760", Handler: WhoisKeyValueHandler },
      { cmd: "761", Handler: KeyValueHandler },
      { cmd: "766", Handler: KeyNotSetHandler },
      { cmd: "770", Handler: MetadataSubOkHandler },
      { cmd: "771", Handler: MetadataUnsubOkHandler },
      { cmd: "772", Handler: MetadataSubsHandler },
      { cmd: "774", Handler: MetadataSyncLaterHandler },
    ] as const;

    CLASS_BASED_HANDLERS.forEach(({ cmd, Handler }) => {
      this.commandRouter.registerHandler(
        cmd,
        new Handler(this.eventEmitter, this.stateManager),
      );
    });

    // SASL responses - inline handlers
    this.commandRouter.registerHandler("900", {
      handle: (msg, serverId) => {
        // RPL_LOGGEDIN: You are now logged in as <nick>
        const message = msg.params.slice(2).join(" ");
        this.saslAuthenticator.handleSuccess(serverId);
      },
    });

    this.commandRouter.registerHandler("901", {
      handle: (msg, serverId) => {
        // SASL authentication successful
        this.saslAuthenticator.handleSuccess(serverId);
        this.sendRaw(serverId, "CAP END");
        this.stateManager.setCapNegotiationComplete(serverId, true);
        this.userOnConnect(serverId);
      },
    });

    this.commandRouter.registerHandler("902", {
      handle: (msg, serverId) => {
        // SASL authentication successful
        this.saslAuthenticator.handleSuccess(serverId);
        this.sendRaw(serverId, "CAP END");
        this.stateManager.setCapNegotiationComplete(serverId, true);
        this.userOnConnect(serverId);
      },
    });

    this.commandRouter.registerHandler("903", {
      handle: (msg, serverId) => {
        // SASL authentication successful
        this.saslAuthenticator.handleSuccess(serverId);
        this.sendRaw(serverId, "CAP END");
        this.stateManager.setCapNegotiationComplete(serverId, true);
        this.userOnConnect(serverId);
      },
    });

    this.commandRouter.registerHandler("904", {
      handle: (msg, serverId) => {
        // SASL authentication failed
        const message = msg.params.slice(2).join(" ");
        this.saslAuthenticator.handleFailure(serverId, "904", message);
        this.sendRaw(serverId, "CAP END");
        this.stateManager.setCapNegotiationComplete(serverId, true);
        this.userOnConnect(serverId);
      },
    });

    this.commandRouter.registerHandler("905", {
      handle: (msg, serverId) => {
        // SASL authentication failed
        const message = msg.params.slice(2).join(" ");
        this.saslAuthenticator.handleFailure(serverId, "905", message);
        this.sendRaw(serverId, "CAP END");
        this.stateManager.setCapNegotiationComplete(serverId, true);
        this.userOnConnect(serverId);
      },
    });

    this.commandRouter.registerHandler("906", {
      handle: (msg, serverId) => {
        // SASL authentication failed
        const message = msg.params.slice(2).join(" ");
        this.saslAuthenticator.handleFailure(serverId, "906", message);
        this.sendRaw(serverId, "CAP END");
        this.stateManager.setCapNegotiationComplete(serverId, true);
        this.userOnConnect(serverId);
      },
    });

    this.commandRouter.registerHandler("907", {
      handle: (msg, serverId) => {
        // SASL authentication failed
        const message = msg.params.slice(2).join(" ");
        this.saslAuthenticator.handleFailure(serverId, "907", message);
        this.sendRaw(serverId, "CAP END");
        this.stateManager.setCapNegotiationComplete(serverId, true);
        this.userOnConnect(serverId);
      },
    });

    this.commandRouter.registerHandler("CAP", {
      handle: (msg, serverId) => this.handleCapCommand(msg, serverId),
    });

    this.commandRouter.registerHandler("PING", {
      handle: (msg, serverId) => {
        const key = msg.params.join(" ");
        this.sendRaw(serverId, `PONG :${key}`);
      },
    });

    this.commandRouter.registerHandler("PONG", {
      handle: (_msg, serverId) => {
        this.pingManager.handlePong(serverId);
      },
    });

    this.commandRouter.registerHandler("ERROR", {
      handle: (msg, serverId) => {
        const errorMessage = msg.params.join(" ");
        console.log(`IRC ERROR from server ${serverId}: ${errorMessage}`);
      },
    });

    this.commandRouter.registerHandler("AUTHENTICATE", {
      handle: (msg, serverId) => {
        const param = msg.params.join(" ");
        this.eventEmitter.triggerEvent("AUTHENTICATE", { serverId, param });
        this.saslAuthenticator.handleAuthenticateResponse(serverId, param);
      },
    });

    this.commandRouter.registerHandler("EXTJWT", {
      handle: (msg, serverId) => {
        const requestedTarget = msg.params[0];
        const serviceName = msg.params[1];
        let jwtToken: string;
        if (msg.params[2] === "*") {
          jwtToken = msg.params[3];
        } else {
          jwtToken = msg.params[2];
        }
        this.eventEmitter.triggerEvent("EXTJWT", {
          serverId,
          requestedTarget,
          serviceName,
          jwtToken,
        });
      },
    });
  }

  /**
   * Handle CAP command with special logic for negotiation
   */
  private handleCapCommand(msg: ParsedMessage, serverId: string): void {
    let i = 0;
    let caps = "";

    if (msg.params[i] === "*") {
      i++;
    }

    let subcommand = msg.params[i++];
    if (
      subcommand !== "LS" &&
      subcommand !== "ACK" &&
      subcommand !== "NEW" &&
      subcommand !== "DEL" &&
      subcommand !== "NAK"
    ) {
      // This is likely a nickname, skip it and get the real subcommand
      subcommand = msg.params[i++];
    }

    const isFinal = subcommand === "LS" && msg.params[i] !== "*";
    if (msg.params[i] === "*") i++;

    // Build caps string from remaining params
    while (msg.params[i]) {
      caps += msg.params[i++];
      if (msg.params[i]) caps += " ";
    }

    // Route to capability negotiator
    if (subcommand === "LS") {
      this.capabilityNegotiator.handleCapLs(serverId, caps, isFinal);
    } else if (subcommand === "ACK") {
      this.capabilityNegotiator.handleCapAck(serverId, caps);
    } else if (subcommand === "NAK") {
      this.capabilityNegotiator.handleCapNak(serverId);
    } else if (subcommand === "NEW") {
      this.capabilityNegotiator.handleCapNew(serverId, caps);
    } else if (subcommand === "DEL") {
      this.capabilityNegotiator.handleCapDel(serverId, caps);
    }
  }

  /**
   * Handle incoming IRC messages
   */
  private handleMessage(data: string, serverId: string): void {
    const server = this.stateManager.getServer(serverId);
    if (!server) {
      console.error(`Server ${serverId} not found`);
      return;
    }

    const serverName = server.name;
    const messages = this.messageParser.parseMultiple(data, serverName);

    for (const message of messages) {
      console.log(
        `IRC Client: Received command ${message.command} from server ${serverId}`,
      );

      // Route message to appropriate handler
      const handled = this.commandRouter.route(message, serverId);
      if (!handled) {
        console.warn(`No handler registered for command: ${message.command}`);
      }
    }
  }

  /**
   * Called after user registration (NICK/USER) to complete connection
   */
  userOnConnect(serverId: string): void {
    const nick = this.stateManager.getNick(serverId);
    if (!nick) {
      console.warn(`No nick found for server ${serverId} in userOnConnect`);
      return;
    }

    // NICK is already sent before CAP negotiation, only send USER now
    this.sendRaw(serverId, `USER ${nick} 0 * :${nick}`);
  }

  // ==================== PUBLIC API ====================

  /**
   * Connect to an IRC server
   */
  async connect(
    name: string,
    host: string,
    port: number,
    nickname: string,
    password?: string,
    saslAccountName?: string,
    saslPassword?: string,
    serverId?: string,
  ): Promise<Server> {
    const actualServerId = serverId || `${host}:${port}`;

    const existingServer = this.stateManager.getServer(actualServerId);
    if (existingServer?.isConnected) {
      return existingServer;
    }

    if (saslAccountName && saslPassword) {
      this.saslAuthenticator.setCredentials(
        actualServerId,
        saslAccountName,
        saslPassword,
      );
      this.stateManager.setSaslEnabled(actualServerId, true);
    }

    const server: Server = {
      id: actualServerId,
      name,
      host,
      port,
      channels: [],
      privateChats: [],
      isConnected: false,
      connectionState: "connecting",
      users: [],
    };

    this.stateManager.addServer(actualServerId, server);
    this.stateManager.setNick(actualServerId, nickname);

    // Initialize current user for this server
    this.stateManager.setCurrentUser(actualServerId, {
      id: `${actualServerId}-${nickname}`,
      username: nickname,
      isOnline: true,
      status: "online",
    });

    await this.connectionManager.connect(
      host,
      port,
      actualServerId,
      (socket: WebSocket) => {
        server.isConnected = true;
        server.connectionState = "connected";

        this.sendRaw(actualServerId, "CAP LS 302");

        this.sendRaw(actualServerId, `NICK ${nickname}`);
        if (password) {
          this.sendRaw(actualServerId, `PASS ${password}`);
        }

        this.pingManager.startPing(actualServerId, (msg: string) => {
          this.sendRaw(actualServerId, msg);
        });
      },
      (data: string, sid: string) => {
        // On message
        this.handleMessage(data, sid);
      },
      () => {
        // On close
        server.isConnected = false;
        server.connectionState = "disconnected";
        this.pingManager.stopPing(actualServerId);

        // Start reconnection
        this.reconnectionManager.startReconnection(actualServerId, async () => {
          await this.connect(
            name,
            host,
            port,
            nickname,
            password,
            saslAccountName,
            saslPassword,
            actualServerId,
          );
        });
      },
      () => {
        // On error
        server.isConnected = false;
        server.connectionState = "disconnected";
      },
    );

    return server;
  }

  /**
   * Disconnect from an IRC server
   */
  disconnect(serverId: string, quitMessage?: string): void {
    this.connectionManager.disconnect(serverId, quitMessage);
    this.reconnectionManager.clearReconnection(serverId);
    this.pingManager.stopPing(serverId);
  }

  /**
   * Send raw IRC command to server
   */
  sendRaw(serverId: string, command: string): void {
    this.connectionManager.sendRaw(serverId, command);
  }

  /**
   * Send a message to a channel or user
   */
  sendMessage(
    serverId: string,
    target: string,
    message: string,
    tags?: Record<string, string>,
  ): void {
    const command = this.messageBuilder.buildPrivmsg(target, message, tags);
    this.sendRaw(serverId, command);
  }

  /**
   * Send a multiline message
   */
  sendMultilineMessage(
    serverId: string,
    target: string,
    lines: string[],
    batchId?: string,
  ): void {
    const commands = this.messageBuilder.buildMultiline(target, lines, batchId);
    for (const cmd of commands) {
      this.sendRaw(serverId, cmd);
    }
  }

  /**
   * Join a channel
   */
  joinChannel(serverId: string, channelName: string, key?: string): Channel {
    const server = this.stateManager.getServer(serverId);
    if (!server) {
      throw new Error(`Server with ID ${serverId} not found`);
    }

    const existing = server.channels.find((c) => c.name === channelName);
    if (existing) return existing;

    const command = key ? `JOIN ${channelName} ${key}` : `JOIN ${channelName}`;
    this.sendRaw(serverId, command);

    if (server.capabilities?.includes("draft/chathistory")) {
      this.sendRaw(serverId, `CHATHISTORY LATEST ${channelName} * 50`);
    }

    const channel: Channel = {
      id: crypto.randomUUID(),
      name: channelName,
      topic: "",
      isPrivate: false,
      serverId,
      unreadCount: 0,
      isMentioned: false,
      messages: [],
      users: [],
      isLoadingHistory: !!server.capabilities?.includes("draft/chathistory"),
      needsWhoRequest: true,
      chathistoryRequested:
        !!server.capabilities?.includes("draft/chathistory"),
    };

    server.channels.push(channel);

    // Trigger event to notify store that history loading started
    if (server.capabilities?.includes("draft/chathistory")) {
      this.triggerEvent("CHATHISTORY_LOADING", {
        serverId,
        channelName,
        isLoading: true,
      });
    }

    return channel;
  }

  /**
   * Part a channel
   */
  partChannel(serverId: string, channelName: string, reason?: string): void {
    const command = reason
      ? `PART ${channelName} :${reason}`
      : `PART ${channelName}`;
    this.sendRaw(serverId, command);
  }

  /**
   * Send a WHOIS query
   */
  whois(serverId: string, target: string): void {
    this.sendRaw(serverId, `WHOIS ${target}`);
  }

  /**
   * Send a WHO query
   */
  who(serverId: string, target: string): void {
    this.sendRaw(serverId, `WHO ${target}`);
  }

  /**
   * Set channel topic
   */
  setTopic(serverId: string, channelName: string, topic: string): void {
    this.sendRaw(serverId, `TOPIC ${channelName} :${topic}`);
  }

  /**
   * Request list of channels from server
   */
  listChannels(
    serverId: string,
    elist?: string,
    filters?: {
      minUsers?: number;
      maxUsers?: number;
      minCreationTime?: number;
      maxCreationTime?: number;
      minTopicTime?: number;
      maxTopicTime?: number;
      mask?: string;
      notMask?: string;
    },
  ): void {
    let command = "LIST";

    if (elist && filters) {
      // Build LIST parameters based on filters and available ELIST capabilities
      const elistTokens = elist.toUpperCase().split("");
      const params: string[] = [];

      // User count filtering (U extension)
      if (elistTokens.includes("U")) {
        if (filters.minUsers && filters.minUsers > 0) {
          params.push(`>${filters.minUsers}`);
        }
        if (filters.maxUsers && filters.maxUsers > 0) {
          params.push(`<${filters.maxUsers}`);
        }
      }

      // Creation time filtering (C extension)
      if (elistTokens.includes("C")) {
        if (filters.minCreationTime && filters.minCreationTime > 0) {
          params.push(`C>${filters.minCreationTime}`);
        }
        if (filters.maxCreationTime && filters.maxCreationTime > 0) {
          params.push(`C<${filters.maxCreationTime}`);
        }
      }

      // Topic time filtering (T extension)
      if (elistTokens.includes("T")) {
        if (filters.minTopicTime && filters.minTopicTime > 0) {
          params.push(`T>${filters.minTopicTime}`);
        }
        if (filters.maxTopicTime && filters.maxTopicTime > 0) {
          params.push(`T<${filters.maxTopicTime}`);
        }
      }

      // Mask filtering (M extension)
      if (elistTokens.includes("M") && filters.mask) {
        params.push(filters.mask);
      }

      // Non-matching mask filtering (N extension)
      if (elistTokens.includes("N") && filters.notMask) {
        params.push(`!${filters.notMask}`);
      }

      if (params.length > 0) {
        command = `LIST ${params.join(" ")}`;
      }
    }

    this.sendRaw(serverId, command);
  }

  /**
   * Rename a channel
   */
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

  /**
   * Set realname
   */
  setName(serverId: string, realname: string): void {
    this.sendRaw(serverId, `SETNAME :${realname}`);
  }

  /**
   * Change nickname
   */
  changeNick(serverId: string, newNick: string): void {
    this.sendRaw(serverId, `NICK ${newNick}`);
  }

  // ==================== METADATA COMMANDS ====================

  metadataGet(serverId: string, target: string, keys: string[]): void {
    this.metadataManager.get(serverId, target, keys);
  }

  metadataList(serverId: string, target: string): void {
    this.metadataManager.list(serverId, target);
  }

  metadataSet(
    serverId: string,
    target: string,
    key: string,
    value?: string,
    visibility?: string,
  ): void {
    this.metadataManager.set(serverId, target, key, value, visibility);
  }

  metadataClear(serverId: string, target: string): void {
    this.metadataManager.clear(serverId, target);
  }

  metadataSub(serverId: string, keys: string[]): void {
    this.metadataManager.subscribe(serverId, keys);
  }

  metadataUnsub(serverId: string, keys: string[]): void {
    this.metadataManager.unsubscribe(serverId, keys);
  }

  metadataSubs(serverId: string): void {
    this.metadataManager.listSubscriptions(serverId);
  }

  metadataSync(serverId: string, target: string): void {
    this.metadataManager.sync(serverId, target);
  }

  // ==================== EXTJWT COMMANDS ====================

  requestExtJwt(serverId: string, target?: string, serviceName?: string): void {
    const targetParam = target || "*";
    const command = serviceName
      ? `EXTJWT ${targetParam} ${serviceName}`
      : `EXTJWT ${targetParam}`;
    this.sendRaw(serverId, command);
  }

  // ==================== MONITOR COMMANDS ====================

  monitorAdd(serverId: string, targets: string[]): void {
    const targetsStr = targets.join(",");
    this.sendRaw(serverId, `MONITOR + ${targetsStr}`);
  }

  monitorRemove(serverId: string, targets: string[]): void {
    const targetsStr = targets.join(",");
    this.sendRaw(serverId, `MONITOR - ${targetsStr}`);
  }

  monitorList(serverId: string): void {
    this.sendRaw(serverId, "MONITOR L");
  }

  monitorClear(serverId: string): void {
    this.sendRaw(serverId, "MONITOR C");
  }

  monitorStatus(serverId: string): void {
    this.sendRaw(serverId, "MONITOR S");
  }

  // ==================== EVENT HANDLERS ====================

  on<K extends EventKey>(event: K, callback: EventCallback<K>): void {
    this.eventEmitter.on(event, callback);
  }

  deleteHook<K extends EventKey>(event: K, callback: EventCallback<K>): void {
    this.eventEmitter.deleteHook(event, callback);
  }

  // ==================== GETTERS ====================

  getServers(): Server[] {
    return this.stateManager.getServers();
  }

  getCurrentUser(serverId?: string): User | null {
    if (!serverId) return null;
    return this.stateManager.getCurrentUser(serverId);
  }

  getAllUsers(serverId: string): User[] {
    return this.stateManager.getAllUsers(serverId);
  }

  getNick(serverId: string): string | undefined {
    return this.stateManager.getNick(serverId);
  }

  // ==================== ADDITIONAL PUBLIC METHODS ====================

  sendTyping(serverId: string, target: string, isActive: boolean): void {
    const typingState = isActive ? "active" : "done";
    this.sendRaw(serverId, `@+typing=${typingState} TAGMSG ${target}`);
  }

  leaveChannel(serverId: string, channelName: string): void {
    const server = this.stateManager.getServer(serverId);
    if (server) {
      this.sendRaw(serverId, `PART ${channelName}`);
      server.channels = server.channels.filter((c) => c.name !== channelName);
    }
  }

  triggerEvent<K extends EventKey>(event: K, data: EventMap[K]): void {
    this.eventEmitter.triggerEvent(event, data);
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

  markChannelAsRead(serverId: string, channelId: string): void {
    const server = this.stateManager.getServer(serverId);
    const channel = server?.channels.find((c) => c.id === channelId);
    if (channel) channel.unreadCount = 0;
  }

  capAck(serverId: string, key: string, capabilities: string): void {
    this.triggerEvent("CAP_ACKNOWLEDGED", { serverId, key, capabilities });
  }

  isCapNegotiationComplete(serverId: string): boolean {
    return this.stateManager.isCapNegotiationComplete(serverId);
  }
}
