import type { EventEmitter } from "../events/eventEmitter";

export interface MetadataValue {
  key: string;
  value: string;
  visibility: string;
}

export class MetadataManager {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Used in constructor
  private eventEmitter: EventEmitter;
  private sendRaw: (serverId: string, data: string) => void;
  private getNick: (serverId: string) => string | undefined;
  private subscriptions: Map<string, Set<string>> = new Map();
  private metadataCache: Map<string, Map<string, Map<string, MetadataValue>>> =
    new Map();

  constructor(
    eventEmitter: EventEmitter,
    sendRaw: (serverId: string, data: string) => void,
    getNick: (serverId: string) => string | undefined,
  ) {
    this.eventEmitter = eventEmitter;
    this.sendRaw = sendRaw;
    this.getNick = getNick;
  }

  get(serverId: string, target: string, keys: string[]): void {
    const keysStr = keys.join(" ");
    this.sendRaw(serverId, `METADATA ${target} GET ${keysStr}`);
  }

  list(serverId: string, target: string): void {
    this.sendRaw(serverId, `METADATA ${target} LIST`);
  }

  set(
    serverId: string,
    target: string,
    key: string,
    value?: string,
    _visibility?: string,
  ): void {
    const currentNick = this.getNick(serverId);
    const actualTarget =
      target === "*" || target === currentNick ? "*" : target;

    const command =
      value !== undefined && value !== ""
        ? `METADATA ${actualTarget} SET ${key} :${value}`
        : `METADATA ${actualTarget} SET ${key}`;

    this.sendRaw(serverId, command);
  }

  clear(serverId: string, target: string): void {
    this.sendRaw(serverId, `METADATA ${target} CLEAR`);

    const serverCache = this.metadataCache.get(serverId);
    if (serverCache) {
      serverCache.delete(target);
    }
  }

  subscribe(serverId: string, keys: string[]): void {
    for (const key of keys) {
      this.sendRaw(serverId, `METADATA * SUB ${key}`);
    }

    let subs = this.subscriptions.get(serverId);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(serverId, subs);
    }
    for (const key of keys) {
      subs.add(key);
    }
  }

  unsubscribe(serverId: string, keys: string[]): void {
    const keysStr = keys.join(" ");
    this.sendRaw(serverId, `METADATA * UNSUB ${keysStr}`);

    const subs = this.subscriptions.get(serverId);
    if (subs) {
      for (const key of keys) {
        subs.delete(key);
      }
    }
  }

  listSubscriptions(serverId: string): void {
    this.sendRaw(serverId, "METADATA * SUBS");
  }

  sync(serverId: string, target: string): void {
    this.sendRaw(serverId, `METADATA ${target} SYNC`);
  }

  handleMetadataValue(
    serverId: string,
    target: string,
    key: string,
    value: string,
    visibility: string,
  ): void {
    let serverCache = this.metadataCache.get(serverId);
    if (!serverCache) {
      serverCache = new Map();
      this.metadataCache.set(serverId, serverCache);
    }

    let targetCache = serverCache.get(target);
    if (!targetCache) {
      targetCache = new Map();
      serverCache.set(target, targetCache);
    }

    targetCache.set(key, { key, value, visibility });
  }

  handleKeyNotSet(serverId: string, target: string, key: string): void {
    const serverCache = this.metadataCache.get(serverId);
    const targetCache = serverCache?.get(target);
    if (targetCache) {
      targetCache.delete(key);
    }
  }

  handleSubOk(serverId: string, keys: string[]): void {
    let subs = this.subscriptions.get(serverId);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(serverId, subs);
    }
    for (const key of keys) {
      subs.add(key);
    }
  }

  handleUnsubOk(serverId: string, keys: string[]): void {
    const subs = this.subscriptions.get(serverId);
    if (subs) {
      for (const key of keys) {
        subs.delete(key);
      }
    }
  }

  getCachedValue(
    serverId: string,
    target: string,
    key: string,
  ): MetadataValue | undefined {
    return this.metadataCache.get(serverId)?.get(target)?.get(key);
  }

  getCachedMetadata(
    serverId: string,
    target: string,
  ): Map<string, MetadataValue> | undefined {
    return this.metadataCache.get(serverId)?.get(target);
  }

  getSubscriptions(serverId: string): Set<string> {
    return this.subscriptions.get(serverId) || new Set();
  }

  isSubscribed(serverId: string, key: string): boolean {
    return this.subscriptions.get(serverId)?.has(key) ?? false;
  }

  clearCache(serverId: string): void {
    this.metadataCache.delete(serverId);
    this.subscriptions.delete(serverId);
  }

  clearTargetCache(serverId: string, target: string): void {
    this.metadataCache.get(serverId)?.delete(target);
  }
}
