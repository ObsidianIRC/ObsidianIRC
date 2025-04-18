import type { User } from '../types';

export function parseNamesResponse(namesResponse: string): User[] {
  console.log(namesResponse);
  const users: User[] = [];
  const regex = /([~&@%+]*)([^\s!]+)!/g; // Match status prefixes and nicknames

  let match;
  while ((match = regex.exec(namesResponse)) !== null) {
    const [_, prefix, username] = match;
    users.push({
      id: username,
      username,
      status: parseStatus(prefix),
      isOnline: true,
    });
  }

  return users;
}

function parseStatus(prefix: string): 'online' | 'idle' | 'dnd' | 'offline' | undefined {
  if (prefix.includes('~')) return 'online'; // Owner
  if (prefix.includes('@')) return 'online'; // Admin
  if (prefix.includes('%')) return 'idle';   // Half-op
  if (prefix.includes('+')) return 'dnd';   // Voiced
  return 'offline'; // Default
}

export function parseMessageTags(tags: string): { [key: string]: string } {
  const parsedTags: { [key: string]: string } = {};
  const tagPairs = tags.substring(1).split(';');
  tagPairs.forEach(tag => {
    const [key, value] = tag.split('=');
    if (value) {
      parsedTags[key] = value;
    }
  });
  return parsedTags;
}

export function parse005(line: string): string[] {
  // Match and remove the prefix up to and including the nick
  const prefixMatch = line.match(/^:[^\s]+ 005 [^\s]+ /);
  if (!prefixMatch) return [];

  const remaining = line.slice(prefixMatch[0].length);
  const trailingIndex = remaining.indexOf(' :');

  const tokenString = trailingIndex !== -1
      ? remaining.slice(0, trailingIndex)
      : remaining;

  return tokenString.trim().split(/\s+/);
}