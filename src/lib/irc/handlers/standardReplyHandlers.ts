import type { ParsedMessage } from "../protocol/messageParser";
import { BaseHandler } from "./baseHandler";

/**
 * Handles FAIL command (IRCv3 standard replies)
 */
export class FailHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const cmd = msg.params[0];
    const code = msg.params[1];
    const target = msg.params[2] || undefined;
    const message = msg.params.slice(3).join(" ");

    this.emit("FAIL", {
      serverId,
      mtags: msg.tags,
      command: cmd,
      code,
      target,
      message,
    });
  }
}

/**
 * Handles WARN command (IRCv3 standard replies)
 */
export class WarnHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const cmd = msg.params[0];
    const code = msg.params[1];
    const target = msg.params[2] || undefined;
    const message = msg.params.slice(3).join(" ");

    this.emit("WARN", {
      serverId,
      mtags: msg.tags,
      command: cmd,
      code,
      target,
      message,
    });
  }
}

/**
 * Handles NOTE command (IRCv3 standard replies)
 */
export class NoteHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const cmd = msg.params[0];
    const code = msg.params[1];
    const target = msg.params[2] || undefined;
    const message = msg.params.slice(3).join(" ");

    this.emit("NOTE", {
      serverId,
      mtags: msg.tags,
      command: cmd,
      code,
      target,
      message,
    });
  }
}

/**
 * Handles SUCCESS command (IRCv3 standard replies)
 */
export class SuccessHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const cmd = msg.params[0];
    const code = msg.params[1];
    const target = msg.params[2] || undefined;
    const message = msg.params.slice(3).join(" ");

    this.emit("SUCCESS", {
      serverId,
      mtags: msg.tags,
      command: cmd,
      code,
      target,
      message,
    });
  }
}
