import type { ParsedMessage } from "../protocol/messageParser";
import { getNickFromNuh } from "../utils/ircUtils";
import { BaseHandler } from "./baseHandler";

/**
 * Handles MODE command
 */
export class ModeHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const sender = getNickFromNuh(msg.source);
    const target = msg.params[0];
    const modestring = msg.params[1] || "";
    const modeargs = msg.params.slice(2);

    this.emit("MODE", {
      serverId,
      mtags: msg.tags,
      sender,
      target,
      modestring,
      modeargs,
    });
  }
}

/**
 * Handles TOPIC command
 */
export class TopicHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channelName = msg.params[0];
    const topic = msg.params.slice(1).join(" ");
    const sender = getNickFromNuh(msg.source);

    this.emit("TOPIC", {
      serverId,
      channelName,
      topic,
      sender,
    });
  }
}

/**
 * Handles RENAME command (draft/channel-rename)
 */
export class RenameHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const user = getNickFromNuh(msg.source);
    const oldName = msg.params[0];
    const newName = msg.params[1];
    const reason = msg.params.slice(2).join(" ");

    this.emit("RENAME", {
      serverId,
      oldName,
      newName,
      reason,
      user,
    });
  }
}

/**
 * Handles SETNAME command
 */
export class SetnameHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const user = getNickFromNuh(msg.source);
    const realname = msg.params.join(" ");

    this.emit("SETNAME", {
      serverId,
      user,
      realname,
    });
  }
}
