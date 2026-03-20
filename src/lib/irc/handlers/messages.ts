import type { IRCClientContext } from "../IRCClientContext";
import { getNickFromNuh, getTimestampFromTags } from "../utils";

export function handlePrivmsg(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const target = parv[0];
  const isChannel = target.startsWith("#");
  const sender = getNickFromNuh(source);
  const message = parv.slice(1).join(" ");

  const batchId = mtags?.batch;
  if (batchId) {
    const serverBatches = ctx.activeBatches.get(serverId);
    const batch = serverBatches?.get(batchId);
    if (
      batch &&
      (batch.type === "multiline" || batch.type === "draft/multiline")
    ) {
      batch.messages.push(message);

      if (!batch.sender) {
        batch.sender = sender;
      }

      if (mtags?.msgid && batch.messageIds) {
        batch.messageIds.push(mtags.msgid);
      }

      if (batch.timestamps) {
        batch.timestamps.push(getTimestampFromTags(mtags));
      }

      const hasMultilineConcat =
        mtags && mtags["draft/multiline-concat"] !== undefined;
      if (batch.concatFlags) {
        batch.concatFlags.push(!!hasMultilineConcat);
      }

      return;
    }
  }

  if (isChannel) {
    const channelName = target;
    ctx.triggerEvent("CHANMSG", {
      serverId,
      mtags,
      sender,
      channelName,
      message,
      timestamp: getTimestampFromTags(mtags),
    });
  } else {
    ctx.triggerEvent("USERMSG", {
      serverId,
      mtags,
      sender,
      target,
      message,
      timestamp: getTimestampFromTags(mtags),
    });
  }
}

export function handleNotice(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const target = parv[0];
  const isChannel = target.startsWith("#");
  const sender = getNickFromNuh(source);
  const message = parv.slice(1).join(" ");

  if (isChannel) {
    const channelName = target;
    ctx.triggerEvent("CHANNNOTICE", {
      serverId,
      mtags,
      sender,
      channelName,
      message,
      timestamp: getTimestampFromTags(mtags),
    });
  } else {
    ctx.triggerEvent("USERNOTICE", {
      serverId,
      mtags,
      sender,
      message,
      timestamp: getTimestampFromTags(mtags),
    });
  }
}

export function handleTagmsg(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const rawTarget = parv[0] || "";
  const target = rawTarget.startsWith(":") ? rawTarget.substring(1) : rawTarget;
  const sender = getNickFromNuh(source);
  ctx.triggerEvent("TAGMSG", {
    serverId,
    mtags,
    sender,
    channelName: target,
    timestamp: getTimestampFromTags(mtags),
  });
}

export function handleRedact(
  ctx: IRCClientContext,
  serverId: string,
  source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const target = parv[0];
  const msgid = parv[1];
  const reason = parv[2] ? parv[2].substring(1) : "";
  const sender = getNickFromNuh(source);
  ctx.triggerEvent("REDACT", {
    serverId,
    mtags,
    target,
    msgid,
    reason,
    sender,
  });
}

export function handleBatch(
  ctx: IRCClientContext,
  serverId: string,
  _source: string,
  parv: string[],
  mtags: Record<string, string> | undefined,
): void {
  const batchRef = parv[0];
  const isStart = batchRef.startsWith("+");
  const batchId = batchRef.substring(1);

  if (isStart) {
    const batchType = parv[1];
    const parameters = parv.slice(2);

    if (!ctx.activeBatches.has(serverId)) {
      ctx.activeBatches.set(serverId, new Map());
    }

    ctx.activeBatches.get(serverId)?.set(batchId, {
      type: batchType,
      parameters,
      messages: [],
      timestamps: [],
      concatFlags: [],
      messageIds: [],
      batchMsgId: mtags?.msgid,
      batchTime: mtags?.time ? new Date(mtags.time) : undefined,
      batchTags: mtags,
    });

    ctx.triggerEvent("BATCH_START", {
      serverId,
      batchId,
      type: batchType,
      parameters,
    });
  } else {
    const serverBatches = ctx.activeBatches.get(serverId);
    const batch = serverBatches?.get(batchId);

    if (
      batch &&
      (batch.type === "multiline" || batch.type === "draft/multiline")
    ) {
      const target =
        batch.parameters && batch.parameters.length > 0
          ? batch.parameters[0]
          : "";
      const sender = batch.sender || "unknown";

      let combinedMessage = "";
      batch.messages.forEach((message, index) => {
        const wasConcat = batch.concatFlags?.[index];

        if (index === 0) {
          combinedMessage = message;
        } else {
          if (wasConcat) {
            combinedMessage += message;
          } else {
            combinedMessage += `\n${message}`;
          }
        }
      });

      ctx.triggerEvent("MULTILINE_MESSAGE", {
        serverId,
        mtags:
          batch.batchTags ||
          (batch.batchMsgId ? { msgid: batch.batchMsgId } : undefined),
        sender,
        channelName: target.startsWith("#") ? target : undefined,
        target,
        message: combinedMessage,
        lines: batch.messages,
        messageIds: batch.messageIds || [],
        timestamp:
          batch.batchTime ||
          (batch.timestamps && batch.timestamps.length > 0
            ? new Date(Math.min(...batch.timestamps.map((t) => t.getTime())))
            : getTimestampFromTags(mtags)),
      });
    }

    serverBatches?.delete(batchId);

    ctx.triggerEvent("BATCH_END", {
      serverId,
      batchId,
    });
  }
}
