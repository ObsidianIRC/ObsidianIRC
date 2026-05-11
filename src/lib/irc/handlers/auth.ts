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

// IRCv3 standard-replies wire form:
//   <prefix> {FAIL,WARN,NOTE,SUCCESS} <command> <code> [<context>...] :<description>
// `description` is the human-readable text, always the trailing param.
// `context` is zero or more identifiers (channel, nick, account) the
// description refers to. `command` and `code` are computer-readable tokens.
function splitStandardReply(
  parv: string[],
  trailing: string,
): { command: string; code: string; context: string[]; message: string } {
  const command = parv[0];
  const code = parv[1];
  // The parser pushes the trailing param onto parv as its last element when
  // present. Pop it back off so context = the strings strictly between code
  // and the description.
  const hasTrailing = trailing.length > 0;
  const ctxEnd = hasTrailing ? parv.length - 1 : parv.length;
  const context = parv.slice(2, ctxEnd);
  const message = hasTrailing ? trailing : parv.slice(2).join(" ");
  return { command, code, context, message };
}

export function handleFail(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
  trailing = "",
): void {
  const { command, code, context, message } = splitStandardReply(
    parv,
    trailing,
  );
  ctx.triggerEvent("FAIL", {
    serverId,
    mtags,
    command,
    code,
    target: context[0],
    context,
    message,
  });
}

export function handleWarn(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
  trailing = "",
): void {
  const { command, code, context, message } = splitStandardReply(
    parv,
    trailing,
  );
  ctx.triggerEvent("WARN", {
    serverId,
    mtags,
    command,
    code,
    target: context[0],
    context,
    message,
  });
}

export function handleNote(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
  trailing = "",
): void {
  const { command, code, context, message } = splitStandardReply(
    parv,
    trailing,
  );
  ctx.triggerEvent("NOTE", {
    serverId,
    mtags,
    command,
    code,
    target: context[0],
    context,
    message,
  });
}

export function handleSuccess(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
  trailing = "",
): void {
  const { command, code, context, message } = splitStandardReply(
    parv,
    trailing,
  );
  ctx.triggerEvent("SUCCESS", {
    serverId,
    mtags,
    command,
    code,
    target: context[0],
    context,
    message,
  });
}

export function handleRegister(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
  trailing = "",
): void {
  const subcommand = parv[0];
  // REGISTER replies: REGISTER {SUCCESS,VERIFICATION_REQUIRED} <account> :<description>
  // The description is the trailing param.
  const account = parv[1];
  const message = trailing || parv.slice(2).join(" ");
  if (subcommand === "SUCCESS") {
    ctx.triggerEvent("REGISTER_SUCCESS", { serverId, mtags, account, message });
  } else if (subcommand === "VERIFICATION_REQUIRED") {
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
