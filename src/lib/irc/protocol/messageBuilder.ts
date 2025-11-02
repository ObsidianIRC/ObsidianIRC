/**
 * Builds outgoing IRC protocol messages
 */
export class MessageBuilder {
  /**
   * Build a PRIVMSG command
   */
  buildPrivmsg(
    target: string,
    message: string,
    tags?: Record<string, string>,
  ): string {
    let command = "";
    if (tags) {
      const tagString = Object.entries(tags)
        .map(([key, value]) => `${key}=${value}`)
        .join(";");
      command = `@${tagString} `;
    }
    command += `PRIVMSG ${target} :${message}`;
    return command;
  }

  /**
   * Build a multiline message batch
   */
  buildMultiline(target: string, lines: string[], batchId?: string): string[] {
    const id =
      batchId || `ml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const commands: string[] = [];

    // Start batch
    commands.push(`BATCH +${id} draft/multiline ${target}`);

    // Send each line
    for (const line of lines) {
      const splitLines = this.splitLongLine(line);
      for (const splitLine of splitLines) {
        commands.push(`@batch=${id} PRIVMSG ${target} :${splitLine}`);
      }
    }

    // End batch
    commands.push(`BATCH -${id}`);

    return commands;
  }

  /**
   * Split long lines to respect IRC message length limits (512 bytes)
   * @param text Text to split
   * @param maxLength Maximum length per line (default 450 to account for IRC overhead)
   * @returns Array of split lines
   */
  splitLongLine(text: string, maxLength = 450): string[] {
    if (!text) return [""];

    const lines: string[] = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      // Try to split at word boundaries
      let splitIndex = maxLength;
      const lastSpace = remaining.lastIndexOf(" ", maxLength);
      if (lastSpace > maxLength * 0.7) {
        // Don't split too early
        splitIndex = lastSpace;
      }

      lines.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex).trim();
    }

    if (remaining) {
      lines.push(remaining);
    }

    return lines.length > 0 ? lines : [""];
  }

  /**
   * Build a TAGMSG command
   */
  buildTagmsg(target: string, tags: Record<string, string>): string {
    const tagString = Object.entries(tags)
      .map(([key, value]) => `${key}=${value}`)
      .join(";");
    return `@${tagString} TAGMSG ${target}`;
  }

  /**
   * Build a command with optional tags
   */
  buildCommand(
    command: string,
    params: string[],
    tags?: Record<string, string>,
  ): string {
    let cmd = "";
    if (tags) {
      const tagString = Object.entries(tags)
        .map(([key, value]) => `${key}=${value}`)
        .join(";");
      cmd = `@${tagString} `;
    }
    cmd += command;
    if (params.length > 0) {
      // Last param needs ':' prefix if it contains spaces
      const lastParam = params[params.length - 1];
      const otherParams = params.slice(0, -1);

      if (otherParams.length > 0) {
        cmd += ` ${otherParams.join(" ")}`;
      }

      if (lastParam.includes(" ")) {
        cmd += ` :${lastParam}`;
      } else {
        cmd += ` ${lastParam}`;
      }
    }
    return cmd;
  }
}
