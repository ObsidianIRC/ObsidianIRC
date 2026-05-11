import type { IRCClientContext } from "../IRCClientContext";
import { getHostFromNuh, getNickFromNuh, getUserFromNuh } from "../utils";

export function handleNick(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const oldNick = getNickFromNuh(source);
  let newNick = parv[0];

  if (newNick.startsWith(":")) {
    newNick = newNick.substring(1);
  }

  if (oldNick === ctx.nicks.get(serverId)) {
    ctx.nicks.set(serverId, newNick);
    const currentUser = ctx.currentUsers.get(serverId);
    if (currentUser) {
      ctx.currentUsers.set(serverId, {
        ...currentUser,
        username: newNick,
      });
    }
  }

  ctx.triggerEvent("NICK", {
    serverId,
    mtags,
    batchTag: mtags?.batch,
    oldNick,
    newNick,
  });
}

export function handleQuit(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const username = getNickFromNuh(source);
  const reason = parv.join(" ");
  ctx.triggerEvent("QUIT", {
    serverId,
    username,
    reason,
    batchTag: mtags?.batch,
    time: mtags?.time,
  });
}

export function handleAway(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const username = getNickFromNuh(source);
  const awayMessage = parv.length > 0 ? parv.join(" ") : undefined;
  ctx.triggerEvent("AWAY", {
    serverId,
    username,
    awayMessage,
  });
}

export function handleChghost(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const username = getNickFromNuh(source);
  const newUser = parv[0];
  const newHost = parv[1];
  // Track our own ident/host — works with chghost alone, and is guaranteed with draft/whoami
  if (username === ctx.nicks.get(serverId)) {
    ctx.myIdents.set(serverId, newUser);
    ctx.myHosts.set(serverId, newHost);
  }
  ctx.triggerEvent("CHGHOST", {
    serverId,
    username,
    newUser,
    newHost,
  });
}

export function handleJoin(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const username = getNickFromNuh(source);
  const channelName = parv[0][0] === ":" ? parv[0].substring(1) : parv[0];

  let account: string | undefined;
  let realname: string | undefined;

  if (parv.length >= 2) {
    account = parv[1] === "*" ? undefined : parv[1];
    if (parv.length >= 3) {
      realname = parv.slice(2).join(" ");
    }
  }

  ctx.triggerEvent("JOIN", {
    serverId,
    username,
    channelName,
    batchTag: mtags?.batch,
    time: mtags?.time,
    account,
    realname,
  });
}

export function handlePart(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const username = getNickFromNuh(source);
  const channelName = parv[0];
  parv[0] = "";
  const reason = parv.join(" ").trim();
  ctx.triggerEvent("PART", {
    serverId,
    username,
    channelName,
    reason,
    batchTag: mtags?.batch,
    time: mtags?.time,
  });
}

export function handleKick(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const username = getNickFromNuh(source);
  const channelName = parv[0];
  const target = parv[1];
  parv[0] = "";
  parv[1] = "";
  const reasonText = parv.join(" ").trim();
  const reason = reasonText.startsWith(":")
    ? reasonText.substring(1)
    : reasonText;
  ctx.triggerEvent("KICK", {
    serverId,
    mtags,
    username,
    channelName,
    target,
    reason,
  });
}

export function handleInvite(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const inviter = getNickFromNuh(source);
  const target = parv[0];
  const channel = parv[1];
  ctx.triggerEvent("INVITE", {
    serverId,
    mtags,
    inviter,
    target,
    channel,
  });
}

export function handleRplInviting(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  // parv: [yourNick, invitedNick, #channel]
  const target = parv[1];
  const channel = parv[2];
  if (!target || !channel) return;
  ctx.triggerEvent("INVITE_SENT", { serverId, target, channel });
}

export function handleSetname(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const user = getNickFromNuh(source);
  const realname = parv.join(" ");
  // Pass ident+host from the source NUH so the store can initialise self-prefix
  // on the draft/whoami registration-burst SETNAME (source is a full nick!ident@host)
  const ident = source.includes("!") ? getUserFromNuh(source) : undefined;
  const host = source.includes("@") ? getHostFromNuh(source) : undefined;
  ctx.triggerEvent("SETNAME", {
    serverId,
    user,
    realname,
    ident,
    host,
  });
}

export function handleRplUnaway(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const message = parv.slice(1).join(" ");
  ctx.triggerEvent("RPL_UNAWAY", {
    serverId,
    message,
  });
}

export function handleRplNowaway(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const message = parv.slice(1).join(" ");
  ctx.triggerEvent("RPL_NOWAWAY", {
    serverId,
    message,
  });
}

export function handleRplAway(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const nick = parv[1];
  const awayMessage = parv.slice(2).join(" ");
  ctx.triggerEvent("RPL_AWAY", {
    serverId,
    nick,
    awayMessage,
  });
}

export function handleNickError431(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const message = parv.join(" ");
  ctx.triggerEvent("NICK_ERROR", {
    serverId,
    code: "431",
    error: "No nickname given",
    message,
  });
}

export function handleNickError432(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const nick = parv[1];
  const message = parv.slice(2).join(" ").substring(1);
  ctx.triggerEvent("NICK_ERROR", {
    serverId,
    code: "432",
    error: "Invalid nickname",
    nick,
    message,
  });
}

export function handleNickError433(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const nick = parv[1];
  const message = parv.slice(2).join(" ").substring(1);
  ctx.triggerEvent("NICK_ERROR", {
    serverId,
    code: "433",
    error: "Nickname already in use",
    nick,
    message,
  });
}

export function handleNickError436(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const nick = parv[1];
  const message = parv.slice(2).join(" ").substring(1);
  ctx.triggerEvent("NICK_ERROR", {
    serverId,
    code: "436",
    error: "Nickname collision",
    nick,
    message,
  });
}
