import type { IRCClientContext } from "../IRCClientContext";

export function handleMetadata(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const target = parv[0];
  const key = parv[1];
  const value = parv[parv.length - 1] || "";
  const optionalParams = parv.length > 2 ? parv.slice(2, -1) : [];
  const visibility = optionalParams.length > 0 ? optionalParams[0] : "";

  ctx.triggerEvent("METADATA", {
    serverId,
    target,
    key,
    visibility,
    value,
  });
}

export function handleMetadataWhoisKeyValue(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const target = parv[0];
  const key = parv[1];
  const visibility = parv[2];
  const value = parv.slice(3).join(" ");
  ctx.triggerEvent("METADATA_WHOIS", {
    serverId,
    target,
    key,
    visibility,
    value,
  });
}

export function handleMetadataKeyValue(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const _recipient = parv[0];
  const target = parv[1];
  let key = parv[2];
  let visibility = parv[3];
  let valueStartIndex = 4;

  if (parv[1] === parv[2] && parv.length > 5) {
    key = parv[3];
    visibility = parv[4];
    valueStartIndex = 5;
  }

  const value = parv.slice(valueStartIndex).join(" ");
  const cleanValue = value.startsWith(":") ? value.substring(1) : value;

  ctx.triggerEvent("METADATA_KEYVALUE", {
    serverId,
    target,
    key,
    visibility,
    value: cleanValue,
  });
}

export function handleMetadataKeyNotSet(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const target = parv[0];
  const key = parv[1];
  ctx.triggerEvent("METADATA_KEYNOTSET", { serverId, target, key });
}

export function handleMetadataSubOk(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const _target = parv[0];
  const keys = parv
    .slice(1)
    .map((key) => (key.startsWith(":") ? key.substring(1) : key));
  ctx.triggerEvent("METADATA_SUBOK", { serverId, keys });
}

export function handleMetadataUnsubOk(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const _target = parv[0];
  const keys = parv
    .slice(1)
    .map((key) => (key.startsWith(":") ? key.substring(1) : key));
  ctx.triggerEvent("METADATA_UNSUBOK", { serverId, keys });
}

export function handleMetadataSubs(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const _target = parv[0];
  const keys = parv
    .slice(1)
    .map((key) => (key.startsWith(":") ? key.substring(1) : key));
  ctx.triggerEvent("METADATA_SUBS", { serverId, keys });
}

export function handleMetadataSyncLater(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const target = parv[0];
  const retryAfter = parv[1] ? Number.parseInt(parv[1], 10) : undefined;
  ctx.triggerEvent("METADATA_SYNCLATER", { serverId, target, retryAfter });
}

export function handleMetadataFail(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const subcommand = parv[1];
  const code = parv[2];

  let paramCount = parv.length;
  let _errorMessage = "";

  if (paramCount > 3) {
    const lastParam = parv[paramCount - 1];
    if (lastParam && Number.isNaN(Number.parseInt(lastParam, 10))) {
      _errorMessage = lastParam;
      paramCount = paramCount - 1;
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

  ctx.triggerEvent("METADATA_FAIL", {
    serverId,
    subcommand,
    code,
    target,
    key,
    retryAfter,
  });
}
