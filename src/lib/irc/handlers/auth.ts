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
  // draft/account-recovery typed projections so components don't
  // have to filter the FAIL stream by command on every render.
  if (cmd === "RECOVER")
    ctx.triggerEvent("RECOVER_FAIL", { serverId, mtags, code, message });
  else if (cmd === "SETPASS")
    ctx.triggerEvent("SETPASS_FAIL", { serverId, mtags, code, message });
  // draft/persistence FAIL projection
  else if (cmd === "PERSISTENCE")
    ctx.triggerEvent("PERSISTENCE_FAIL", { serverId, mtags, code, message });
  // draft/read-marker FAIL projection.  The MARKREAD FAIL form has
  // an optional <target> in parv[2]; the message is whatever's left.
  else if (cmd === "MARKREAD") {
    ctx.triggerEvent("MARKREAD_FAIL", {
      serverId,
      mtags,
      code,
      target,
      message,
    });
  }
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
  if (cmd === "2FA") {
    ctx.triggerEvent("TWOFA_NOTE", {
      serverId,
      mtags,
      code,
      args: parv.slice(2),
    });
  }
  // draft/account-recovery typed projections
  if (cmd === "RECOVER") {
    ctx.triggerEvent("RECOVER_NOTE", {
      serverId,
      mtags,
      code,
      args: parv.slice(2),
    });
  } else if (cmd === "SETPASS") {
    ctx.triggerEvent("SETPASS_NOTE", {
      serverId,
      mtags,
      code,
      args: parv.slice(2),
    });
  }
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

// `:server 2FA <subcommand> [SUCCESS] [arg ...] :description`
// Examples:
//   :server 2FA ADD SUCCESS totp cred-1 :Credential 'Phone' registered.
//   :server 2FA REMOVE SUCCESS cred-1 :...
//   :server 2FA ENABLE SUCCESS :...
//   :server 2FA DISABLE SUCCESS :...
export function handleTwoFA(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const subcommand = parv[0];
  const status = parv[1];
  const args = parv.slice(2);
  ctx.triggerEvent("TWOFA", {
    serverId,
    mtags,
    subcommand,
    status,
    args,
  });
}

export function handleExtjwt(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const requestedTarget = parv[0];
  const serviceName = parv[1];
  let jwtToken: string;
  if (parv[2] === "*") {
    jwtToken = parv[3];
  } else {
    jwtToken = parv[2];
  }
  ctx.triggerEvent("EXTJWT", {
    serverId,
    requestedTarget,
    serviceName,
    jwtToken,
  });
}

// draft/persistence: server reply to PERSISTENCE GET / SET
//   :server PERSISTENCE STATUS <client-setting> <effective-setting>
// where client-setting is ON | OFF | DEFAULT and effective is ON | OFF.
export function handlePersistence(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const sub = parv[0]?.toUpperCase();
  if (sub !== "STATUS") return;
  const rawPref = (parv[1] ?? "").toUpperCase();
  const rawEff = (parv[2] ?? "").toUpperCase();
  const preference: "ON" | "OFF" | "DEFAULT" =
    rawPref === "ON" || rawPref === "OFF" ? rawPref : "DEFAULT";
  const effective: "ON" | "OFF" = rawEff === "ON" ? "ON" : "OFF";
  ctx.triggerEvent("PERSISTENCE_STATUS", { serverId, preference, effective });
}
