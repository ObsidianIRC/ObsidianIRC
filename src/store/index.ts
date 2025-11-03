import { create, type StoreApi } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { persistConfig } from "./middleware/persistConfig";
import { createChannelSlice } from "./slices/channelSlice";
import { createIRCActionsSlice } from "./slices/ircActionsSlice";
import { createMessageSlice } from "./slices/messageSlice";
import { createMetadataSlice } from "./slices/metadataSlice";
import { createNotificationSlice } from "./slices/notificationSlice";
import { createPrivateChatSlice } from "./slices/privateChatSlice";
import { createServerSlice } from "./slices/serverSlice";
import { createSettingsSlice } from "./slices/settingsSlice";
import { createUISlice } from "./slices/uiSlice";
import type { AppState } from "./types";

/**
 * Main Zustand store combining all slices with middleware
 * - Immer: Allows direct state mutation (converted to immutable updates)
 * - Persist: Automatic localStorage synchronization
 * - Devtools: Redux DevTools integration
 */
export const useStore = create<AppState>()(
  devtools(
    persist(
      immer((...a) => ({
        ...createSettingsSlice(
          ...(a as Parameters<typeof createSettingsSlice>),
        ),
        ...createNotificationSlice(
          ...(a as Parameters<typeof createNotificationSlice>),
        ),
        ...createUISlice(...(a as Parameters<typeof createUISlice>)),
        ...createMessageSlice(...(a as Parameters<typeof createMessageSlice>)),
        ...createPrivateChatSlice(
          ...(a as Parameters<typeof createPrivateChatSlice>),
        ),
        ...createChannelSlice(...(a as Parameters<typeof createChannelSlice>)),
        ...createMetadataSlice(
          ...(a as Parameters<typeof createMetadataSlice>),
        ),
        ...createServerSlice(...(a as Parameters<typeof createServerSlice>)),
        ...createIRCActionsSlice(
          ...(a as Parameters<typeof createIRCActionsSlice>),
        ),
      })),
      persistConfig,
    ),
    { name: "ObsidianIRC Store" },
  ),
);

// Export commonly used selectors
export const getChannelMessages = (serverId: string, channelId: string) => {
  const state = useStore.getState();
  return state.getChannelMessages(serverId, channelId);
};

export const findChannelMessageById = (
  serverId: string,
  channelId: string,
  messageId: string,
) => {
  const state = useStore.getState();
  return state.findMessageById(serverId, channelId, messageId);
};

// Export store state access functions for backward compatibility
export function loadSavedServers() {
  return useStore.getState().servers || [];
}

// Helper to check if server supports metadata
export function serverSupportsMetadata(serverId: string): boolean {
  const state = useStore.getState();
  return (
    state.hasServerCapability(serverId, "draft/metadata-2") ||
    state.hasServerCapability(serverId, "draft/metadata")
  );
}

// Helper to check if server supports multiline
export function serverSupportsMultiline(serverId: string): boolean {
  const state = useStore.getState();
  return state.hasServerCapability(serverId, "draft/multiline");
}

// Note: saveServersToLocalStorage is no longer needed - handled by persist middleware
// Stub exports for backward compatibility
export function saveServersToLocalStorage(_servers?: unknown) {
  // No-op: persist middleware handles this automatically
}

export function loadSavedMetadata(): Record<
  string,
  Record<
    string,
    Record<string, { value: string | undefined; visibility: string }>
  >
> {
  // Return empty metadata - persist middleware handles this automatically
  return {};
}

// Initialize IRC event handlers after store creation
// This will be set up in ircAdapter.ts
let ircAdapterInitialized = false;

export function initializeIRCAdapter() {
  if (!ircAdapterInitialized) {
    // Import and initialize IRC adapter
    import("./adapters/ircAdapter").then(({ initializeIRCEventHandlers }) => {
      // Pass the store directly - useStore is a UseBoundStore which contains the StoreApi
      // Type assertion to avoid TypeScript's type instantiation depth limit with complex store types
      initializeIRCEventHandlers(useStore as unknown as StoreApi<AppState>);
      ircAdapterInitialized = true;
    });
  }
}

// Auto-initialize IRC adapter
// This ensures event handlers are set up when the store is created
if (typeof window !== "undefined") {
  // Only initialize in browser environment
  initializeIRCAdapter();
}

// Export types for use in other modules
// Export types from types.ts
export type {
  AppState,
  ChannelListEntry,
  ChannelListFilters,
  GlobalNotification,
  GlobalSettings,
  layoutColumn,
  UIState,
} from "./types";

// Default export
export default useStore;
