/**
 * Utility functions for parsing IRC URLs (irc:// and ircs://)
 * Supports extracting server details, channels, and connection parameters
 */

export interface ParsedIrcUrl {
  host: string;
  port: number;
  scheme: "irc" | "ircs";
  channels: string[];
  nick?: string;
  password?: string;
}

/**
 * Parses an IRC URL and extracts connection details
 *
 * @param url - The IRC URL to parse (irc:// or ircs://)
 * @param defaultNick - Default nickname to use if none specified in URL
 * @returns Parsed IRC connection details
 *
 * @example
 * ```typescript
 * const parsed = parseIrcUrl('ircs://irc.libera.chat:6697/#channel1,channel2?nick=user&password=pass');
 * // Returns: {
 * //   host: 'irc.libera.chat',
 * //   port: 6697,
 * //   scheme: 'ircs',
 * //   channels: ['#channel1', '#channel2'],
 * //   nick: 'user',
 * //   password: 'pass'
 * // }
 * ```
 */
export function parseIrcUrl(url: string, defaultNick = "user"): ParsedIrcUrl {
  // Sanitize URL by removing trailing punctuation commonly found in chat text
  const sanitizedUrl = url.trim().replace(/[),.;:]+$/, "");

  const urlObj = new URL(sanitizedUrl);
  const host = urlObj.hostname;
  const scheme = urlObj.protocol.replace(":", "") as "irc" | "ircs";

  // Determine port with sensible defaults
  const port = urlObj.port
    ? Number.parseInt(urlObj.port, 10)
    : scheme === "ircs"
      ? 443
      : 8000;

  // Parse channels from pathname (/chan1,chan2) or hash (#chan1,chan2)
  const rawChannelStr =
    urlObj.pathname.length > 1
      ? urlObj.pathname.slice(1) // Remove leading /
      : urlObj.hash.startsWith("#")
        ? urlObj.hash.slice(1) // Remove leading #
        : "";

  const channels = rawChannelStr
    .split(",")
    .filter(Boolean)
    .map((c) => decodeURIComponent(c))
    .map((c) => normalizeChannelName(c));

  // Extract connection parameters
  const nick = urlObj.searchParams.get("nick") || defaultNick;
  const password = urlObj.searchParams.get("password") || undefined;

  return {
    host,
    port,
    scheme,
    channels,
    nick,
    password,
  };
}

/**
 * Normalizes a channel name by ensuring it has the correct prefix
 * Adds '#' prefix if the channel doesn't start with a valid IRC channel prefix
 *
 * @param channelName - The channel name to normalize
 * @returns Normalized channel name with proper prefix
 */
export function normalizeChannelName(channelName: string): string {
  const validPrefixes = ["#", "&", "+", "!"];
  const hasValidPrefix = validPrefixes.some((prefix) =>
    channelName.startsWith(prefix),
  );

  return hasValidPrefix ? channelName : `#${channelName}`;
}

/**
 * Validates if a URL is a valid IRC URL
 *
 * @param url - The URL to validate
 * @returns true if the URL is a valid IRC URL
 */
export function isValidIrcUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      ["irc:", "ircs:"].includes(urlObj.protocol) && urlObj.hostname !== ""
    );
  } catch {
    return false;
  }
}

/**
 * Constructs an IRC URL from connection details
 *
 * @param details - The IRC connection details
 * @returns Formatted IRC URL string
 */
export function constructIrcUrl(details: ParsedIrcUrl): string {
  let url = `${details.scheme}://${details.host}:${details.port}`;

  if (details.channels.length > 0) {
    // Remove # prefixes from channels for clean URL construction
    const cleanChannels = details.channels
      .map((channel) =>
        channel.startsWith("#") ? channel.substring(1) : channel,
      )
      .join(",");
    url += `/${cleanChannels}`;
  } else {
    url += "/";
  }

  const params = new URLSearchParams();
  if (details.nick) {
    params.set("nick", details.nick);
  }
  if (details.password) {
    params.set("password", details.password);
  }

  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  return url;
}
