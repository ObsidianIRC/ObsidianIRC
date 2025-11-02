import type { ParsedMessage } from "../protocol/messageParser";
import { getNickFromNuh, getTimestampFromTags } from "../utils/ircUtils";
import { BaseHandler } from "./baseHandler";

/**
 * Handles PRIVMSG command
 */
export class PrivmsgHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const target = msg.params[0];
    const isChannel = target.startsWith("#");
    const sender = getNickFromNuh(msg.source);
    const message = msg.params.slice(1).join(" ");

    // Check if this message is part of a multiline batch
    const batchId = msg.tags?.batch;
    if (batchId) {
      const batch = this.stateManager.getBatch(serverId, batchId);
      if (
        batch &&
        (batch.type === "multiline" || batch.type === "draft/multiline")
      ) {
        // Add this message line to the batch
        this.stateManager.addMessageToBatch(
          serverId,
          batchId,
          message,
          sender,
          msg.tags?.msgid,
          getTimestampFromTags(msg.tags),
          msg.tags && msg.tags["draft/multiline-concat"] !== undefined,
        );
        return; // Don't trigger individual message event
      }
    }

    if (isChannel) {
      this.emit("CHANMSG", {
        serverId,
        mtags: msg.tags,
        sender,
        channelName: target,
        message,
        timestamp: getTimestampFromTags(msg.tags),
      });
    } else {
      this.emit("USERMSG", {
        serverId,
        mtags: msg.tags,
        sender,
        target,
        message,
        timestamp: getTimestampFromTags(msg.tags),
      });
    }
  }
}

/**
 * Handles NOTICE command
 */
export class NoticeHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const target = msg.params[0];
    const isChannel = target.startsWith("#");
    const sender = getNickFromNuh(msg.source);
    const message = msg.params.slice(1).join(" ");

    if (isChannel) {
      this.emit("CHANNNOTICE", {
        serverId,
        mtags: msg.tags,
        sender,
        channelName: target,
        message,
        timestamp: getTimestampFromTags(msg.tags),
      });
    } else {
      this.emit("USERNOTICE", {
        serverId,
        mtags: msg.tags,
        sender,
        message,
        timestamp: getTimestampFromTags(msg.tags),
      });
    }
  }
}

/**
 * Handles TAGMSG command
 */
export class TagmsgHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const rawTarget = msg.params[0] || "";
    const target = rawTarget.startsWith(":")
      ? rawTarget.substring(1)
      : rawTarget;
    const sender = getNickFromNuh(msg.source);

    this.emit("TAGMSG", {
      serverId,
      mtags: msg.tags,
      sender,
      channelName: target,
      timestamp: getTimestampFromTags(msg.tags),
    });
  }
}

/**
 * Handles REDACT command
 */
export class RedactHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const target = msg.params[0];
    const msgid = msg.params[1];
    const reason = msg.params[2] ? msg.params[2].substring(1) : "";
    const sender = getNickFromNuh(msg.source);

    this.emit("REDACT", {
      serverId,
      mtags: msg.tags,
      target,
      msgid,
      reason,
      sender,
    });
  }
}
