import type { User } from "../../../types";

/**
 * Extract nickname from nick!user@host format
 */
export function getNickFromNuh(nuh: string): string {
  const nick = nuh.split("!")[0];
  return nick.startsWith(":") ? nick.substring(1) : nick;
}

/**
 * Get timestamp from IRC message tags, with fallback to current time
 */
export function getTimestampFromTags(
  mtags: Record<string, string> | undefined,
): Date {
  if (mtags?.time) {
    return new Date(mtags.time);
  }
  return new Date();
}

/**
 * Parse IRC message tags (@key=value;key2=value2)
 */
export function parseMessageTags(tags: string): Record<string, string> {
  const parsedTags: Record<string, string> = {};
  const tagPairs = tags.substring(1).split(";");

  for (const tag of tagPairs) {
    const [key, value] = tag.split("=");
    parsedTags[key] = value?.trim() ?? ""; // empty string fallback
  }

  return parsedTags;
}

/**
 * Parse NAMES response (353 numeric) into User objects
 */
export function parseNamesResponse(namesResponse: string): User[] {
  const users: User[] = [];
  for (const name of namesResponse.split(" ")) {
    // Try to match with userhost format first (nick!user@host)
    let regex = /([~&@%+]*)([^\s!]+)!/;
    let match = regex.exec(name);

    if (!match) {
      // If no match, try without ! (just nickname)
      regex = /([~&@%+]*)([^\s!]+)/;
      match = regex.exec(name);
    }

    if (match) {
      const [_, prefix, username] = match;
      users.push({
        id: username,
        username,
        status: prefix,
        isOnline: true,
      });
    }
  }
  return users;
}

/**
 * Parse ISUPPORT tokens (005 numeric)
 */
export function parseIsupport(tokens: string): Record<string, string> {
  const tokenMap: Record<string, string> = {};
  const tokenPairs = tokens.split(" ");

  for (const token of tokenPairs) {
    const [key, value] = token.split("=");
    if (value) {
      // Replace \x20 with actual space character
      tokenMap[key] = value.replace(/\\x20/g, " ");
    } else {
      tokenMap[key] = ""; // empty string fallback
    }
  }

  return tokenMap;
}
