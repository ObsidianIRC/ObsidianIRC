import { v4 as uuidv4 } from "uuid";
import type { StateCreator } from "zustand";
import type { PrivateChat } from "../../types";

export interface PrivateChatSlice {
  // Get private chats for a server
  getPrivateChats: (serverId: string) => PrivateChat[];

  // Find a private chat by ID
  findPrivateChat: (
    serverId: string,
    privateChatId: string,
  ) => PrivateChat | undefined;

  // Find a private chat by username
  findPrivateChatByUsername: (
    serverId: string,
    username: string,
  ) => PrivateChat | undefined;

  // Create a new private chat
  createPrivateChat: (
    serverId: string,
    username: string,
    initialData?: Partial<PrivateChat>,
  ) => PrivateChat;

  // Update a private chat
  updatePrivateChat: (
    serverId: string,
    privateChatId: string,
    updates: Partial<PrivateChat>,
  ) => void;

  // Delete a private chat
  deletePrivateChat: (serverId: string, privateChatId: string) => void;

  // Pin/unpin a private chat
  pinPrivateChat: (serverId: string, privateChatId: string) => void;
  unpinPrivateChat: (serverId: string, privateChatId: string) => void;

  // Reorder private chats
  reorderPrivateChats: (serverId: string, privateChatIds: string[]) => void;

  // Mark as read
  markPrivateChatAsRead: (serverId: string, privateChatId: string) => void;

  // Update unread counts
  incrementUnreadCount: (serverId: string, privateChatId: string) => void;
  setMentioned: (
    serverId: string,
    privateChatId: string,
    isMentioned: boolean,
  ) => void;
}

export const createPrivateChatSlice: StateCreator<
  PrivateChatSlice,
  [
    ["zustand/devtools", never],
    ["zustand/persist", unknown],
    ["zustand/immer", never],
  ],
  [],
  PrivateChatSlice
> = (set, get) => ({
  getPrivateChats: (serverId) => {
    // This will need access to servers from serverSlice
    // For now, return empty array - will be connected in main store
    return [];
  },

  findPrivateChat: (serverId, privateChatId) => {
    const privateChats = get().getPrivateChats(serverId);
    return privateChats.find((pc) => pc.id === privateChatId);
  },

  findPrivateChatByUsername: (serverId, username) => {
    const privateChats = get().getPrivateChats(serverId);
    return privateChats.find(
      (pc) => pc.username.toLowerCase() === username.toLowerCase(),
    );
  },

  createPrivateChat: (serverId, username, initialData) => {
    const newPrivateChat: PrivateChat = {
      id: uuidv4(),
      username,
      serverId,
      unreadCount: 0,
      isMentioned: false,
      lastActivity: new Date(),
      isOnline: false,
      isAway: false,
      ...initialData,
    };

    // Add to server's private chats
    // This will be handled by the main store combining slices
    return newPrivateChat;
  },

  updatePrivateChat: (serverId, privateChatId, updates) =>
    set(
      (state) => {
        // Will be implemented in main store with server slice access
      },
      false,
      "privateChat/update",
    ),

  deletePrivateChat: (serverId, privateChatId) =>
    set(
      (state) => {
        // Will be implemented in main store with server slice access
      },
      false,
      "privateChat/delete",
    ),

  pinPrivateChat: (serverId, privateChatId) =>
    set(
      (state) => {
        // Will be implemented in main store with server slice access
      },
      false,
      "privateChat/pin",
    ),

  unpinPrivateChat: (serverId, privateChatId) =>
    set(
      (state) => {
        // Will be implemented in main store with server slice access
      },
      false,
      "privateChat/unpin",
    ),

  reorderPrivateChats: (serverId, privateChatIds) =>
    set(
      (state) => {
        // Will be implemented in main store with server slice access
      },
      false,
      "privateChat/reorder",
    ),

  markPrivateChatAsRead: (serverId, privateChatId) =>
    set(
      (state) => {
        // Will be implemented in main store with server slice access
      },
      false,
      "privateChat/markRead",
    ),

  incrementUnreadCount: (serverId, privateChatId) =>
    set(
      (state) => {
        // Will be implemented in main store with server slice access
      },
      false,
      "privateChat/incrementUnread",
    ),

  setMentioned: (serverId, privateChatId, isMentioned) =>
    set(
      (state) => {
        // Will be implemented in main store with server slice access
      },
      false,
      "privateChat/setMentioned",
    ),
});
