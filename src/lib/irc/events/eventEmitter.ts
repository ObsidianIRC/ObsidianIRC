import type { EventCallback, EventKey, EventMap } from "../types";

/**
 * Type-safe event emitter for IRC client events
 */
export class EventEmitter {
  private eventCallbacks: {
    [K in EventKey]?: EventCallback<K>[];
  } = {};

  /**
   * Subscribe to an event
   */
  on<K extends EventKey>(event: K, callback: EventCallback<K>): void {
    if (!this.eventCallbacks[event]) {
      this.eventCallbacks[event] = [];
    }
    this.eventCallbacks[event]?.push(callback);
  }

  /**
   * Unsubscribe from an event
   */
  deleteHook<K extends EventKey>(event: K, callback: EventCallback<K>): void {
    const cbs = this.eventCallbacks[event];
    if (!cbs) return;
    const index = cbs.indexOf(callback);
    if (index !== -1) {
      cbs.splice(index, 1);
    }
  }

  /**
   * Trigger an event with data
   */
  triggerEvent<K extends EventKey>(event: K, data: EventMap[K]): void {
    const cbs = this.eventCallbacks[event];
    if (!cbs) return;
    for (const cb of cbs) {
      cb(data);
    }
  }

  /**
   * Check if there are any listeners for an event
   */
  hasListeners<K extends EventKey>(event: K): boolean {
    const cbs = this.eventCallbacks[event];
    return !!cbs && cbs.length > 0;
  }

  /**
   * Remove all listeners for a specific event or all events
   */
  removeAllListeners<K extends EventKey>(event?: K): void {
    if (event) {
      delete this.eventCallbacks[event];
    } else {
      this.eventCallbacks = {};
    }
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount<K extends EventKey>(event: K): number {
    const cbs = this.eventCallbacks[event];
    return cbs ? cbs.length : 0;
  }
}
