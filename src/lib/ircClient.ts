// Re-export the main IRCClient class
export { IRCClient } from "./irc/index";

// Create and export a singleton instance for backward compatibility
import { IRCClient } from "./irc/index";

export const ircClient = new IRCClient();

export default ircClient;

// Re-export types from the types module
export type {
  BaseIRCEvent,
  BaseMessageEvent,
  BaseMetadataEvent,
  BaseUserActionEvent,
  EventCallback,
  EventKey,
  EventMap,
  EventWithTags,
  MetadataValueEvent,
} from "./irc/types";

// Re-export utility functions
export {
  getNickFromNuh,
  getTimestampFromTags,
  parseIsupport,
  parseMessageTags,
  parseNamesResponse,
} from "./irc/utils/ircUtils";
