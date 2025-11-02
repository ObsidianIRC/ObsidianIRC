import type { EventEmitter } from "../events/eventEmitter";

/**
 * Manages WebSocket connections for IRC servers
 */
export class ConnectionManager {
  private sockets: Map<string, WebSocket> = new Map();
  private pendingConnections: Map<string, Promise<WebSocket>> = new Map();

  constructor(private eventEmitter: EventEmitter) {}

  /**
   * Create a WebSocket connection to a server
   */
  async connect(
    host: string,
    port: number,
    serverId: string,
    onOpen: (socket: WebSocket) => void,
    onMessage: (data: string, serverId: string) => void,
    onClose: () => void,
    onError: () => void,
  ): Promise<WebSocket> {
    const connectionKey = `${host}:${port}`;

    // Check if there's already a pending connection
    const existingConnection = this.pendingConnections.get(connectionKey);
    if (existingConnection) {
      throw new Error(`Connection to ${host}:${port} is already in progress`);
    }

    // Create connection promise
    const connectionPromise = new Promise<WebSocket>((resolve, reject) => {
      // Determine protocol based on host
      const protocol = ["localhost", "127.0.0.1"].includes(host) ? "ws" : "wss";
      const url = `${protocol}://${host}:${port}`;

      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (error) {
        reject(new Error(`Failed to connect to ${host}:${port}`));
        return;
      }

      socket.onopen = () => {
        this.sockets.set(serverId, socket);
        this.eventEmitter.triggerEvent("connectionStateChange", {
          serverId,
          connectionState: "connected",
        });
        onOpen(socket);
        resolve(socket);
      };

      socket.onclose = () => {
        console.log(`WebSocket closed for server ${serverId}`);
        this.sockets.delete(serverId);
        this.eventEmitter.triggerEvent("connectionStateChange", {
          serverId,
          connectionState: "disconnected",
        });
        onClose();
      };

      socket.onerror = (error) => {
        console.error(`WebSocket error for server ${serverId}:`, error);
        this.sockets.delete(serverId);
        this.eventEmitter.triggerEvent("connectionStateChange", {
          serverId,
          connectionState: "disconnected",
        });
        onError();
        reject(new Error(`Failed to connect to ${host}:${port}`));
      };

      socket.onmessage = (event) => {
        onMessage(event.data, serverId);
      };
    });

    // Store and clean up pending connection
    this.pendingConnections.set(connectionKey, connectionPromise);
    connectionPromise.finally(() => {
      this.pendingConnections.delete(connectionKey);
    });

    return connectionPromise;
  }

  /**
   * Disconnect from a server
   */
  disconnect(serverId: string, quitMessage?: string): void {
    const socket = this.sockets.get(serverId);
    if (socket) {
      if (quitMessage && socket.readyState === WebSocket.OPEN) {
        socket.send(`QUIT :${quitMessage}`);
      }
      socket.close();
      this.sockets.delete(serverId);
    }
  }

  /**
   * Get socket for a server
   */
  getSocket(serverId: string): WebSocket | undefined {
    return this.sockets.get(serverId);
  }

  /**
   * Check if connected to a server
   */
  isConnected(serverId: string): boolean {
    const socket = this.sockets.get(serverId);
    return socket?.readyState === WebSocket.OPEN;
  }

  /**
   * Send raw IRC command to server
   */
  sendRaw(serverId: string, command: string): void {
    const socket = this.sockets.get(serverId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      console.log(
        `IRC Client: Sending command to server ${serverId}: ${command}`,
      );
      socket.send(command);
    } else {
      console.error(`Socket for server ${serverId} is not open`);
    }
  }

  /**
   * Clean up all connections
   */
  disconnectAll(): void {
    for (const serverId of this.sockets.keys()) {
      this.disconnect(serverId);
    }
    this.sockets.clear();
    this.pendingConnections.clear();
  }
}
