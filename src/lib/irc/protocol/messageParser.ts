import { parseMessageTags } from "../utils/ircUtils";

export interface ParsedMessage {
  tags?: Record<string, string>;
  source: string;
  command: string;
  params: string[];
}

/**
 * Parses raw IRC protocol messages into structured format
 */
export class MessageParser {
  /**
   * Parse a single IRC message line
   * @param line Raw IRC message line
   * @param defaultSource Default source to use if message has no source prefix
   * @returns Parsed message or null if invalid
   */
  parse(line: string, defaultSource: string): ParsedMessage | null {
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) return null;

    console.log(`IRC Parser: Parsing line: ${trimmedLine}`);

    let mtags: Record<string, string> | undefined;
    let lineAfterTags = trimmedLine;

    // Handle message tags first, before splitting on trailing parameter
    if (trimmedLine[0] === "@") {
      const spaceIndex = trimmedLine.indexOf(" ");
      if (spaceIndex !== -1) {
        mtags = parseMessageTags(trimmedLine.substring(0, spaceIndex));
        lineAfterTags = trimmedLine.substring(spaceIndex + 1);
      }
    }

    // Parse IRC message properly handling colon-prefixed trailing parameter
    const spaceColonIndex = lineAfterTags.indexOf(" :");
    let trailing = "";
    let mainPart = lineAfterTags;

    if (spaceColonIndex !== -1) {
      trailing = lineAfterTags.substring(spaceColonIndex + 2); // Skip ' :'
      mainPart = lineAfterTags.substring(0, spaceColonIndex);
    }

    const parts = mainPart.split(" ").filter((part) => part.length > 0);

    // Ensure we have at least one element
    if (parts.length === 0) return null;

    let i = 0;
    let source: string;

    // Determine the source. if none, use default
    if (parts[i][0] !== ":") {
      source = defaultSource;
    } else {
      source = parts[i].substring(1);
      i++;
    }

    // Get command
    if (i >= parts.length) return null;
    const command = parts[i];
    i++;

    // Collect parameters
    const params: string[] = [];
    for (; i < parts.length; i++) {
      params.push(parts[i]);
    }

    // Add trailing parameter if it exists
    if (trailing) {
      params.push(trailing);
    }

    return {
      tags: mtags,
      source,
      command,
      params,
    };
  }

  /**
   * Parse multiple IRC messages from a data chunk
   * @param data Raw data containing one or more IRC messages
   * @param defaultSource Default source for messages without a source
   * @returns Array of parsed messages
   */
  parseMultiple(data: string, defaultSource: string): ParsedMessage[] {
    const lines = data.split("\r\n");
    const messages: ParsedMessage[] = [];

    for (const line of lines) {
      const message = this.parse(line, defaultSource);
      if (message) {
        messages.push(message);
      }
    }

    return messages;
  }
}
