import type { StateCreator } from "zustand";
import type { Server } from "../../types";
import type { Attachment, layoutColumn, UIState } from "../types";

export interface UISlice {
  ui: UIState;

  // Selection actions
  setSelectedServerId: (serverId: string | null) => void;
  setPerServerSelection: (
    serverId: string,
    selection: {
      selectedChannelId: string | null;
      selectedPrivateChatId: string | null;
    },
  ) => void;
  getPerServerSelection: (serverId: string) => {
    selectedChannelId: string | null;
    selectedPrivateChatId: string | null;
  };

  // Theme actions
  toggleDarkMode: () => void;
  setDarkMode: (isDark: boolean) => void;

  // Mobile UI actions
  toggleMobileMenu: (isOpen?: boolean) => void;
  setMobileViewActiveColumn: (column: layoutColumn) => void;

  // Sidebar actions
  toggleMemberList: (isVisible?: boolean) => void;
  toggleChannelList: (isOpen?: boolean) => void;
  toggleServerMenu: (isOpen?: boolean) => void;

  // Context menu actions
  showContextMenu: (
    x: number,
    y: number,
    type: "server" | "channel" | "user" | "message",
    itemId: string,
  ) => void;
  hideContextMenu: () => void;

  // Modal manager actions
  openModal: (modalId: string, props?: unknown) => void;
  closeModal: (modalId: string) => void;
  closeTopModal: () => void;
  closeAllModals: () => void;
  getModalContext: () => {
    serverId: string | null;
    channelId: string | null;
    selectedServer: Server | undefined;
  };

  // Attachment actions
  addInputAttachment: (attachment: Attachment) => void;
  removeInputAttachment: (attachmentId: string) => void;
  clearInputAttachments: () => void;

  // Server notices popup
  toggleServerNoticesPopup: (isOpen?: boolean) => void;
  minimizeServerNoticesPopup: (isMinimized?: boolean) => void;

  // Profile view
  setProfileViewRequest: (serverId: string, username: string) => void;
  clearProfileViewRequest: () => void;

  // Shimmer effects
  triggerServerShimmer: (serverId: string) => void;
  clearServerShimmer: (serverId: string) => void;

  // Link security warnings
  addLinkSecurityWarning: (serverId: string) => void;
  removeLinkSecurityWarning: (serverId: string) => void;

  // Prefill server details
  setPrefillServerDetails: (details: UIState["prefillServerDetails"]) => void;
}

const DEFAULT_UI_STATE: UIState = {
  selectedServerId: null,
  perServerSelections: {},
  isDarkMode: true,
  isMobileMenuOpen: false,
  isMemberListVisible: true,
  isChannelListVisible: true,
  mobileViewActiveColumn: "serverList",
  isServerMenuOpen: false,
  contextMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    type: "server",
    itemId: null,
  },
  prefillServerDetails: null,
  inputAttachments: [],
  linkSecurityWarnings: [],
  isServerNoticesPopupOpen: false,
  serverNoticesPopupMinimized: false,
  profileViewRequest: null,
  serverShimmer: new Set(),
  modals: {},
  modalHistory: [],
};

export const createUISlice: StateCreator<
  UISlice,
  [
    ["zustand/devtools", never],
    ["zustand/persist", unknown],
    ["zustand/immer", never],
  ],
  [],
  UISlice
> = (set, get) => ({
  ui: DEFAULT_UI_STATE,

  setSelectedServerId: (serverId) =>
    set(
      (state) => {
        state.ui.selectedServerId = serverId;
      },
      false,
      "ui/selectServer",
    ),

  setPerServerSelection: (serverId, selection) =>
    set(
      (state) => {
        state.ui.perServerSelections[serverId] = selection;
      },
      false,
      "ui/setSelection",
    ),

  getPerServerSelection: (serverId) => {
    return (
      get().ui.perServerSelections[serverId] || {
        selectedChannelId: null,
        selectedPrivateChatId: null,
      }
    );
  },

  toggleDarkMode: () =>
    set(
      (state) => {
        state.ui.isDarkMode = !state.ui.isDarkMode;
      },
      false,
      "ui/toggleDarkMode",
    ),

  setDarkMode: (isDark) =>
    set(
      (state) => {
        state.ui.isDarkMode = isDark;
      },
      false,
      "ui/setDarkMode",
    ),

  toggleMobileMenu: (isOpen) =>
    set(
      (state) => {
        state.ui.isMobileMenuOpen = isOpen ?? !state.ui.isMobileMenuOpen;
      },
      false,
      "ui/toggleMobileMenu",
    ),

  setMobileViewActiveColumn: (column) =>
    set(
      (state) => {
        state.ui.mobileViewActiveColumn = column;
      },
      false,
      "ui/setMobileColumn",
    ),

  toggleMemberList: (isVisible) =>
    set(
      (state) => {
        state.ui.isMemberListVisible =
          isVisible ?? !state.ui.isMemberListVisible;
      },
      false,
      "ui/toggleMemberList",
    ),

  toggleChannelList: (isOpen) =>
    set(
      (state) => {
        state.ui.isChannelListVisible =
          isOpen ?? !state.ui.isChannelListVisible;
      },
      false,
      "ui/toggleChannelList",
    ),

  toggleServerMenu: (isOpen) =>
    set(
      (state) => {
        state.ui.isServerMenuOpen = isOpen ?? !state.ui.isServerMenuOpen;
      },
      false,
      "ui/toggleServerMenu",
    ),

  showContextMenu: (x, y, type, itemId) =>
    set(
      (state) => {
        state.ui.contextMenu = {
          isOpen: true,
          x,
          y,
          type,
          itemId,
        };
      },
      false,
      "ui/showContextMenu",
    ),

  hideContextMenu: () =>
    set(
      (state) => {
        state.ui.contextMenu.isOpen = false;
      },
      false,
      "ui/hideContextMenu",
    ),

  openModal: (modalId, props) =>
    set(
      (state) => {
        state.ui.modals[modalId] = { isOpen: true, props };
        if (!state.ui.modalHistory.includes(modalId)) {
          state.ui.modalHistory.push(modalId);
        }
      },
      false,
      "ui/openModal",
    ),

  closeModal: (modalId) =>
    set(
      (state) => {
        if (state.ui.modals[modalId]) {
          state.ui.modals[modalId].isOpen = false;
        }
        state.ui.modalHistory = state.ui.modalHistory.filter(
          (id) => id !== modalId,
        );
      },
      false,
      "ui/closeModal",
    ),

  closeTopModal: () =>
    set(
      (state) => {
        const topModalId =
          state.ui.modalHistory[state.ui.modalHistory.length - 1];
        if (topModalId && state.ui.modals[topModalId]) {
          state.ui.modals[topModalId].isOpen = false;
          state.ui.modalHistory.pop();
        }
      },
      false,
      "ui/closeTopModal",
    ),

  closeAllModals: () =>
    set(
      (state) => {
        for (const modalId of Object.keys(state.ui.modals)) {
          state.ui.modals[modalId].isOpen = false;
        }
        state.ui.modalHistory = [];
      },
      false,
      "ui/closeAllModals",
    ),

  getModalContext: () => {
    const state = get();
    const selectedServerId = state.ui.selectedServerId;
    const selection = selectedServerId
      ? (get() as UISlice).getPerServerSelection(selectedServerId)
      : { selectedChannelId: null, selectedPrivateChatId: null };

    return {
      serverId: selectedServerId,
      channelId: selection.selectedChannelId,
      selectedServer: undefined, // Will be populated by combining with server slice
    };
  },

  addInputAttachment: (attachment) =>
    set(
      (state) => {
        state.ui.inputAttachments.push(attachment);
      },
      false,
      "ui/addAttachment",
    ),

  removeInputAttachment: (attachmentId) =>
    set(
      (state) => {
        state.ui.inputAttachments = state.ui.inputAttachments.filter(
          (a) => a.id !== attachmentId,
        );
      },
      false,
      "ui/removeAttachment",
    ),

  clearInputAttachments: () =>
    set(
      (state) => {
        state.ui.inputAttachments = [];
      },
      false,
      "ui/clearAttachments",
    ),

  toggleServerNoticesPopup: (isOpen) =>
    set(
      (state) => {
        state.ui.isServerNoticesPopupOpen =
          isOpen ?? !state.ui.isServerNoticesPopupOpen;
      },
      false,
      "ui/toggleServerNotices",
    ),

  minimizeServerNoticesPopup: (isMinimized) =>
    set(
      (state) => {
        state.ui.serverNoticesPopupMinimized =
          isMinimized ?? !state.ui.serverNoticesPopupMinimized;
      },
      false,
      "ui/minimizeServerNotices",
    ),

  setProfileViewRequest: (serverId, username) =>
    set(
      (state) => {
        state.ui.profileViewRequest = { serverId, username };
      },
      false,
      "ui/setProfileView",
    ),

  clearProfileViewRequest: () =>
    set(
      (state) => {
        state.ui.profileViewRequest = null;
      },
      false,
      "ui/clearProfileView",
    ),

  triggerServerShimmer: (serverId) =>
    set(
      (state) => {
        if (!state.ui.serverShimmer) {
          state.ui.serverShimmer = new Set();
        }
        state.ui.serverShimmer.add(serverId);
      },
      false,
      "ui/triggerShimmer",
    ),

  clearServerShimmer: (serverId) =>
    set(
      (state) => {
        state.ui.serverShimmer?.delete(serverId);
      },
      false,
      "ui/clearShimmer",
    ),

  addLinkSecurityWarning: (serverId) =>
    set(
      (state) => {
        state.ui.linkSecurityWarnings.push({
          serverId,
          timestamp: Date.now(),
        });
      },
      false,
      "ui/addLinkWarning",
    ),

  removeLinkSecurityWarning: (serverId) =>
    set(
      (state) => {
        state.ui.linkSecurityWarnings = state.ui.linkSecurityWarnings.filter(
          (w) => w.serverId !== serverId,
        );
      },
      false,
      "ui/removeLinkWarning",
    ),

  setPrefillServerDetails: (details) =>
    set(
      (state) => {
        state.ui.prefillServerDetails = details;
      },
      false,
      "ui/setPrefill",
    ),
});
