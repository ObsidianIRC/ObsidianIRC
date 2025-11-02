import type { ParsedMessage } from "./messageParser";

export interface CommandHandler {
  handle(message: ParsedMessage, serverId: string): void;
}

/**
 * Routes IRC commands to appropriate handlers
 */
export class CommandRouter {
  private handlers: Map<string, CommandHandler> = new Map();
  private numericHandlers: Map<number, CommandHandler> = new Map();

  /**
   * Register a handler for a command
   * @param command Command name (e.g., "PRIVMSG") or numeric code (e.g., 353)
   * @param handler Handler instance
   */
  registerHandler(command: string | number, handler: CommandHandler): void {
    if (typeof command === "number") {
      this.numericHandlers.set(command, handler);
    } else {
      this.handlers.set(command.toUpperCase(), handler);
    }
  }

  /**
   * Register multiple handlers at once
   */
  registerHandlers(
    handlers: Array<{ command: string | number; handler: CommandHandler }>,
  ): void {
    for (const { command, handler } of handlers) {
      this.registerHandler(command, handler);
    }
  }

  /**
   * Route a message to its handler
   * @param message Parsed IRC message
   * @param serverId Server ID
   * @returns true if handler was found and executed, false otherwise
   */
  route(message: ParsedMessage, serverId: string): boolean {
    const { command } = message;

    // Try numeric handler first
    const numericCommand = Number.parseInt(command, 10);
    if (!Number.isNaN(numericCommand)) {
      const handler = this.numericHandlers.get(numericCommand);
      if (handler) {
        handler.handle(message, serverId);
        return true;
      }
    }

    // Try string command handler
    const handler = this.handlers.get(command.toUpperCase());
    if (handler) {
      handler.handle(message, serverId);
      return true;
    }

    // No handler found
    console.log(`No handler found for command: ${command}`);
    return false;
  }

  /**
   * Check if a handler is registered for a command
   */
  hasHandler(command: string | number): boolean {
    if (typeof command === "number") {
      return this.numericHandlers.has(command);
    }
    return this.handlers.has(command.toUpperCase());
  }

  /**
   * Unregister a handler
   */
  unregisterHandler(command: string | number): void {
    if (typeof command === "number") {
      this.numericHandlers.delete(command);
    } else {
      this.handlers.delete(command.toUpperCase());
    }
  }

  /**
   * Get all registered command names
   */
  getRegisteredCommands(): string[] {
    return [
      ...Array.from(this.handlers.keys()),
      ...Array.from(this.numericHandlers.keys()).map(String),
    ];
  }

  /**
   * Clear all handlers
   */
  clearAll(): void {
    this.handlers.clear();
    this.numericHandlers.clear();
  }
}
