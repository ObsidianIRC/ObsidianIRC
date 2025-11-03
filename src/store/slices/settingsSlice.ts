import type { StateCreator } from "zustand";
import type { GlobalSettings } from "../types";

export interface SettingsSlice {
  globalSettings: GlobalSettings;
  updateGlobalSettings: (settings: Partial<GlobalSettings>) => void;
  addToIgnoreList: (pattern: string) => void;
  removeFromIgnoreList: (pattern: string) => void;
  addCustomMention: (mention: string) => void;
  removeCustomMention: (mention: string) => void;
}

const DEFAULT_SETTINGS: GlobalSettings = {
  enableNotifications: false,
  notificationSound: "/sounds/notif1.mp3",
  enableNotificationSounds: true,
  notificationVolume: 0.4,
  enableHighlights: true,
  sendTypingNotifications: true,
  showEvents: true,
  showNickChanges: true,
  showJoinsParts: true,
  showQuits: true,
  showKicks: true,
  customMentions: [],
  ignoreList: ["HistServ!*@*"],
  nickname: "",
  accountName: "",
  accountPassword: "",
  enableMultilineInput: true,
  multilineOnShiftEnter: true,
  autoFallbackToSingleLine: true,
  showSafeMedia: true,
  showExternalContent: false,
  enableMarkdownRendering: false,
};

export const createSettingsSlice: StateCreator<
  SettingsSlice,
  [
    ["zustand/devtools", never],
    ["zustand/persist", unknown],
    ["zustand/immer", never],
  ],
  [],
  SettingsSlice
> = (set) => ({
  globalSettings: DEFAULT_SETTINGS,

  updateGlobalSettings: (settings) =>
    set(
      (state) => {
        state.globalSettings = { ...state.globalSettings, ...settings };
      },
      false,
      "settings/update",
    ),

  addToIgnoreList: (pattern) =>
    set(
      (state) => {
        const trimmed = pattern.trim();
        if (!trimmed || state.globalSettings.ignoreList.includes(trimmed)) {
          return;
        }
        state.globalSettings.ignoreList.push(trimmed);
      },
      false,
      "settings/ignoreList/add",
    ),

  removeFromIgnoreList: (pattern) =>
    set(
      (state) => {
        state.globalSettings.ignoreList =
          state.globalSettings.ignoreList.filter((p) => p !== pattern);
      },
      false,
      "settings/ignoreList/remove",
    ),

  addCustomMention: (mention) =>
    set(
      (state) => {
        const trimmed = mention.trim();
        if (!trimmed || state.globalSettings.customMentions.includes(trimmed)) {
          return;
        }
        state.globalSettings.customMentions.push(trimmed);
      },
      false,
      "settings/customMentions/add",
    ),

  removeCustomMention: (mention) =>
    set(
      (state) => {
        state.globalSettings.customMentions =
          state.globalSettings.customMentions.filter((m) => m !== mention);
      },
      false,
      "settings/customMentions/remove",
    ),
});
