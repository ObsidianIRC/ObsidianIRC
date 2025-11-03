import type { StateCreator } from "zustand";
import type { Message } from "../../types";
import type { AppState } from "../types";

export interface MessageSlice {
  messages: Record<string, Message[]>;
  processedMessageIds: Set<string>;

  addMessage: (message: Message) => void;
  getChannelMessages: (serverId: string, channelId: string) => Message[];
  findMessageById: (
    serverId: string,
    channelId: string,
    messageId: string,
  ) => Message | undefined;
  updateMessage: (
    serverId: string,
    channelId: string,
    messageId: string,
    updates: Partial<Message>,
  ) => void;
  deleteMessage: (
    serverId: string,
    channelId: string,
    messageId: string,
  ) => void;
  clearChannelMessages: (serverId: string, channelId: string) => void;
  markMessageAsProcessed: (msgid: string) => void;
  isMessageProcessed: (msgid: string) => boolean;
}

export const createMessageSlice: StateCreator<
  AppState,
  [
    ["zustand/devtools", never],
    ["zustand/persist", unknown],
    ["zustand/immer", never],
  ],
  [],
  MessageSlice
> = (set, get) => ({
  messages: {},
  processedMessageIds: new Set<string>(),

  addMessage: (message) =>
    set(
      (state) => {
        const channelKey = `${message.serverId}-${message.channelId}`;

        if (!state.messages[channelKey]) {
          state.messages[channelKey] = [];
        }

        const currentMessages = state.messages[channelKey];

        // Check for duplicate messages
        const isDuplicate = currentMessages.some(
          (existingMessage) =>
            existingMessage.id === message.id ||
            (existingMessage.content === message.content &&
              existingMessage.timestamp === message.timestamp &&
              existingMessage.userId === message.userId),
        );

        if (isDuplicate) {
          return;
        }

        // Add message and sort by timestamp
        // Note: Using type assertion to avoid TypeScript's type instantiation depth limit with Immer
        const messagesArray = currentMessages as unknown as Message[];
        messagesArray.push(message as Message);
        messagesArray.sort((a, b) => {
          const timeA =
            a.timestamp instanceof Date
              ? a.timestamp.getTime()
              : new Date(a.timestamp).getTime();
          const timeB =
            b.timestamp instanceof Date
              ? b.timestamp.getTime()
              : new Date(b.timestamp).getTime();
          return timeA - timeB;
        });

        // Mark as processed if it has a msgid
        if (message.msgid) {
          state.processedMessageIds.add(message.msgid);
        }
      },
      false,
      "message/add",
    ),

  getChannelMessages: (serverId, channelId) => {
    const key = `${serverId}-${channelId}`;
    return get().messages[key] || [];
  },

  findMessageById: (serverId, channelId, messageId) => {
    const messages = get().getChannelMessages(serverId, channelId);
    return messages.find((message) => message.msgid === messageId);
  },

  updateMessage: (serverId, channelId, messageId, updates) =>
    set(
      (state) => {
        const channelKey = `${serverId}-${channelId}`;
        const channelMessages = state.messages[channelKey];

        if (channelMessages) {
          const messageIndex = channelMessages.findIndex(
            (m) => m.msgid === messageId,
          );
          if (messageIndex !== -1) {
            Object.assign(state.messages[channelKey][messageIndex], updates);
          }
        }
      },
      false,
      "message/update",
    ),

  deleteMessage: (serverId, channelId, messageId) =>
    set(
      (state) => {
        const channelKey = `${serverId}-${channelId}`;
        const channelMessages = state.messages[channelKey];

        if (channelMessages) {
          state.messages[channelKey] = channelMessages.filter(
            (m) => m.msgid !== messageId,
          );
        }
      },
      false,
      "message/delete",
    ),

  clearChannelMessages: (serverId, channelId) =>
    set(
      (state) => {
        const channelKey = `${serverId}-${channelId}`;
        delete state.messages[channelKey];
      },
      false,
      "message/clear",
    ),

  markMessageAsProcessed: (msgid) =>
    set(
      (state) => {
        state.processedMessageIds.add(msgid);
      },
      false,
      "message/markProcessed",
    ),

  isMessageProcessed: (msgid) => {
    return get().processedMessageIds.has(msgid);
  },
});
