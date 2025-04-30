import type { IRCClient } from "../lib/ircClient";
import { registerISupportHandler } from "./isupport";

export function registerAllProtocolHandlers(ircClient: IRCClient) {
  registerISupportHandler(ircClient);
}
