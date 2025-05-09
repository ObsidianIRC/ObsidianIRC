import type { User } from "../types";

export function parseNamesResponse(namesResponse: string): User[] {
  const users: User[] = [];
  for (const name of namesResponse.split(" ")) {
    const regex = /([~&@%+]*)([^\s!]+)!/;
    const match = regex.exec(name);
    if (match) {
      console.log("match");
      const [_, prefix, username] = match;
      users.push({
        id: username,
        username,
        status: prefix,
        isOnline: true,
      });
    } else console.log("No match");
  }
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

export function parseMessageTags(tags: string): Record<string, string> {
  const parsedTags: Record<string, string> = {};
  const tagPairs = tags.substring(1).split(";");

  for (const tag of tagPairs) {
    const [key, value] = tag.split("=");
    parsedTags[key] = value?.trim() ?? ""; // empty string fallback
  }

  return parsedTags;
}

export function parseIsupport(line: string): string[] {
  // Match and remove the prefix up to and including the nick
  const prefixMatch = line.match(/^:[^\s]+ 005 [^\s]+ /);
  if (!prefixMatch) return [];

  const remaining = line.slice(prefixMatch[0].length);
  const trailingIndex = remaining.indexOf(" :");

  const tokenString =
    trailingIndex !== -1 ? remaining.slice(0, trailingIndex) : remaining;

  return tokenString.trim().split(/\s+/);
}
