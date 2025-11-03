/**
 * Manages WebSocket keepalive through IRC PING/PONG
 */
export class PingManager {
  private pingTimers: Map<string, NodeJS.Timeout> = new Map();
  private pongTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start sending periodic pings to a server
   */
  startPing(serverId: string, sendRaw: (msg: string) => void): void {
    // Clear any existing ping timer
    this.stopPing(serverId);

    // Send ping every 30 seconds
    const pingTimer = setInterval(() => {
      try {
        const timestamp = Date.now().toString();
        sendRaw(`PING ${timestamp}`);

        // Set a timeout for pong response (10 seconds)
        const pongTimeout = setTimeout(() => {
          console.warn(
            `WebSocket ping timeout for server ${serverId}, closing connection`,
          );
          // Connection will be closed by the caller
        }, 10000);

        this.pongTimeouts.set(serverId, pongTimeout);
      } catch (error) {
        console.error(`Failed to send ping for server ${serverId}:`, error);
      }
    }, 30000); // 30 seconds

    this.pingTimers.set(serverId, pingTimer);
  }

  /**
   * Stop sending pings to a server
   */
  stopPing(serverId: string): void {
    const pingTimer = this.pingTimers.get(serverId);
    if (pingTimer) {
      clearInterval(pingTimer);
      this.pingTimers.delete(serverId);
    }

    const pongTimeout = this.pongTimeouts.get(serverId);
    if (pongTimeout) {
      clearTimeout(pongTimeout);
      this.pongTimeouts.delete(serverId);
    }
  }

  /**
   * Handle pong response from server
   */
  handlePong(serverId: string): void {
    const pongTimeout = this.pongTimeouts.get(serverId);
    if (pongTimeout) {
      clearTimeout(pongTimeout);
      this.pongTimeouts.delete(serverId);
    }
  }

  /**
   * Check if ping is active for a server
   */
  isPinging(serverId: string): boolean {
    return this.pingTimers.has(serverId);
  }

  /**
   * Stop all ping timers
   */
  stopAll(): void {
    for (const timer of this.pingTimers.values()) {
      clearInterval(timer);
    }
    for (const timeout of this.pongTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.pingTimers.clear();
    this.pongTimeouts.clear();
  }
}
