// Websocket compatible TCP socket implementation for tauri

import { Buffer } from "buffer";
import { connect, disconnect, listen, send } from "@kuyoonjo/tauri-plugin-tcp";

export interface ISocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((error: Error) => void) | null;
  onclose: (() => void) | null;

  send(data: string): void;
  close(): void;
  readyState: number;
}

export class TCPSocket implements ISocket {
  private clientId: string;
  private isConnected = false;
  private _readyState = 0; // 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED

  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onerror: ((error: Error) => void) | null = null;
  public onclose: (() => void) | null = null;

  constructor(address: string) {
    this.clientId = Math.random().toString(36).substring(2, 15);
    this._readyState = 0; // CONNECTING

    connect(this.clientId, address)
      .then(() => {
        this.isConnected = true;
        this._readyState = 1; // OPEN
        this.onopen?.();
        listen((x) => {
          if (x.payload.id === this.clientId && x.payload.event.message) {
            const message = Buffer.from(
              x.payload.event.message.data,
            ).toString();
            this.onmessage?.({ data: message });
          }
        });
      })
      .catch((error) => {
        this._readyState = 3; // CLOSED
        this.onerror?.(new Error(`Failed to connect: ${error.message}`));
      });
  }

  get readyState(): number {
    return this._readyState;
  }

  send(data: string): void {
    if (!this.isConnected) {
      throw new Error("Socket is not connected");
    }
    send(this.clientId, data).catch((error) => {
      this.onerror?.(new Error(`Failed to send data: ${error.message}`));
    });
  }

  close(): void {
    if (this.isConnected) {
      this._readyState = 2; // CLOSING
      disconnect(this.clientId)
        .then(() => {
          this.isConnected = false;
          this._readyState = 3; // CLOSED
          this.onclose?.();
        })
        .catch((error) => {
          this.onerror?.(new Error(`Failed to disconnect: ${error.message}`));
        });
    }
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

export function createSocket(url: string): ISocket {
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return new WebSocketWrapper(url);
  }
  if (url.startsWith("irc://") || url.startsWith("ircs://")) {
    return new TCPSocket(url);
  }
  throw new Error("Unsupported socket protocol");
}
