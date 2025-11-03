import type { Server, User } from "../../../types";

export interface BatchInfo {
  type: string;
  parameters?: string[];
  messages: string[];
  timestamps?: Date[];
  concatFlags?: boolean[];
  sender?: string;
  messageIds?: string[];
  batchMsgId?: string;
  batchTime?: Date;
}

export class StateManager {
  private servers: Map<string, Server> = new Map();
  private nicks: Map<string, string> = new Map();
  private currentUsers: Map<string, User | null> = new Map();
  private activeBatches: Map<string, Map<string, BatchInfo>> = new Map();
  private saslMechanisms: Map<string, string[]> = new Map();
  private capLsAccumulated: Map<string, Set<string>> = new Map();
  private saslEnabled: Map<string, boolean> = new Map();
  private saslCredentials: Map<string, { username: string; password: string }> =
    new Map();
  private capNegotiationComplete: Map<string, boolean> = new Map();
  private pendingCapReqs: Map<string, number> = new Map();

  addServer(serverId: string, server: Server): void {
    this.servers.set(serverId, server);
  }

  getServer(serverId: string): Server | undefined {
    return this.servers.get(serverId);
  }

  removeServer(serverId: string): void {
    this.servers.delete(serverId);
    this.nicks.delete(serverId);
    this.currentUsers.delete(serverId);
    this.activeBatches.delete(serverId);
    this.saslMechanisms.delete(serverId);
    this.capLsAccumulated.delete(serverId);
    this.saslEnabled.delete(serverId);
    this.saslCredentials.delete(serverId);
    this.capNegotiationComplete.delete(serverId);
    this.pendingCapReqs.delete(serverId);
  }

  getAllServers(): Server[] {
    return Array.from(this.servers.values());
  }

  getServers(): Server[] {
    return this.getAllServers();
  }

  getAllUsers(serverId: string): User[] {
    const server = this.getServer(serverId);
    if (!server) return [];

    const allUsers = new Map<string, User>();

    // Collect users from all joined channels
    for (const channel of server.channels) {
      for (const user of channel.users) {
        allUsers.set(user.username, user);
      }
    }

    return Array.from(allUsers.values());
  }

  setNick(serverId: string, nick: string): void {
    this.nicks.set(serverId, nick);
  }

  getNick(serverId: string): string | undefined {
    return this.nicks.get(serverId);
  }

  setCurrentUser(serverId: string, user: User | null): void {
    this.currentUsers.set(serverId, user);
  }

  getCurrentUser(serverId: string): User | null {
    return this.currentUsers.get(serverId) || null;
  }

  updateCurrentUser(serverId: string, updates: Partial<User>): void {
    const currentUser = this.currentUsers.get(serverId);
    if (currentUser) {
      this.currentUsers.set(serverId, { ...currentUser, ...updates });
    }
  }

  startBatch(
    serverId: string,
    batchId: string,
    type: string,
    parameters?: string[],
    batchMsgId?: string,
    batchTime?: Date,
  ): void {
    if (!this.activeBatches.has(serverId)) {
      this.activeBatches.set(serverId, new Map());
    }
    this.activeBatches.get(serverId)?.set(batchId, {
      type,
      parameters,
      messages: [],
      timestamps: [],
      concatFlags: [],
      messageIds: [],
      batchMsgId,
      batchTime,
    });
  }

  getBatch(serverId: string, batchId: string): BatchInfo | undefined {
    return this.activeBatches.get(serverId)?.get(batchId);
  }

  endBatch(serverId: string, batchId: string): BatchInfo | undefined {
    const serverBatches = this.activeBatches.get(serverId);
    const batch = serverBatches?.get(batchId);
    serverBatches?.delete(batchId);
    return batch;
  }

  addMessageToBatch(
    serverId: string,
    batchId: string,
    message: string,
    sender?: string,
    msgid?: string,
    timestamp?: Date,
    hasConcat?: boolean,
  ): void {
    const batch = this.getBatch(serverId, batchId);
    if (batch) {
      batch.messages.push(message);
      if (!batch.sender) {
        batch.sender = sender;
      }
      if (msgid && batch.messageIds) {
        batch.messageIds.push(msgid);
      }
      if (timestamp && batch.timestamps) {
        batch.timestamps.push(timestamp);
      }
      if (batch.concatFlags) {
        batch.concatFlags.push(!!hasConcat);
      }
    }
  }

  setSaslEnabled(serverId: string, enabled: boolean): void {
    this.saslEnabled.set(serverId, enabled);
  }

  isSaslEnabled(serverId: string): boolean {
    return this.saslEnabled.get(serverId) ?? false;
  }

  setSaslCredentials(
    serverId: string,
    username: string,
    password: string,
  ): void {
    this.saslCredentials.set(serverId, { username, password });
  }

  getSaslCredentials(
    serverId: string,
  ): { username: string; password: string } | undefined {
    return this.saslCredentials.get(serverId);
  }

  setSaslMechanisms(serverId: string, mechanisms: string[]): void {
    this.saslMechanisms.set(serverId, mechanisms);
  }

  getSaslMechanisms(serverId: string): string[] | undefined {
    return this.saslMechanisms.get(serverId);
  }

  deleteSaslMechanisms(serverId: string): void {
    this.saslMechanisms.delete(serverId);
  }

  getCapLsAccumulated(serverId: string): Set<string> {
    let accumulated = this.capLsAccumulated.get(serverId);
    if (!accumulated) {
      accumulated = new Set();
      this.capLsAccumulated.set(serverId, accumulated);
    }
    return accumulated;
  }

  deleteCapLsAccumulated(serverId: string): void {
    this.capLsAccumulated.delete(serverId);
  }

  setCapNegotiationComplete(serverId: string, complete: boolean): void {
    this.capNegotiationComplete.set(serverId, complete);
  }

  isCapNegotiationComplete(serverId: string): boolean {
    return this.capNegotiationComplete.get(serverId) ?? false;
  }

  deleteCapNegotiationComplete(serverId: string): void {
    this.capNegotiationComplete.delete(serverId);
  }

  setPendingCapReqs(serverId: string, count: number): void {
    this.pendingCapReqs.set(serverId, count);
  }

  getPendingCapReqs(serverId: string): number {
    return this.pendingCapReqs.get(serverId) || 0;
  }

  deletePendingCapReqs(serverId: string): void {
    this.pendingCapReqs.delete(serverId);
  }
}
