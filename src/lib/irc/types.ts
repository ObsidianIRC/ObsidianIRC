import type {
  BaseIRCEvent,
  BaseMessageEvent,
  BaseMetadataEvent,
  BaseUserActionEvent,
  Channel,
  ConnectionState,
  EventWithTags,
  MetadataValueEvent,
  Server,
  User,
} from "../../types";

export interface EventMap {
  ready: BaseIRCEvent & { serverName: string; nickname: string };
  connectionStateChange: BaseIRCEvent & {
    serverId: string;
    connectionState: ConnectionState;
  };
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
  RPL_CHANNELMODEIS: BaseIRCEvent & {
    channelName: string;
    modestring: string;
    modeargs: string[];
  };
  CHANMSG: BaseMessageEvent & {
    channelName: string;
  };
  USERMSG: BaseMessageEvent & {
    target: string;
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
    messageIds: string[];
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
  INVITE: EventWithTags & {
    inviter: string;
    target: string;
    channel: string;
  };
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
  WHOX_REPLY: {
    serverId: string;
    channel: string;
    username: string;
    host: string;
    nick: string;
    account: string;
    flags: string;
    realname: string;
    isAway: boolean;
    opLevel: string;
  };
  WHO_END: { serverId: string; mask: string };
  RPL_AWAY: {
    serverId: string;
    nick: string;
    awayMessage: string;
  };
  RPL_YOUREOPER: BaseIRCEvent & {
    message: string;
  };
  RPL_YOURHOST: BaseIRCEvent & {
    serverName: string;
    version: string;
  };
  MONONLINE: BaseIRCEvent & {
    targets: Array<{ nick: string; user?: string; host?: string }>;
  };
  MONOFFLINE: BaseIRCEvent & {
    targets: string[];
  };
  MONLIST: BaseIRCEvent & {
    targets: string[];
  };
  ENDOFMONLIST: BaseIRCEvent;
  MONLISTFULL: BaseIRCEvent & {
    limit: number;
    targets: string[];
  };
  EXTJWT: BaseIRCEvent & {
    requestedTarget: string;
    serviceName: string;
    jwtToken: string;
  };
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
  TOPIC: {
    serverId: string;
    channelName: string;
    topic: string;
    sender: string;
  };
  RPL_TOPIC: {
    serverId: string;
    channelName: string;
    topic: string;
  };
  RPL_TOPICWHOTIME: {
    serverId: string;
    channelName: string;
    setter: string;
    timestamp: number;
  };
  RPL_NOTOPIC: {
    serverId: string;
    channelName: string;
  };
  WHOIS_USER: {
    serverId: string;
    nick: string;
    username: string;
    host: string;
    realname: string;
  };
  WHOIS_SERVER: {
    serverId: string;
    nick: string;
    server: string;
    serverInfo: string;
  };
  WHOIS_IDLE: {
    serverId: string;
    nick: string;
    idle: number;
    signon: number;
  };
  WHOIS_CHANNELS: {
    serverId: string;
    nick: string;
    channels: string;
  };
  WHOIS_SPECIAL: {
    serverId: string;
    nick: string;
    message: string;
  };
  WHOIS_ACCOUNT: {
    serverId: string;
    nick: string;
    account: string;
  };
  WHOIS_SECURE: {
    serverId: string;
    nick: string;
    message: string;
  };
  WHOIS_END: {
    serverId: string;
    nick: string;
  };
}

export type EventKey = keyof EventMap;
export type EventCallback<K extends EventKey> = (data: EventMap[K]) => void;

export type {
  BaseIRCEvent,
  BaseMessageEvent,
  BaseMetadataEvent,
  BaseUserActionEvent,
  Channel,
  ConnectionState,
  EventWithTags,
  MetadataValueEvent,
  Server,
  User,
};
