import useStore from "../store";
import type { User } from "../types";
import type { Message } from "../types";

export function parseNamesResponse(namesResponse: string): User[] {
  console.log(namesResponse);
  const users: User[] = [];
  const regex = /([~&@%+]*)([^\s!]+)!/g; // Match status prefixes and nicknames

  let match: RegExpExecArray | null;
  do {
    match = regex.exec(namesResponse);
    if (match === null) break;
    const [_, prefix, username] = match;
    users.push({
      id: username,
      username,
      status: parseStatus(prefix),
      isOnline: true,
    });
  } while (match !== null);
  return users;
}

function parseStatus(
  prefix: string,
): "online" | "idle" | "dnd" | "offline" | undefined {
  if (prefix.includes("~")) return "online"; // Owner
  if (prefix.includes("@")) return "online"; // Admin
  if (prefix.includes("%")) return "idle"; // Half-op
  if (prefix.includes("+")) return "dnd"; // Voiced
  return "offline"; // Default
}

export function parseMessageTags(tags: string): { [key: string]: string } {
  const parsedTags: { [key: string]: string } = {};
  const tagPairs = tags.substring(1).split(";");
  for (const tag of tagPairs) {
    const [key, value] = tag.split("=");
    if (value) {
      parsedTags[key] = value.trim();
    }
  }
  return parsedTags;
}

export function parseFavicon(line: string): string[] {
  // Match and remove the prefix up to and including the nick
  const prefixMatch = line.match(/^:[^\s]+ 005 [^\s]+ /);
  if (!prefixMatch) return [];

  const remaining = line.slice(prefixMatch[0].length);
  const trailingIndex = remaining.indexOf(" :");

  const tokenString =
    trailingIndex !== -1 ? remaining.slice(0, trailingIndex) : remaining;

  return tokenString.trim().split(/\s+/);
}

export const getChannelMessages = (serverId: string, channelId: string) => {
  const state = useStore.getState();
  const key = `${serverId}-${channelId}`;
  return state.messages[key] || [];
};

export const findChannelMessageById = (
  serverId: string,
  channelId: string,
  messageId: string,
): Message | undefined => {
  const messages = getChannelMessages(serverId, channelId);
  return messages.find((message) => message.id === messageId);
};

export function getCurrentTypingUsers(
  serverId: string,
  channelId: string,
): User[] {
  const state = useStore.getState();
  const key = `${serverId}-${channelId}`;
  return state.typingUsers[key] || [];
}

export const getCurrentTypingUsersRenderedText = (
  serverId: string,
  channelId: string,
): string => {
  const typingUsers = getCurrentTypingUsers(serverId, channelId);
  if (typingUsers.length === 0) return "";
  if (typingUsers.length === 1)
    return `${typingUsers[0].username} is typing...`;
  if (typingUsers.length === 2)
    return `${typingUsers[0].username} and ${typingUsers[1].username} are typing...`;
  return `${typingUsers[0].username} and ${typingUsers.length - 1} others are typing...`;
};

export function IsUserTyping(
  serverId: string,
  channelId: string,
  userName: string,
): boolean {
  const typingUsers = getCurrentTypingUsers(serverId, channelId);
  return typingUsers.some((user) => user.username === userName);
}