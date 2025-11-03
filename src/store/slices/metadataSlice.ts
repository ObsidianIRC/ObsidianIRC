import type { StateCreator } from "zustand";
import type { WhoisData } from "../../types";
import type { BatchInfo, MetadataBatch, PendingRegistration } from "../types";

export interface MetadataSlice {
  metadataSubscriptions: Record<string, string[]>;
  metadataBatches: Record<string, MetadataBatch>;
  activeBatches: Record<string, Record<string, BatchInfo>>;
  metadataFetchInProgress: Record<string, boolean>;
  userMetadataRequested: Record<string, Set<string>>;
  metadataChangeCounter: number;
  whoisData: Record<string, Record<string, WhoisData>>;
  pendingRegistration: PendingRegistration | null;

  // Metadata subscriptions
  setMetadataSubscriptions: (serverId: string, keys: string[]) => void;
  getMetadataSubscriptions: (serverId: string) => string[];
  addMetadataSubscription: (serverId: string, key: string) => void;
  removeMetadataSubscription: (serverId: string, key: string) => void;

  // Metadata batches
  setMetadataBatch: (batchId: string, batch: MetadataBatch) => void;
  getMetadataBatch: (batchId: string) => MetadataBatch | undefined;
  deleteMetadataBatch: (batchId: string) => void;

  // Active batches (IRC batch processing)
  setActiveBatch: (serverId: string, batchId: string, batch: BatchInfo) => void;
  getActiveBatch: (serverId: string, batchId: string) => BatchInfo | undefined;
  deleteActiveBatch: (serverId: string, batchId: string) => void;
  clearActiveBatches: (serverId: string) => void;

  // Metadata fetch tracking
  setMetadataFetchInProgress: (serverId: string, inProgress: boolean) => void;
  isMetadataFetchInProgress: (serverId: string) => boolean;

  // User metadata tracking
  markUserMetadataRequested: (serverId: string, username: string) => void;
  isUserMetadataRequested: (serverId: string, username: string) => boolean;
  clearUserMetadataRequested: (serverId: string) => void;

  // Metadata change counter (for reactivity)
  incrementMetadataChangeCounter: () => void;

  // WHOIS data cache
  setWhoisData: (serverId: string, nickname: string, data: WhoisData) => void;
  getWhoisData: (serverId: string, nickname: string) => WhoisData | undefined;
  clearWhoisData: (serverId: string, nickname?: string) => void;

  // Account registration
  setPendingRegistration: (registration: PendingRegistration | null) => void;
  clearPendingRegistration: () => void;
}

export const createMetadataSlice: StateCreator<
  MetadataSlice,
  [
    ["zustand/devtools", never],
    ["zustand/persist", unknown],
    ["zustand/immer", never],
  ],
  [],
  MetadataSlice
> = (set, get) => ({
  metadataSubscriptions: {},
  metadataBatches: {},
  activeBatches: {},
  metadataFetchInProgress: {},
  userMetadataRequested: {},
  metadataChangeCounter: 0,
  whoisData: {},
  pendingRegistration: null,

  setMetadataSubscriptions: (serverId, keys) =>
    set(
      (state) => {
        state.metadataSubscriptions[serverId] = keys;
      },
      false,
      "metadata/subscriptions/set",
    ),

  getMetadataSubscriptions: (serverId) => {
    return get().metadataSubscriptions[serverId] || [];
  },

  addMetadataSubscription: (serverId, key) =>
    set(
      (state) => {
        if (!state.metadataSubscriptions[serverId]) {
          state.metadataSubscriptions[serverId] = [];
        }
        if (!state.metadataSubscriptions[serverId].includes(key)) {
          state.metadataSubscriptions[serverId].push(key);
        }
      },
      false,
      "metadata/subscriptions/add",
    ),

  removeMetadataSubscription: (serverId, key) =>
    set(
      (state) => {
        if (state.metadataSubscriptions[serverId]) {
          state.metadataSubscriptions[serverId] = state.metadataSubscriptions[
            serverId
          ].filter((k) => k !== key);
        }
      },
      false,
      "metadata/subscriptions/remove",
    ),

  setMetadataBatch: (batchId, batch) =>
    set(
      (state) => {
        state.metadataBatches[batchId] = batch;
      },
      false,
      "metadata/batch/set",
    ),

  getMetadataBatch: (batchId) => {
    return get().metadataBatches[batchId];
  },

  deleteMetadataBatch: (batchId) =>
    set(
      (state) => {
        delete state.metadataBatches[batchId];
      },
      false,
      "metadata/batch/delete",
    ),

  setActiveBatch: (serverId, batchId, batch) =>
    set(
      (state) => {
        if (!state.activeBatches[serverId]) {
          state.activeBatches[serverId] = {};
        }
        state.activeBatches[serverId][batchId] = batch;
      },
      false,
      "metadata/activeBatch/set",
    ),

  getActiveBatch: (serverId, batchId) => {
    return get().activeBatches[serverId]?.[batchId];
  },

  deleteActiveBatch: (serverId, batchId) =>
    set(
      (state) => {
        if (state.activeBatches[serverId]) {
          delete state.activeBatches[serverId][batchId];
        }
      },
      false,
      "metadata/activeBatch/delete",
    ),

  clearActiveBatches: (serverId) =>
    set(
      (state) => {
        delete state.activeBatches[serverId];
      },
      false,
      "metadata/activeBatch/clear",
    ),

  setMetadataFetchInProgress: (serverId, inProgress) =>
    set(
      (state) => {
        state.metadataFetchInProgress[serverId] = inProgress;
      },
      false,
      "metadata/fetch/status",
    ),

  isMetadataFetchInProgress: (serverId) => {
    return get().metadataFetchInProgress[serverId] || false;
  },

  markUserMetadataRequested: (serverId, username) =>
    set(
      (state) => {
        if (!state.userMetadataRequested[serverId]) {
          state.userMetadataRequested[serverId] = new Set();
        }
        state.userMetadataRequested[serverId].add(username);
      },
      false,
      "metadata/userRequested/mark",
    ),

  isUserMetadataRequested: (serverId, username) => {
    return get().userMetadataRequested[serverId]?.has(username) || false;
  },

  clearUserMetadataRequested: (serverId) =>
    set(
      (state) => {
        delete state.userMetadataRequested[serverId];
      },
      false,
      "metadata/userRequested/clear",
    ),

  incrementMetadataChangeCounter: () =>
    set(
      (state) => {
        state.metadataChangeCounter += 1;
      },
      false,
      "metadata/counter/increment",
    ),

  setWhoisData: (serverId, nickname, data) =>
    set(
      (state) => {
        if (!state.whoisData[serverId]) {
          state.whoisData[serverId] = {};
        }
        state.whoisData[serverId][nickname] = data;
      },
      false,
      "metadata/whois/set",
    ),

  getWhoisData: (serverId, nickname) => {
    return get().whoisData[serverId]?.[nickname];
  },

  clearWhoisData: (serverId, nickname) =>
    set(
      (state) => {
        if (nickname) {
          if (state.whoisData[serverId]) {
            delete state.whoisData[serverId][nickname];
          }
        } else {
          delete state.whoisData[serverId];
        }
      },
      false,
      "metadata/whois/clear",
    ),

  setPendingRegistration: (registration) =>
    set(
      (state) => {
        state.pendingRegistration = registration;
      },
      false,
      "metadata/registration/set",
    ),

  clearPendingRegistration: () =>
    set(
      (state) => {
        state.pendingRegistration = null;
      },
      false,
      "metadata/registration/clear",
    ),
});
