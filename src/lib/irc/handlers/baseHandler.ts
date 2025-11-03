import type { StateManager } from "../core/state";
import type { EventEmitter } from "../events/eventEmitter";
import type { CommandHandler } from "../protocol/commandRouter";
import type { ParsedMessage } from "../protocol/messageParser";
import type { EventKey, EventMap } from "../types";

/**
 * Base class for all IRC command handlers
 */
export abstract class BaseHandler implements CommandHandler {
  constructor(
    protected eventEmitter: EventEmitter,
    protected stateManager: StateManager,
  ) {}

  /**
   * Handle an IRC command - must be implemented by subclasses
   */
  abstract handle(message: ParsedMessage, serverId: string): void;

  /**
   * Emit an event
   */
  protected emit<K extends EventKey>(event: K, data: EventMap[K]): void {
    this.eventEmitter.triggerEvent(event, data);
  }

  /**
   * Get server from state
   */
  protected getServer(serverId: string) {
    return this.stateManager.getServer(serverId);
  }

  /**
   * Get nick for a server
   */
  protected getNick(serverId: string) {
    return this.stateManager.getNick(serverId);
  }
}
