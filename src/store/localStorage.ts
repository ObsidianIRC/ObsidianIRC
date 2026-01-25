import type { ServerConfig } from "../types";
import type {
  ChannelOrderMap,
  GlobalSettings,
  PinnedPrivateChatsMap,
  SavedMetadata,
  UISelections,
} from "./types";

const KEYS = {
  SERVERS: "savedServers",
  METADATA: "serverMetadata",
  SETTINGS: "globalSettings",
  CHANNEL_ORDER: "channelOrder",
  PINNED_PMS: "pinnedPrivateChats",
  UI_SELECTION: "uiSelections",
  MIGRATION_VERSION: "migrationVersion",
} as const;

export const servers = {
  load: (): ServerConfig[] => {
    const data = JSON.parse(localStorage.getItem(KEYS.SERVERS) || "[]");
    return [...data].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  },

  save: (servers: ServerConfig[]) => {
    localStorage.setItem(KEYS.SERVERS, JSON.stringify(servers));
  },
};

export const metadata = {
  load: (): SavedMetadata => {
    return JSON.parse(localStorage.getItem(KEYS.METADATA) || "{}");
  },

  save: (data: SavedMetadata) => {
    localStorage.setItem(KEYS.METADATA, JSON.stringify(data));
  },
};

export const settings = {
  load: (): Partial<GlobalSettings> => {
    try {
      return JSON.parse(localStorage.getItem(KEYS.SETTINGS) || "{}");
    } catch {
      return {};
    }
  },

  save: (data: GlobalSettings) => {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(data));
  },
};

export const channelOrder = {
  load: (): ChannelOrderMap => {
    return JSON.parse(localStorage.getItem(KEYS.CHANNEL_ORDER) || "{}");
  },

  save: (data: ChannelOrderMap) => {
    localStorage.setItem(KEYS.CHANNEL_ORDER, JSON.stringify(data));
  },
};

export const pinnedChats = {
  load: (): PinnedPrivateChatsMap => {
    try {
      return JSON.parse(localStorage.getItem(KEYS.PINNED_PMS) || "{}");
    } catch {
      return {};
    }
  },

  save: (data: PinnedPrivateChatsMap) => {
    localStorage.setItem(KEYS.PINNED_PMS, JSON.stringify(data));
  },
};

export const uiSelections = {
  load: (): UISelections => {
    try {
      const saved = localStorage.getItem(KEYS.UI_SELECTION);
      if (!saved) {
        return { selectedServerId: null, perServerSelections: {} };
      }
      return JSON.parse(saved);
    } catch {
      return { selectedServerId: null, perServerSelections: {} };
    }
  },

  save: (data: UISelections) => {
    localStorage.setItem(KEYS.UI_SELECTION, JSON.stringify(data));
  },
};

export const migrationVersion = {
  get: (): number => {
    return Number.parseInt(
      localStorage.getItem(KEYS.MIGRATION_VERSION) || "0",
      10,
    );
  },

  set: (version: number) => {
    localStorage.setItem(KEYS.MIGRATION_VERSION, version.toString());
  },
};

export { KEYS };
export type {
  SavedMetadata,
  PinnedPrivateChatsMap,
  ChannelOrderMap,
  GlobalSettings,
  UISelections,
};
