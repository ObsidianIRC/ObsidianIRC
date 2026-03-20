import type { IRCClientContext } from "../IRCClientContext";

export function handleMonOnline(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const targetList = parv.slice(1).join(" ");
  const cleanTargetList = targetList.startsWith(":")
    ? targetList.substring(1)
    : targetList;
  const targets = cleanTargetList.split(",").map((target) => {
    const parts = target.split("!");
    if (parts.length === 2) {
      const [nick, userhost] = parts;
      const [user, host] = userhost.split("@");
      return { nick, user, host };
    }
    return { nick: target };
  });
  ctx.triggerEvent("MONONLINE", { serverId, targets });
}

export function handleMonOffline(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const targetList = parv.slice(1).join(" ");
  const cleanTargetList = targetList.startsWith(":")
    ? targetList.substring(1)
    : targetList;
  const targets = cleanTargetList.split(",");
  ctx.triggerEvent("MONOFFLINE", { serverId, targets });
}

export function handleMonList(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const targetList = parv.slice(1).join(" ");
  const cleanTargetList = targetList.startsWith(":")
    ? targetList.substring(1)
    : targetList;
  const targets = cleanTargetList.split(",");
  ctx.triggerEvent("MONLIST", { serverId, targets });
}

export function handleEndOfMonList(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  _parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  ctx.triggerEvent("ENDOFMONLIST", { serverId });
}

export function handleMonListFull(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const limit = Number.parseInt(parv[1], 10);
  const targetList = parv[2];
  const targets = targetList.split(",");
  ctx.triggerEvent("MONLISTFULL", { serverId, limit, targets });
}
