import type { ParsedMessage } from "../protocol/messageParser";
import { getNickFromNuh } from "../utils/ircUtils";
import { BaseHandler } from "./baseHandler";

export class NickHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const oldNick = getNickFromNuh(msg.source);
    let newNick = msg.params[0];

    if (newNick.startsWith(":")) {
      newNick = newNick.substring(1);
    }

    if (oldNick === this.getNick(serverId)) {
      this.stateManager.setNick(serverId, newNick);
      this.stateManager.updateCurrentUser(serverId, { username: newNick });
    }

    this.emit("NICK", {
      serverId,
      mtags: msg.tags,
      oldNick,
      newNick,
    });
  }
}

export class JoinHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const username = getNickFromNuh(msg.source);
    const channelName =
      msg.params[0][0] === ":" ? msg.params[0].substring(1) : msg.params[0];

    let account: string | undefined;
    let realname: string | undefined;

    if (msg.params.length >= 2) {
      account = msg.params[1] === "*" ? undefined : msg.params[1];
      if (msg.params.length >= 3) {
        realname = msg.params.slice(2).join(" ");
      }
    }

    this.emit("JOIN", {
      serverId,
      username,
      channelName,
      batchTag: msg.tags?.batch,
      account,
      realname,
    });
  }
}

export class PartHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const username = getNickFromNuh(msg.source);
    const channelName = msg.params[0];
    const reason = msg.params.slice(1).join(" ").trim();

    this.emit("PART", {
      serverId,
      username,
      channelName,
      reason: reason || undefined,
    });
  }
}

export class QuitHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const username = getNickFromNuh(msg.source);
    const reason = msg.params.join(" ");

    this.emit("QUIT", {
      serverId,
      username,
      reason,
      batchTag: msg.tags?.batch,
    });
  }
}

export class KickHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const username = getNickFromNuh(msg.source);
    const channelName = msg.params[0];
    const target = msg.params[1];
    const reason = msg.params.slice(2).join(" ");

    this.emit("KICK", {
      serverId,
      mtags: msg.tags,
      username,
      channelName,
      target,
      reason,
    });
  }
}

export class AwayHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const username = getNickFromNuh(msg.source);
    const awayMessage =
      msg.params.length > 0 ? msg.params.join(" ") : undefined;

    this.emit("AWAY", {
      serverId,
      username,
      awayMessage,
    });
  }
}

export class ChghostHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const username = getNickFromNuh(msg.source);
    const newUser = msg.params[0];
    const newHost = msg.params[1];

    this.emit("CHGHOST", {
      serverId,
      username,
      newUser,
      newHost,
    });
  }
}

export class InviteHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const inviter = getNickFromNuh(msg.source);
    const target = msg.params[0];
    const channel = msg.params[1];

    this.emit("INVITE", {
      serverId,
      mtags: msg.tags,
      inviter,
      target,
      channel,
    });
  }
}
