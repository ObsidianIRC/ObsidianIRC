/**
 * IRC protocol utilities for message handling
 */

/**
 * Helper function to split long messages while respecting IRC protocol limits
 * @param message - The message to split
 * @param target - The channel or username target
 * @returns Array of message chunks within IRC limits
 */
export const splitLongMessage = (
  message: string,
  target = "#channel",
): string[] => {
  const protocolOverhead = calculateProtocolOverhead(target);

  // Available space for the actual message content
  const maxMessageLength = 512 - protocolOverhead;

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
        lines.push(currentLine.trim());
        currentLine = "";
      }

      // Split the long word
      for (let i = 0; i < word.length; i += maxMessageLength) {
        lines.push(word.slice(i, i + maxMessageLength));
      }
    } else if (`${currentLine} ${word}`.length > maxMessageLength) {
      // Adding this word would exceed the limit
      if (currentLine) {
        lines.push(currentLine.trim());
      }
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }

  if (currentLine) {
    lines.push(currentLine.trim());
  }

  return lines.filter((line) => line.length > 0);
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
  return `ml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};
