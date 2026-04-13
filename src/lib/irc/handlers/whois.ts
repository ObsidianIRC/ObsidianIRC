import type { IRCClientContext } from "../IRCClientContext";

export function handleWhoisUser(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const nick = parv[1];
  const username = parv[2];
  const host = parv[3];
  const realname = parv.slice(5).join(" ");
  ctx.triggerEvent("WHOIS_USER", {
    serverId,
    nick,
    username,
    host,
    realname,
  });
}

export function handleWhoisServer(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const nick = parv[1];
  const server = parv[2];
  const serverInfo = parv.slice(3).join(" ");
  ctx.triggerEvent("WHOIS_SERVER", {
    serverId,
    nick,
    server,
    serverInfo,
  });
}

export function handleWhoisIdle(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const nick = parv[1];
  const idle = Number.parseInt(parv[2], 10);
  const signon = Number.parseInt(parv[3], 10);
  ctx.triggerEvent("WHOIS_IDLE", {
    serverId,
    nick,
    idle,
    signon,
  });
}

export function handleWhoisEnd(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const nick = parv[1];
  ctx.triggerEvent("WHOIS_END", { serverId, nick });
}

export function handleWhoisChannels(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const nick = parv[1];
  const channels = parv.slice(2).join(" ");
  ctx.triggerEvent("WHOIS_CHANNELS", { serverId, nick, channels });
}

export function handleWhoisSpecial(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const nick = parv[1];
  const message = parv.slice(2).join(" ");
  ctx.triggerEvent("WHOIS_SPECIAL", { serverId, nick, message });
}

export function handleWhoisAccount(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const nick = parv[1];
  const account = parv[2];
  ctx.triggerEvent("WHOIS_ACCOUNT", { serverId, nick, account });
}

export function handleWhoisSecure(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const nick = parv[1];
  const message = parv.slice(2).join(" ");
  ctx.triggerEvent("WHOIS_SECURE", { serverId, nick, message });
}

export function handleWhoisBot(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const nick = parv[0];
  const target = parv[1];
  const message = parv.slice(2).join(" ");
  ctx.triggerEvent("WHOIS_BOT", { serverId, nick, target, message });
}

export function handleWhoReply(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const channel = parv[1];
  const username = parv[2];
  const host = parv[3];
  const server = parv[4];
  const nick = parv[5];
  const flags = parv[6];

  const trailing = parv[7] || "";
  const spaceIndex = trailing.indexOf(" ");
  let hopcount = trailing;
  let realname = "";

  if (spaceIndex !== -1) {
    hopcount = trailing.substring(0, spaceIndex);
    realname = trailing.substring(spaceIndex + 1);
  }

  ctx.triggerEvent("WHO_REPLY", {
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
}

export function handleWhoxReply(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const channel = parv[1];
  const username = parv[2];
  const host = parv[3];
  const nick = parv[4];
  const flags = parv[5];
  const account = parv[6];
  const _opLevelField = parv[7] || "";
  const realname = parv[8] || "";

  const isAway = flags.includes("G");

  let opLevel = "";
  if (flags.length > 1) {
    const statusPart = flags.substring(1);
    opLevel = statusPart
      .split("")
      .filter((char) => ["@", "+", "~", "%", "&"].includes(char))
      .join("");
  }

  ctx.triggerEvent("WHOX_REPLY", {
    serverId,
    channel,
    username,
    host,
    nick,
    account,
    flags,
    realname,
    isAway,
    opLevel,
  });
}

export function handleWhoEnd(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const mask = parv[1];
  ctx.triggerEvent("WHO_END", { serverId, mask });
}
