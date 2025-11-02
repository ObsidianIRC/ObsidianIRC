import type { EventEmitter } from "../events/eventEmitter";

export type ReconnectCallback = () => Promise<void>;

/**
 * Manages automatic reconnection logic with exponential backoff
 */
export class ReconnectionManager {
  private reconnectionAttempts: Map<string, number> = new Map();
  private reconnectionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private reconnectCallbacks: Map<string, ReconnectCallback> = new Map();

  constructor(private eventEmitter: EventEmitter) {}

  /**
   * Start reconnection process for a server
   */
  startReconnection(serverId: string, onReconnect: ReconnectCallback): void {
    console.log(`Starting reconnection for server ${serverId}`);

    const existingTimeout = this.reconnectionTimeouts.get(serverId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    this.reconnectCallbacks.set(serverId, onReconnect);

    const attempts = this.reconnectionAttempts.get(serverId) || 0;
    this.reconnectionAttempts.set(serverId, attempts + 1);

    let delay = 0;
    if (attempts === 0) {
      delay = 0; // Immediate retry
    } else if (attempts === 1) {
      delay = 15000; // 15 seconds
    } else if (attempts === 2) {
      delay = 30000; // 30 seconds
    } else if (attempts <= 100) {
      delay = 60000; // 60 seconds for attempts 3-100
    } else {
      this.eventEmitter.triggerEvent("connectionStateChange", {
        serverId,
        connectionState: "disconnected",
      });
      this.clearReconnection(serverId);
      return;
    }

    this.eventEmitter.triggerEvent("connectionStateChange", {
      serverId,
      connectionState: "reconnecting",
    });

    const timeout = setTimeout(() => {
      console.log(
        `Reconnection timeout fired for server ${serverId}, attempting reconnection`,
      );
      this.attemptReconnection(serverId);
    }, delay);

    this.reconnectionTimeouts.set(serverId, timeout);
  }

  /**
   * Attempt to reconnect to a server
   */
  private async attemptReconnection(serverId: string): Promise<void> {
    console.log(`Attempting reconnection for server ${serverId}`);

    const callback = this.reconnectCallbacks.get(serverId);
    if (!callback) {
      console.error(`No reconnect callback found for server ${serverId}`);
      return;
    }

    try {
      this.eventEmitter.triggerEvent("connectionStateChange", {
        serverId,
        connectionState: "connecting",
      });

      await callback();

      console.log(`Reconnection successful for server ${serverId}`);
      this.clearReconnection(serverId);
    } catch (error) {
      console.log(`Reconnection failed for server ${serverId}:`, error);
      this.startReconnection(serverId, callback);
    }
  }

  /**
   * Clear reconnection state for a server
   */
  clearReconnection(serverId: string): void {
    this.reconnectionAttempts.delete(serverId);
    this.reconnectCallbacks.delete(serverId);

    const timeout = this.reconnectionTimeouts.get(serverId);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectionTimeouts.delete(serverId);
    }
  }

  /**
   * Get current reconnection attempt count
   */
  getAttemptCount(serverId: string): number {
    return this.reconnectionAttempts.get(serverId) || 0;
  }

  /**
   * Check if reconnection is in progress
   */
  isReconnecting(serverId: string): boolean {
    return this.reconnectionTimeouts.has(serverId);
  }

  /**
   * Clean up all reconnection state
   */
  clearAll(): void {
    for (const timeout of this.reconnectionTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.reconnectionTimeouts.clear();
    this.reconnectionAttempts.clear();
    this.reconnectCallbacks.clear();
  }
}
