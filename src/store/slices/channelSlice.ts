import type { StateCreator } from "zustand";
import type {
  ChannelListEntry,
  ChannelListFilters,
  ChannelMetadata,
  ChannelOrderMap,
} from "../types";

export interface ChannelSlice {
  channelOrder: ChannelOrderMap;
  channelList: Record<string, ChannelListEntry[]>;
  channelListBuffer: Record<string, ChannelListEntry[]>;
  channelListFilters: Record<string, ChannelListFilters>;
  listingInProgress: Record<string, boolean>;
  channelMetadataCache: Record<string, Record<string, ChannelMetadata>>;
  channelMetadataFetchQueue: Record<string, Set<string>>;

  // Channel order operations
  reorderChannels: (serverId: string, channelNames: string[]) => void;
  getChannelOrder: (serverId: string) => string[];

  // Channel list operations (for /LIST command)
  setChannelList: (serverId: string, channels: ChannelListEntry[]) => void;
  clearChannelList: (serverId: string) => void;
  setChannelListBuffer: (
    serverId: string,
    channels: ChannelListEntry[],
  ) => void;
  appendToChannelListBuffer: (
    serverId: string,
    channel: ChannelListEntry,
  ) => void;
  finalizeChannelList: (serverId: string) => void;

  // Channel list filters
  updateChannelListFilters: (
    serverId: string,
    filters: ChannelListFilters,
  ) => void;
  getChannelListFilters: (serverId: string) => ChannelListFilters;

  // Listing status
  setListingInProgress: (serverId: string, inProgress: boolean) => void;
  isListingInProgress: (serverId: string) => boolean;

  // Channel metadata cache
  cacheChannelMetadata: (
    serverId: string,
    channelName: string,
    metadata: Partial<ChannelMetadata>,
  ) => void;
  getChannelMetadata: (
    serverId: string,
    channelName: string,
  ) => ChannelMetadata | undefined;
  addToMetadataFetchQueue: (serverId: string, channelName: string) => void;
  removeFromMetadataFetchQueue: (serverId: string, channelName: string) => void;
  isInMetadataFetchQueue: (serverId: string, channelName: string) => boolean;

  // Channel operations (work with server slice)
  markChannelAsRead: (serverId: string, channelId: string) => void;
  updateChannelUnreadCount: (
    serverId: string,
    channelId: string,
    count: number,
  ) => void;
  setChannelMentioned: (
    serverId: string,
    channelId: string,
    isMentioned: boolean,
  ) => void;
}

export const createChannelSlice: StateCreator<
  ChannelSlice,
  [
    ["zustand/devtools", never],
    ["zustand/persist", unknown],
    ["zustand/immer", never],
  ],
  [],
  ChannelSlice
> = (set, get) => ({
  channelOrder: {},
  channelList: {},
  channelListBuffer: {},
  channelListFilters: {},
  listingInProgress: {},
  channelMetadataCache: {},
  channelMetadataFetchQueue: {},

  reorderChannels: (serverId, channelNames) =>
    set(
      (state) => {
        state.channelOrder[serverId] = channelNames;
      },
      false,
      "channel/reorder",
    ),

  getChannelOrder: (serverId) => {
    return get().channelOrder[serverId] || [];
  },

  setChannelList: (serverId, channels) =>
    set(
      (state) => {
        state.channelList[serverId] = channels;
      },
      false,
      "channel/list/set",
    ),

  clearChannelList: (serverId) =>
    set(
      (state) => {
        state.channelList[serverId] = [];
        state.channelListBuffer[serverId] = [];
      },
      false,
      "channel/list/clear",
    ),

  setChannelListBuffer: (serverId, channels) =>
    set(
      (state) => {
        state.channelListBuffer[serverId] = channels;
      },
      false,
      "channel/list/buffer/set",
    ),

  appendToChannelListBuffer: (serverId, channel) =>
    set(
      (state) => {
        if (!state.channelListBuffer[serverId]) {
          state.channelListBuffer[serverId] = [];
        }
        state.channelListBuffer[serverId].push(channel);
      },
      false,
      "channel/list/buffer/append",
    ),

  finalizeChannelList: (serverId) =>
    set(
      (state) => {
        state.channelList[serverId] = state.channelListBuffer[serverId] || [];
        state.channelListBuffer[serverId] = [];
      },
      false,
      "channel/list/finalize",
    ),

  updateChannelListFilters: (serverId, filters) =>
    set(
      (state) => {
        state.channelListFilters[serverId] = filters;
      },
      false,
      "channel/list/filters/update",
    ),

  getChannelListFilters: (serverId) => {
    return get().channelListFilters[serverId] || {};
  },

  setListingInProgress: (serverId, inProgress) =>
    set(
      (state) => {
        state.listingInProgress[serverId] = inProgress;
      },
      false,
      "channel/list/status",
    ),

  isListingInProgress: (serverId) => {
    return get().listingInProgress[serverId] || false;
  },

  cacheChannelMetadata: (serverId, channelName, metadata) =>
    set(
      (state) => {
        if (!state.channelMetadataCache[serverId]) {
          state.channelMetadataCache[serverId] = {};
        }
        const existing =
          state.channelMetadataCache[serverId][channelName] || {};
        state.channelMetadataCache[serverId][channelName] = {
          ...existing,
          ...metadata,
          fetchedAt: Date.now(),
        };
      },
      false,
      "channel/metadata/cache",
    ),

  getChannelMetadata: (serverId, channelName) => {
    return get().channelMetadataCache[serverId]?.[channelName];
  },

  addToMetadataFetchQueue: (serverId, channelName) =>
    set(
      (state) => {
        if (!state.channelMetadataFetchQueue[serverId]) {
          state.channelMetadataFetchQueue[serverId] = new Set();
        }
        state.channelMetadataFetchQueue[serverId].add(channelName);
      },
      false,
      "channel/metadata/queue/add",
    ),

  removeFromMetadataFetchQueue: (serverId, channelName) =>
    set(
      (state) => {
        state.channelMetadataFetchQueue[serverId]?.delete(channelName);
      },
      false,
      "channel/metadata/queue/remove",
    ),

  isInMetadataFetchQueue: (serverId, channelName) => {
    return get().channelMetadataFetchQueue[serverId]?.has(channelName) || false;
  },

  markChannelAsRead: (serverId, channelId) =>
    set(
      (state) => {
        // Will be implemented with server slice access
      },
      false,
      "channel/markRead",
    ),

  updateChannelUnreadCount: (serverId, channelId, count) =>
    set(
      (state) => {
        // Will be implemented with server slice access
      },
      false,
      "channel/unreadCount",
    ),

  setChannelMentioned: (serverId, channelId, isMentioned) =>
    set(
      (state) => {
        // Will be implemented with server slice access
      },
      false,
      "channel/mentioned",
    ),
});
