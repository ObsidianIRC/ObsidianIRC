/**
 * Utility functions for handling ignore list patterns and matching
 */

/**
 * Check if a hostmask (nick!user@host) matches an ignore pattern
 * Supports patterns like:
 * - nick!*@* (ignore by nick)
 * - *!user@* (ignore by user)
 * - *!*@host (ignore by host)
 * - nick!user@host (exact match)
 * - *!*@*.domain.com (wildcard matching)
 */
export function matchesIgnorePattern(
  hostmask: string,
  pattern: string,
): boolean {
  // Normalize both strings to lowercase for case-insensitive matching
  const normalizedHostmask = hostmask.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  // Convert IRC wildcard pattern to regex
  // * matches any number of characters (including none)
  // ? matches exactly one character
  const regexPattern = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape regex special chars except * and ?
    .replace(/\*/g, ".*") // Convert * to .*
    .replace(/\?/g, "."); // Convert ? to .

  try {
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedHostmask);
  } catch (error) {
    console.warn(`Invalid ignore pattern: ${pattern}`, error);
    return false;
  }
}

/**
 * Check if a user should be ignored based on the ignore list
 * @param nick - User's nickname
 * @param user - User's username (optional)
 * @param host - User's hostname (optional)
 * @param ignoreList - Array of ignore patterns
 */
export function isUserIgnored(
  nick: string,
  user?: string,
  host?: string,
  ignoreList: string[] = [],
): boolean {
  if (ignoreList.length === 0) return false;

  // Build possible hostmask variations to check
  const hostmasks: string[] = [];

  // Full hostmask if all parts available
  if (user && host) {
    hostmasks.push(`${nick}!${user}@${host}`);
  }

  // Partial hostmasks
  if (user) {
    hostmasks.push(`${nick}!${user}@*`);
  }
  if (host) {
    hostmasks.push(`${nick}!*@${host}`);
  }

  // Nick-only
  hostmasks.push(`${nick}!*@*`);

  // Check each hostmask against all ignore patterns
  for (const hostmask of hostmasks) {
    for (const pattern of ignoreList) {
      if (matchesIgnorePattern(hostmask, pattern)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validate an ignore pattern format
 */
export function isValidIgnorePattern(pattern: string): boolean {
  if (!pattern || pattern.trim().length === 0) {
    return false;
  }

  const trimmed = pattern.trim();

  // Must contain at least one ! and one @
  const exclamationCount = (trimmed.match(/!/g) || []).length;
  const atCount = (trimmed.match(/@/g) || []).length;

  if (exclamationCount !== 1 || atCount !== 1) {
    return false;
  }

  // Should be in format nick!user@host
  const parts = trimmed.split("!");
  if (parts.length !== 2) return false;

  const [nick, userHost] = parts;
  const userHostParts = userHost.split("@");
  if (userHostParts.length !== 2) return false;

  const [user, host] = userHostParts;

  // All parts should have at least some content (even if it's just *)
  return nick.length > 0 && user.length > 0 && host.length > 0;
}

/**
 * Create an ignore pattern from nick, user, and host components
 */
export function createIgnorePattern(
  nick?: string,
  user?: string,
  host?: string,
): string {
  return `${nick || "*"}!${user || "*"}@${host || "*"}`;
}
