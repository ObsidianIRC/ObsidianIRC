export { type EventMap, IRCClient } from "./irc/IRCClient";

import { IRCClient } from "./irc/IRCClient";
export const ircClient = new IRCClient();
export default ircClient;
