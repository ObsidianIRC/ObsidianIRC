// IRCv3 draft/named-modes — protocol-layer parser.
//
// Owns six new numerics + the PROP command:
//
//   964 RPL_CHMODELIST         server -> client: long-form chanmode list
//   965 RPL_UMODELIST          server -> client: long-form usermode list
//   961 RPL_PROPLIST           server -> client: PROP <chan> reply (mode list)
//   960 RPL_ENDOFPROPLIST      ditto, terminator
//   963 RPL_LISTPROPLIST       server -> client: list-mode entry
//   962 RPL_ENDOFLISTPROPLIST  ditto, terminator
//
//   PROP <chan> {+|-}<name>[=<param>] ... — the cap-aware mode wire form
//
// Wire shape for the lists:
//
//   :server XXX <nick> [*] <type>:<name>[=<letter>] ...
//     all-but-last lines carry an asterisk before the entries
//
// Spec: https://github.com/progval/ircv3-specifications/blob/
//       e28f44f8d7b0964c82acd28eea1e35895daf0919/extensions/named-modes.md

import type { NamedModeSpec } from "../../../types";
import type { IRCClientContext } from "../IRCClientContext";
import { getNickFromNuh, getTimestampFromTags } from "../utils";

function parseEntries(tokens: string[]): NamedModeSpec[] {
  const out: NamedModeSpec[] = [];
  for (const tok of tokens) {
    // <type>:<name>[=<letter>] -- per spec, ignore unknown types so
    // future spec revisions don't break us
    const colon = tok.indexOf(":");
    if (colon <= 0) continue;
    const typeNum = Number.parseInt(tok.slice(0, colon), 10);
    if (typeNum < 1 || typeNum > 5) continue;
    const rest = tok.slice(colon + 1);
    const eq = rest.indexOf("=");
    let name: string;
    let letter: string | undefined;
    if (eq === -1) {
      name = rest;
    } else {
      name = rest.slice(0, eq);
      letter = rest.slice(eq + 1) || undefined;
    }
    if (!name) continue;
    out.push({ type: typeNum as 1 | 2 | 3 | 4 | 5, name, letter });
  }
  return out;
}

/**
 * Pull the entries out of a 964/965 line. The first parameter is the
 * recipient nick; if the second is a literal "*" we're in a multi-line
 * advertisement (more lines to come). Either way, every remaining
 * token (with the trailing `:` stripped) is a `<type>:<name>=<letter>`
 * triple.
 */
function parseListAdvertisement(parv: string[]): {
  entries: NamedModeSpec[];
  isFinal: boolean;
} {
  // parv[0] = recipient nick; remove it
  let tokens = parv.slice(1);
  // Optional "*" continuation marker
  let isFinal = true;
  if (tokens.length && tokens[0] === "*") {
    isFinal = false;
    tokens = tokens.slice(1);
  }
  // The trailing param may have a leading colon (IRC trailing-arg form)
  // and may be a single space-separated string.
  if (tokens.length === 1 && tokens[0].startsWith(":")) {
    tokens = tokens[0].slice(1).split(" ");
  } else if (tokens.length) {
    // Last token (if it was the trailing) loses its leading colon
    if (tokens[tokens.length - 1].startsWith(":")) {
      tokens[tokens.length - 1] = tokens[tokens.length - 1].slice(1);
    }
  }
  return { entries: parseEntries(tokens.filter((t) => t.length > 0)), isFinal };
}

export function handleRplChmodelist(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const { entries, isFinal } = parseListAdvertisement(parv);
  ctx.triggerEvent("NAMED_MODES_CHANMODE_LIST", {
    serverId,
    entries,
    isFinal,
  });
}

export function handleRplUmodelist(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const { entries, isFinal } = parseListAdvertisement(parv);
  ctx.triggerEvent("NAMED_MODES_UMODE_LIST", {
    serverId,
    entries,
    isFinal,
  });
}

/** PROP <chan> -- mode-state list reply (961). Emits one event per
 *  line; the store collects them until ENDOFPROPLIST 960 fires. */
export function handleRplProplist(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  // parv: <nick> <chan> [<modename>[=<param>] ...]
  const channel = parv[1];
  const items = parv.slice(2).map((s) => (s.startsWith(":") ? s.slice(1) : s));
  // The trailing param can carry multiple space-separated entries.
  const flat: string[] = [];
  for (const item of items) {
    for (const t of item.split(" ")) {
      if (t.length) flat.push(t);
    }
  }
  ctx.triggerEvent("NAMED_MODES_PROPLIST", {
    serverId,
    channel,
    items: flat,
  });
}

export function handleRplEndOfProplist(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const channel = parv[1];
  ctx.triggerEvent("NAMED_MODES_PROPLIST_END", { serverId, channel });
}

/** PROP <chan> <listmode> entry (963). */
export function handleRplListProplist(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  // <nick> <chan> <modename> <mask> [<setter> <settime>]
  const channel = parv[1];
  const modeName = parv[2];
  const mask = parv[3];
  const setter = parv[4];
  const settimeRaw = parv[5];
  const settime = settimeRaw
    ? Number.parseInt(settimeRaw.replace(/^:/, ""), 10) || 0
    : 0;
  ctx.triggerEvent("NAMED_MODES_LISTPROPLIST", {
    serverId,
    channel,
    modeName,
    mask,
    setter: setter ? setter.replace(/^:/, "") : "",
    settime,
  });
}

export function handleRplEndOfListProplist(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  _mtags: Record<string, string> | undefined,
): void {
  const channel = parv[1];
  const modeName = parv[2];
  ctx.triggerEvent("NAMED_MODES_LISTPROPLIST_END", {
    serverId,
    channel,
    modeName,
  });
}

/**
 * Parse a server-pushed PROP command. Wire form mirrors the client
 * side: `:src PROP <target> {+|-}<name>[=<param>] ...`
 *
 * Emits NAMED_MODES_PROP for any subscriber that wants the rich form,
 * AND a synthesised MODE event so existing UI paths keep working.
 */
export function handleProp(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const sender = getNickFromNuh(source);
  const target = parv[0];
  // Remaining args are the mode change items; the trailing one may
  // start with `:` (IRC trailing-arg form) and may pack multiple
  // space-separated entries.
  const tail: string[] = [];
  for (let i = 1; i < parv.length; i++) {
    const piece =
      i === parv.length - 1 && parv[i].startsWith(":")
        ? parv[i].slice(1)
        : parv[i];
    for (const t of piece.split(" ")) {
      if (t.length) tail.push(t);
    }
  }

  const items: Array<{ sign: "+" | "-"; name: string; param?: string }> =
    tail.map((tok) => {
      const sign: "+" | "-" = tok[0] === "-" ? "-" : "+";
      const body = tok[0] === "+" || tok[0] === "-" ? tok.slice(1) : tok;
      const eq = body.indexOf("=");
      const name = eq === -1 ? body : body.slice(0, eq);
      const param = eq === -1 ? undefined : body.slice(eq + 1);
      return { sign, name, param };
    });

  ctx.triggerEvent("NAMED_MODES_PROP", {
    serverId,
    mtags,
    sender,
    target,
    items,
    timestamp: getTimestampFromTags(mtags),
  });
}
