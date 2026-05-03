import type { IRCClientContext } from "../IRCClientContext";

export function handleAuthenticate(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const param = parv.join(" ");
  ctx.triggerEvent("AUTHENTICATE", { serverId, param });
}

export function handleFail(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const cmd = parv[0];
  const code = parv[1];
  const target = parv[2] || undefined;
  const message = parv.slice(3).join(" ").substring(1);
  ctx.triggerEvent("FAIL", {
    serverId,
    mtags,
    command: cmd,
    code,
    target,
    message,
  });
}

export function handleWarn(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const cmd = parv[0];
  const code = parv[1];
  const target = parv[2] || undefined;
  const message = parv.slice(3).join(" ").substring(1);
  ctx.triggerEvent("WARN", {
    serverId,
    mtags,
    command: cmd,
    code,
    target,
    message,
  });
}

export function handleNote(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const cmd = parv[0];
  const code = parv[1];
  const target = parv[2] || undefined;
  const message = parv.slice(3).join(" ").substring(1);
  ctx.triggerEvent("NOTE", {
    serverId,
    mtags,
    command: cmd,
    code,
    target,
    message,
  });
}

export function handleSuccess(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const cmd = parv[0];
  const code = parv[1];
  const target = parv[2] || undefined;
  const message = parv.slice(3).join(" ").substring(1);
  ctx.triggerEvent("SUCCESS", {
    serverId,
    mtags,
    command: cmd,
    code,
    target,
    message,
  });
}

export function handleRegister(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const subcommand = parv[0];
  if (subcommand === "SUCCESS") {
    const account = parv[1];
    const message = parv.slice(2).join(" ").substring(1);
    ctx.triggerEvent("REGISTER_SUCCESS", {
      serverId,
      mtags,
      account,
      message,
    });
  } else if (subcommand === "VERIFICATION_REQUIRED") {
    const account = parv[1];
    const message = parv.slice(2).join(" ").substring(1);
    ctx.triggerEvent("REGISTER_VERIFICATION_REQUIRED", {
      serverId,
      mtags,
      account,
      message,
    });
  }
}

// VERIFY SUCCESS currently produces no event (no-op in original code)
export function handleVerify(
  _ctx: IRCClientContext,
  _serverId: string,
  _source: string,
  _parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  // original code only handles VERIFY SUCCESS with local variables, fires no event
}

// draft/authtoken: TOKEN GENERATE / TOKEN SERVICE.  TOKEN VALIDATE/CLAIM
// is server-internal (only sent by other servers, never to clients) so
// we don't dispatch on it.
export function handleToken(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const sub = parv[0]?.toUpperCase();
  if (sub === "GENERATE") {
    // TOKEN GENERATE <service> <url> :<token>
    const service = parv[1] ?? "";
    const url = parv[2] ?? "";
    const token = (parv[3] ?? "").replace(/^:/, "");
    ctx.triggerEvent("TOKEN_GENERATE", { serverId, service, url, token });
    return;
  }
  if (sub === "SERVICE") {
    // TOKEN SERVICE <name> <url> :<description> -- batched inside
    // draft/authtoken; we just emit one event per line.
    const service = parv[1] ?? "";
    const url = parv[2] ?? "";
    const description = (parv[3] ?? "").replace(/^:/, "");
    ctx.triggerEvent("TOKEN_SERVICE", { serverId, service, url, description });
    return;
  }
  // CLAIM and VALIDATE never reach a client; ignore quietly.
}
