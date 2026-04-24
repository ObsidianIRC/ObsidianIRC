// Websocket compatible TCP socket implementation for tauri

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type SocketProtocol = "wss" | "irc" | "ircs";

export interface ISocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((error: Error) => void) | null;
  onclose: (() => void) | null;

  send(data: string): void;
  close(): void;
  readyState: number;
}

export interface SocketFactoryContext {
  url: string;
  protocol: SocketProtocol;
}

export type SocketFactory = (context: SocketFactoryContext) => ISocket;

export class TCPSocket implements ISocket {
  private clientId: string;
  private isConnected = false;
  private _readyState = 0; // 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
  private unlisten?: () => void;
  private closeRequested = false;
  private closeFinalized = false;

  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onerror: ((error: Error) => void) | null = null;
  public onclose: (() => void) | null = null;

  constructor(address: string) {
    this.clientId = Math.random().toString(36).substring(2, 15);
    this._readyState = 0; // CONNECTING

    // Set up event listener for incoming messages
    listen("tcp-message", (event) => {
      const payload = event.payload as {
        id: string;
        event: {
          message?: { data: number[] };
          error?: string;
          connected?: boolean;
        };
      };

      // Only handle messages for this client
      if (payload.id !== this.clientId) return;

      if (this.closeFinalized) return;

      if (payload.event.message) {
        // Convert byte array to string
        const data = new TextDecoder().decode(
          new Uint8Array(payload.event.message.data),
        );
        this.onmessage?.({ data });
      }

      if (payload.event.error) {
        this.onerror?.(new Error(payload.event.error));
      }

      if (payload.event.connected === false) {
        this.finalizeClose();
      }
    })
      .then((unlistenFn) => {
        if (this.closeFinalized) {
          unlistenFn();
          return;
        }

        this.unlisten = unlistenFn;
      })
      .catch((error: unknown) => {
        this.onerror?.(
          new Error(`Failed to register tcp-message listener: ${error}`),
        );
      });

    invoke("connect", { clientId: this.clientId, address })
      .then(() => {
        if (this.closeFinalized) {
          return;
        }

        if (this.closeRequested) {
          this.isConnected = true;

          return invoke("disconnect", { clientId: this.clientId })
            .then(() => {
              this.finalizeClose();
            })
            .catch((error: unknown) => {
              this.onerror?.(new Error(`Failed to disconnect: ${error}`));
              this.finalizeClose();
            });
        }

        this.isConnected = true;
        this._readyState = 1; // OPEN
        // Start listening for messages
        invoke("listen", {});
        // Fire onopen AFTER isConnected is set
        this.onopen?.();
      })
      .catch((error: unknown) => {
        if (this.closeRequested) {
          this.finalizeClose();
          return;
        }

        this._readyState = 3; // CLOSED
        this.onerror?.(new Error(`Failed to connect: ${error}`));
      });
  }

  get readyState(): number {
    return this._readyState;
  }

  send(data: string): void {
    if (!this.isConnected || this._readyState !== 1) {
      throw new Error("Socket is not connected");
    }

    invoke("send", { clientId: this.clientId, data }).catch(
      (error: unknown) => {
        this.onerror?.(new Error(`Failed to send data: ${error}`));
      },
    );
  }

  close(): void {
    if (this.closeRequested || this.closeFinalized) {
      return;
    }

    this.closeRequested = true;

    if (this._readyState !== 3) {
      this._readyState = 2; // CLOSING
    }

    if (this.isConnected) {
      this.isConnected = false;

      invoke("disconnect", { clientId: this.clientId })
        .then(() => {
          this.finalizeClose();
        })
        .catch((error: unknown) => {
          this.onerror?.(new Error(`Failed to disconnect: ${error}`));
          this.finalizeClose();
        });
    }
  }

  private finalizeClose(): void {
    if (this.closeFinalized) {
      return;
    }

    this.closeFinalized = true;
    this.closeRequested = false;
    this.isConnected = false;
    this._readyState = 3;
    this.onclose?.();
    this.unlisten?.();
    this.unlisten = undefined;
  }
}

export class WebSocketWrapper implements ISocket {
  private socket: WebSocket;

  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onerror: ((error: Error) => void) | null = null;
  public onclose: (() => void) | null = null;

  constructor(url: string) {
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.onopen?.();
    };

    this.socket.onmessage = (event) => {
      this.onmessage?.({ data: event.data });
    };

    this.socket.onerror = (event) => {
      this.onerror?.(new Error(`WebSocket error: ${event}`));
    };

    this.socket.onclose = () => {
      this.onclose?.();
    };
  }

  send(data: string): void {
    this.socket.send(data);
  }

  close(): void {
    this.socket.close();
  }
  get readyState(): number {
    return this.socket.readyState;
  }
}

export function resolveSocketProtocol(url: string): SocketProtocol {
  if (url.startsWith("wss://")) {
    return "wss";
  }

  if (url.startsWith("irc://")) {
    return "irc";
  }

  if (url.startsWith("ircs://")) {
    return "ircs";
  }

  throw new Error("Unsupported socket protocol");
}

const defaultSocketFactory: SocketFactory = ({ url, protocol }) => {
  if (protocol === "wss") {
    return new WebSocketWrapper(url);
  }

  return new TCPSocket(url);
};

let socketFactory: SocketFactory = defaultSocketFactory;

export function setSocketFactory(factory: SocketFactory): void {
  socketFactory = factory;
}

export function resetSocketFactory(): void {
  socketFactory = defaultSocketFactory;
}

export function createSocket(url: string): ISocket {
  const protocol = resolveSocketProtocol(url);

  return socketFactory({ url, protocol });
}
