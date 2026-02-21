import type { Server, User } from "../../../types";
import type { QuickActionContext } from "./types";

interface UIState {
  selectedServerId: string | null;
  perServerSelections: Record<
    string,
    {
      selectedChannelId: string | null;
      selectedPrivateChatId: string | null;
    }
  >;
  isMemberListVisible: boolean;
  isChannelListVisible: boolean;
}

interface GlobalSettings {
  notificationVolume: number;
}

export function buildQuickActionContext(
  servers: Server[],
  ui: UIState,
  currentServerId: string | null,
  currentSelection: {
    selectedChannelId: string | null;
    selectedPrivateChatId: string | null;
  } | null,
  globalSettings: GlobalSettings,
  currentUser: User | null,
): QuickActionContext {
  const selectedServerId = currentServerId;
  const server = servers.find((s) => s.id === selectedServerId);

  const selectedChannel = currentSelection?.selectedChannelId
    ? server?.channels.find(
        (c) => c.id === currentSelection.selectedChannelId,
      ) || null
    : null;

  const selectedPrivateChat = currentSelection?.selectedPrivateChatId
    ? server?.privateChats.find(
        (pc) => pc.id === currentSelection.selectedPrivateChatId,
      ) || null
    : null;

  const isOperator =
    selectedChannel && currentUser
      ? selectedChannel.users
          .find((u) => u.username === currentUser.username)
          ?.status?.includes("@") ||
        selectedChannel.users
          .find((u) => u.username === currentUser.username)
          ?.status?.includes("~") ||
        false
      : false;

  return {
    selectedChannel,
    selectedPrivateChat,
    selectedServerId,
    currentUser,
    isOperator,
    isMemberListVisible: ui.isMemberListVisible,
    isChannelListVisible: ui.isChannelListVisible,
    notificationVolume: globalSettings.notificationVolume,
  };
}
