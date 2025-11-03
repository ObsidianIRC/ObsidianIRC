import { v4 as uuidv4 } from "uuid";
import type { StateCreator } from "zustand";
import type { User } from "../../types";
import type { GlobalNotification } from "../types";

export interface NotificationSlice {
  globalNotifications: GlobalNotification[];
  typingUsers: Record<string, User[]>;
  typingTimers: Record<string, Record<string, NodeJS.Timeout>>;

  addGlobalNotification: (
    notification: Omit<GlobalNotification, "id" | "timestamp">,
  ) => void;
  removeGlobalNotification: (notificationId: string) => void;
  clearGlobalNotifications: () => void;

  setTypingUsers: (channelKey: string, users: User[]) => void;
  addTypingUser: (channelKey: string, user: User) => void;
  removeTypingUser: (channelKey: string, username: string) => void;
  setTypingTimer: (
    channelKey: string,
    username: string,
    timer: NodeJS.Timeout,
  ) => void;
  clearTypingTimer: (channelKey: string, username: string) => void;
}

export const createNotificationSlice: StateCreator<
  NotificationSlice,
  [
    ["zustand/devtools", never],
    ["zustand/persist", unknown],
    ["zustand/immer", never],
  ],
  [],
  NotificationSlice
> = (set) => ({
  globalNotifications: [],
  typingUsers: {},
  typingTimers: {},

  addGlobalNotification: (notification) =>
    set(
      (state) => {
        const newNotification: GlobalNotification = {
          id: uuidv4(),
          ...notification,
          timestamp: new Date(),
        };
        state.globalNotifications.push(newNotification);

        // Play error sound for FAIL notifications
        if (notification.type === "fail") {
          try {
            const audio = new Audio("/sounds/error.mp3");
            audio.volume = 0.3;
            audio.play().catch((error) => {
              console.error("Failed to play error sound:", error);
            });
          } catch (error) {
            console.error("Failed to play error sound:", error);
          }
        }
      },
      false,
      "notification/add",
    ),

  removeGlobalNotification: (notificationId) =>
    set(
      (state) => {
        state.globalNotifications = state.globalNotifications.filter(
          (n) => n.id !== notificationId,
        );
      },
      false,
      "notification/remove",
    ),

  clearGlobalNotifications: () =>
    set(
      (state) => {
        state.globalNotifications = [];
      },
      false,
      "notification/clear",
    ),

  setTypingUsers: (channelKey, users) =>
    set(
      (state) => {
        state.typingUsers[channelKey] = users;
      },
      false,
      "typing/set",
    ),

  addTypingUser: (channelKey, user) =>
    set(
      (state) => {
        if (!state.typingUsers[channelKey]) {
          state.typingUsers[channelKey] = [];
        }
        // Don't add if already in the list
        if (
          !state.typingUsers[channelKey].some(
            (u) => u.username === user.username,
          )
        ) {
          state.typingUsers[channelKey].push(user);
        }
      },
      false,
      "typing/add",
    ),

  removeTypingUser: (channelKey, username) =>
    set(
      (state) => {
        if (state.typingUsers[channelKey]) {
          state.typingUsers[channelKey] = state.typingUsers[channelKey].filter(
            (u) => u.username !== username,
          );
        }
      },
      false,
      "typing/remove",
    ),

  setTypingTimer: (channelKey, username, timer) =>
    set(
      (state) => {
        if (!state.typingTimers[channelKey]) {
          state.typingTimers[channelKey] = {};
        }
        state.typingTimers[channelKey][username] = timer;
      },
      false,
      "typing/timer/set",
    ),

  clearTypingTimer: (channelKey, username) =>
    set(
      (state) => {
        if (state.typingTimers[channelKey]?.[username]) {
          clearTimeout(state.typingTimers[channelKey][username]);
          delete state.typingTimers[channelKey][username];
        }
      },
      false,
      "typing/timer/clear",
    ),
});
