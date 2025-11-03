import type { ParsedMessage } from "../protocol/messageParser";
import { parseIsupport, parseNamesResponse } from "../utils/ircUtils";
import { BaseHandler } from "./baseHandler";

export class WelcomeHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const serverName = msg.source;
    const nickname = msg.params[0];

    this.stateManager.setNick(serverId, nickname);
    this.stateManager.updateCurrentUser(serverId, { username: nickname });

    this.emit("ready", { serverId, serverName, nickname });

    const server = this.getServer(serverId);
    if (server && server.channels.length > 0) {
      console.log(
        `Rejoining ${server.channels.length} channels after reconnection`,
      );
    }
  }
}

export class YourHostHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const message = msg.params.slice(1).join(" ");
    const match = message.match(/Your host is ([^,]+), running version (.+)/);
    if (match) {
      this.emit("RPL_YOURHOST", {
        serverId,
        serverName: match[1],
        version: match[2],
      });
    }
  }
}

export class IsupportHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const capabilities = parseIsupport(msg.params.join(" "));
    for (const [key, value] of Object.entries(capabilities)) {
      if (key === "NETWORK") {
        const server = this.getServer(serverId);
        if (server) {
          server.networkName = value;
        }
      }
      this.emit("ISUPPORT", { serverId, key, value });
    }
  }
}

export class RplAwayHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const nick = msg.params[1];
    const awayMessage = msg.params.slice(2).join(" ");
    this.emit("RPL_AWAY", { serverId, nick, awayMessage });
  }
}

export class RplUnawayHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const message = msg.params.slice(1).join(" ");
    this.emit("RPL_UNAWAY", { serverId, message });
  }
}

export class RplNowawayHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const message = msg.params.slice(1).join(" ");
    this.emit("RPL_NOWAWAY", { serverId, message });
  }
}

export class WhoisUserHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const nick = msg.params[1];
    const username = msg.params[2];
    const host = msg.params[3];
    const realname = msg.params.slice(5).join(" ");
    this.emit("WHOIS_USER", { serverId, nick, username, host, realname });
  }
}

export class WhoisServerHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const nick = msg.params[1];
    const server = msg.params[2];
    const serverInfo = msg.params.slice(3).join(" ");
    this.emit("WHOIS_SERVER", { serverId, nick, server, serverInfo });
  }
}

export class EndOfWhoHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const mask = msg.params[1];
    this.emit("WHO_END", { serverId, mask });
  }
}

export class WhoisIdleHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const nick = msg.params[1];
    const idle = Number.parseInt(msg.params[2], 10);
    const signon = Number.parseInt(msg.params[3], 10);
    this.emit("WHOIS_IDLE", { serverId, nick, idle, signon });
  }
}

export class EndOfWhoisHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const nick = msg.params[1];
    this.emit("WHOIS_END", { serverId, nick });
  }
}

export class WhoisChannelsHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const nick = msg.params[1];
    const channels = msg.params.slice(2).join(" ");
    this.emit("WHOIS_CHANNELS", { serverId, nick, channels });
  }
}

export class WhoisSpecialHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const nick = msg.params[1];
    const message = msg.params.slice(2).join(" ");
    this.emit("WHOIS_SPECIAL", { serverId, nick, message });
  }
}

export class ListChannelHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channelName = msg.params[1];
    const userCount = msg.params[2] ? Number.parseInt(msg.params[2], 10) : 0;
    const topic = msg.params.slice(3).join(" ");
    this.emit("LIST_CHANNEL", {
      serverId,
      channel: channelName,
      userCount,
      topic,
    });
  }
}

export class ListEndHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    this.emit("LIST_END", { serverId });
  }
}

export class ChannelModeIsHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channelName = msg.params[1];
    const modestring = msg.params[2] || "";
    const modeargs = msg.params.slice(3);
    this.emit("RPL_CHANNELMODEIS", {
      serverId,
      channelName,
      modestring,
      modeargs,
    });
  }
}

export class WhoisAccountHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const nick = msg.params[1];
    const account = msg.params[2];
    this.emit("WHOIS_ACCOUNT", { serverId, nick, account });
  }
}

export class NoTopicHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channelName = msg.params[1];
    this.emit("RPL_NOTOPIC", { serverId, channelName });
  }
}

export class RplTopicHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channelName = msg.params[1];
    const topic = msg.params.slice(2).join(" ");
    this.emit("RPL_TOPIC", { serverId, channelName, topic });
  }
}

export class TopicWhoTimeHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channelName = msg.params[1];
    const setter = msg.params[2];
    const timestamp = Number.parseInt(msg.params[3], 10);
    this.emit("RPL_TOPICWHOTIME", { serverId, channelName, setter, timestamp });
  }
}

export class WhoisBotHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const nick = msg.params[0];
    const target = msg.params[1];
    const message = msg.params.slice(2).join(" ");
    this.emit("WHOIS_BOT", { serverId, nick, target, message });
  }
}

export class InviteListHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channel = msg.params[1];
    const mask = msg.params[2];
    const setter = msg.params[3];
    const timestamp = Number.parseInt(msg.params[4], 10);
    this.emit("RPL_INVITELIST", { serverId, channel, mask, setter, timestamp });
  }
}

export class EndOfInviteListHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channel = msg.params[1];
    this.emit("RPL_ENDOFINVITELIST", { serverId, channel });
  }
}

export class ExceptListHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channel = msg.params[1];
    const mask = msg.params[2];
    const setter = msg.params[3];
    const timestamp = Number.parseInt(msg.params[4], 10);
    this.emit("RPL_EXCEPTLIST", { serverId, channel, mask, setter, timestamp });
  }
}

export class EndOfExceptListHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channel = msg.params[1];
    this.emit("RPL_ENDOFEXCEPTLIST", { serverId, channel });
  }
}

export class WhoReplyHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channel = msg.params[1];
    const username = msg.params[2];
    const host = msg.params[3];
    const server = msg.params[4];
    const nick = msg.params[5];
    const flags = msg.params[6];
    const trailing = msg.params[7] || "";
    const spaceIndex = trailing.indexOf(" ");
    let hopcount = trailing;
    let realname = "";
    if (spaceIndex !== -1) {
      hopcount = trailing.substring(0, spaceIndex);
      realname = trailing.substring(spaceIndex + 1);
    }
    this.emit("WHO_REPLY", {
      serverId,
      channel,
      username,
      host,
      server,
      nick,
      flags,
      hopcount,
      realname,
    });
  }
}

export class NamesHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channelName = msg.params[2];
    const namesStr = msg.params.slice(3).join(" ").trim();
    const names = namesStr.startsWith(":") ? namesStr.substring(1) : namesStr;
    const newUsers = parseNamesResponse(names);

    this.emit("NAMES", { serverId, channelName, users: newUsers });
  }
}

export class WhoxReplyHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channel = msg.params[1];
    const username = msg.params[2];
    const host = msg.params[3];
    const nick = msg.params[4];
    const flags = msg.params[5];
    const account = msg.params[6];
    const opLevelField = msg.params[7] || "";
    const realname = msg.params[8] || "";
    const isAway = flags.includes("G");
    let opLevel = "";
    if (flags.length > 1) {
      const statusPart = flags.substring(1);
      opLevel = statusPart
        .split("")
        .filter((char) => ["@", "+", "~", "%", "&"].includes(char))
        .join("");
    }
    this.emit("WHOX_REPLY", {
      serverId,
      channel,
      username,
      host,
      nick,
      account,
      flags,
      realname,
      isAway,
      opLevel,
    });
  }
}

export class BanListHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channel = msg.params[1];
    const mask = msg.params[2];
    const setter = msg.params[3];
    const timestamp = Number.parseInt(msg.params[4], 10);
    this.emit("RPL_BANLIST", { serverId, channel, mask, setter, timestamp });
  }
}

export class EndOfBanListHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const channel = msg.params[1];
    this.emit("RPL_ENDOFBANLIST", { serverId, channel });
  }
}

export class YoureOperHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const message = msg.params.slice(1).join(" ");
    this.emit("RPL_YOUREOPER", { serverId, message });
  }
}

export class NickErrorHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const code = msg.command;
    const nick = msg.params[1];
    const message = msg.params.slice(2).join(" ");
    const errorMap: Record<string, string> = {
      "431": "No nickname given",
      "432": "Invalid nickname",
      "433": "Nickname already in use",
      "436": "Nickname collision",
    };
    this.emit("NICK_ERROR", {
      serverId,
      code,
      error: errorMap[code] || "Unknown error",
      nick: code === "431" ? undefined : nick,
      message,
    });
  }
}

export class WhoisSecureHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const nick = msg.params[1];
    const message = msg.params.slice(2).join(" ");
    this.emit("WHOIS_SECURE", { serverId, nick, message });
  }
}

export class MonOnlineHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const targetList = msg.params.slice(1).join(" ");
    const cleanTargetList = targetList.startsWith(":")
      ? targetList.substring(1)
      : targetList;
    const targets = cleanTargetList.split(",").map((target) => {
      const parts = target.split("!");
      if (parts.length === 2) {
        const [nick, userhost] = parts;
        const [user, host] = userhost.split("@");
        return { nick, user, host };
      }
      return { nick: target };
    });
    this.emit("MONONLINE", { serverId, targets });
  }
}

export class MonOfflineHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const targetList = msg.params.slice(1).join(" ");
    const cleanTargetList = targetList.startsWith(":")
      ? targetList.substring(1)
      : targetList;
    const targets = cleanTargetList.split(",");
    this.emit("MONOFFLINE", { serverId, targets });
  }
}

export class MonListHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const targetList = msg.params.slice(1).join(" ");
    const cleanTargetList = targetList.startsWith(":")
      ? targetList.substring(1)
      : targetList;
    const targets = cleanTargetList.split(",");
    this.emit("MONLIST", { serverId, targets });
  }
}

export class EndOfMonListHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    this.emit("ENDOFMONLIST", { serverId });
  }
}

export class MonListFullHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const limit = Number.parseInt(msg.params[1], 10);
    const targetList = msg.params[2];
    const targets = targetList.split(",");
    this.emit("MONLISTFULL", { serverId, limit, targets });
  }
}

export class WhoisKeyValueHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const target = msg.params[0];
    const key = msg.params[1];
    const visibility = msg.params[2];
    const value = msg.params.slice(3).join(" ");
    this.emit("METADATA_WHOIS", { serverId, target, key, visibility, value });
  }
}

export class KeyValueHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const target = msg.params[1];
    let key = msg.params[2];
    let visibility = msg.params[3];
    let valueStartIndex = 4;

    if (msg.params[1] === msg.params[2] && msg.params.length > 5) {
      key = msg.params[3];
      visibility = msg.params[4];
      valueStartIndex = 5;
    }

    const value = msg.params.slice(valueStartIndex).join(" ");
    const cleanValue = value.startsWith(":") ? value.substring(1) : value;

    this.emit("METADATA_KEYVALUE", {
      serverId,
      target,
      key,
      visibility,
      value: cleanValue,
    });
  }
}

export class KeyNotSetHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const target = msg.params[0];
    const key = msg.params[1];
    this.emit("METADATA_KEYNOTSET", { serverId, target, key });
  }
}

export class MetadataSubOkHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const keys = msg.params
      .slice(1)
      .map((key) => (key.startsWith(":") ? key.substring(1) : key));
    this.emit("METADATA_SUBOK", { serverId, keys });
  }
}

export class MetadataUnsubOkHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const keys = msg.params
      .slice(1)
      .map((key) => (key.startsWith(":") ? key.substring(1) : key));
    this.emit("METADATA_UNSUBOK", { serverId, keys });
  }
}

export class MetadataSubsHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const keys = msg.params
      .slice(1)
      .map((key) => (key.startsWith(":") ? key.substring(1) : key));
    this.emit("METADATA_SUBS", { serverId, keys });
  }
}

export class MetadataSyncLaterHandler extends BaseHandler {
  handle(msg: ParsedMessage, serverId: string): void {
    const target = msg.params[0];
    const retryAfter = msg.params[1]
      ? Number.parseInt(msg.params[1], 10)
      : undefined;
    this.emit("METADATA_SYNCLATER", { serverId, target, retryAfter });
  }
}
