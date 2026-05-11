/**
 * IRC protocol utilities for message handling
 */

/**
 * Helper function to split long messages while respecting IRC protocol limits
 * @param message - The message to split
 * @param target - The channel or username target
 * @param preserveBoundarySpace - When true, each non-final chunk
 *   carries the original boundary space at its trailing edge so a
 *   downstream draft/multiline-concat join reconstructs the original
 *   text with its spacing intact.  Default false preserves the legacy
 *   "send as independent PRIVMSGs" behaviour where the split-point
 *   space simply becomes a line break.
 * @returns Array of message chunks within IRC limits
 */
export const splitLongMessage = (
  message: string,
  target = "#channel",
  preserveBoundarySpace = false,
): string[] => {
  const protocolOverhead = calculateProtocolOverhead(target);

  // Available space for the actual message content.  Reserve one byte
  // when we're going to re-attach a boundary space so the wire line
  // still fits inside the 512-byte IRC limit.
  const maxMessageLength =
    512 - protocolOverhead - (preserveBoundarySpace ? 1 : 0);

  if (message.length <= maxMessageLength) {
    return [message];
  }

  const lines: string[] = [];
  let currentLine = "";
  const words = message.split(" ");

  for (const word of words) {
    if (word.length > maxMessageLength) {
      // If a single word is too long, we have to break it
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      // Split the long word
      for (let i = 0; i < word.length; i += maxMessageLength) {
        lines.push(word.slice(i, i + maxMessageLength));
      }
    } else if (`${currentLine} ${word}`.length > maxMessageLength) {
      // Adding this word would exceed the limit
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  const filtered = lines.filter((line) => line.length > 0);
  if (!preserveBoundarySpace || filtered.length < 2) return filtered;
  return filtered.map((line, idx) =>
    idx < filtered.length - 1 ? `${line} ` : line,
  );
};

/**
 * Calculate protocol overhead for a given target
 * @param target - The channel or username
 * @returns The number of bytes used by protocol overhead
 */
export const calculateProtocolOverhead = (target: string): number => {
  const maxNickLength = 20;
  const maxUserLength = 20;
  const maxHostLength = 63;

  return (
    1 + // ':'
    maxNickLength +
    1 + // '!'
    maxUserLength +
    1 + // '@'
    maxHostLength +
    1 + // ' '
    7 + // 'PRIVMSG'
    1 + // ' '
    target.length +
    2 + // ' :'
    2 + // '\r\n'
    10
  ); // safety buffer
};

/**
 * Generate a unique batch ID for multiline messages
 * @returns A unique batch identifier
 */
export const createBatchId = (): string => {
  return `ml-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
