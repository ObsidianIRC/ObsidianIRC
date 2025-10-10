import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import type React from "react";
import { useEffect, useState } from "react";
import AppLayout from "./components/layout/AppLayout";
import { ServerNoticesPopup } from "./components/message/ServerNoticesPopup";
import AddServerModal from "./components/ui/AddServerModal";
import ChannelListModal from "./components/ui/ChannelListModal";
import ChannelRenameModal from "./components/ui/ChannelRenameModal";
import LinkSecurityWarningModal from "./components/ui/LinkSecurityWarningModal";
import UserProfileModal from "./components/ui/UserProfileModal";
import UserSettings from "./components/ui/UserSettings";
import { useKeyboardResize } from "./hooks/useKeyboardResize";
import ircClient from "./lib/ircClient";
import useStore, { loadSavedServers } from "./store";

const askPermissions = async () => {
  // Do you have permission to send a notification?
  let permissionGranted = await isPermissionGranted();

  // If not we need to request it
  if (!permissionGranted) {
    const permission = await requestPermission();
    permissionGranted = permission === "granted";
  }
};

const initializeEnvSettings = (
  toggleAddServerModal: (
    isOpen?: boolean,
    prefillDetails?: ConnectionDetails | null,
  ) => void,
  joinChannel: (serverId: string, channelName: string) => void,
) => {
  if (loadSavedServers().length > 0) return;
  const host = __DEFAULT_IRC_SERVER__
    ? __DEFAULT_IRC_SERVER__.split(":")[1].replace(/^\/\//, "")
    : undefined;
  const port = __DEFAULT_IRC_SERVER__
    ? __DEFAULT_IRC_SERVER__.split(":")[2]
    : undefined;
  if (!host || !port) {
    return;
  }
  if (!__DEFAULT_IRC_SERVER_NAME__) {
  }
  toggleAddServerModal(true, {
    name: __DEFAULT_IRC_SERVER_NAME__ || "Obsidian IRC",
    host,
    port,
    nickname: "",
    ui: {
      hideServerInfo: true,
      hideClose: true,
      title: `Welcome to ${__DEFAULT_IRC_SERVER_NAME__}!`,
    },
  });
  ircClient.on("ready", ({ serverId, serverName, nickname }) => {
    // Automatically join default channels
    for (const channel of __DEFAULT_IRC_CHANNELS__) {
      joinChannel(serverId, channel);
    }
  });
};

const App: React.FC = () => {
  const {
    toggleAddServerModal,
    ui: {
      isAddServerModalOpen,
      isUserProfileModalOpen,
      isChannelListModalOpen,
      isChannelRenameModalOpen,
      isServerNoticesPopupOpen,
      linkSecurityWarnings,
      profileViewRequest,
    },
    joinChannel,
    connectToSavedServers,
    toggleServerNoticesPopup,
    clearProfileViewRequest,
    messages,
  } = useStore();

  // Local state for User Profile modal
  const [userProfileModalState, setUserProfileModalState] = useState<{
    isOpen: boolean;
    serverId: string;
    username: string;
  } | null>(null);

  // Watch for profile view requests
  useEffect(() => {
    if (profileViewRequest) {
      setUserProfileModalState({
        isOpen: true,
        serverId: profileViewRequest.serverId,
        username: profileViewRequest.username,
      });
      clearProfileViewRequest();
    }
  }, [profileViewRequest, clearProfileViewRequest]);

  // Collect all server notices from all channels
  const serverNotices = Object.values(messages)
    .flat()
    .filter((message) => message.type === "notice" && message.jsonLogData)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

  // Handlers for popup interactions
  const handleUsernameContextMenu = (
    e: React.MouseEvent,
    username: string,
    serverId: string,
    channelId: string,
    avatarElement?: Element | null,
  ) => {
    // For now, just prevent default. Could be extended to show user context menu
    e.preventDefault();
  };

  const handleIrcLinkClick = (url: string) => {
    // For now, just log. Could be extended to handle IRC links
    console.log("IRC link clicked:", url);
  };

  // Initialize keyboard resize handling for mobile platforms
  useKeyboardResize();

  // askPermissions();
  useEffect(() => {
    initializeEnvSettings(toggleAddServerModal, joinChannel);
    // Auto-reconnect to saved servers on app startup
    connectToSavedServers();
  }, [toggleAddServerModal, joinChannel, connectToSavedServers]);

  return (
    <div className="h-screen overflow-hidden">
      <AppLayout />
      {isAddServerModalOpen && <AddServerModal />}
      {isUserProfileModalOpen && <UserSettings />}
      {isChannelListModalOpen && <ChannelListModal />}
      {isChannelRenameModalOpen && <ChannelRenameModal />}
      <LinkSecurityWarningModal />
      {userProfileModalState?.isOpen && (
        <UserProfileModal
          isOpen={userProfileModalState.isOpen}
          onClose={() => setUserProfileModalState(null)}
          serverId={userProfileModalState.serverId}
          username={userProfileModalState.username}
        />
      )}
      {isServerNoticesPopupOpen && (
        <ServerNoticesPopup
          messages={serverNotices}
          onClose={() => toggleServerNoticesPopup(false)}
          onUsernameContextMenu={handleUsernameContextMenu}
          onIrcLinkClick={handleIrcLinkClick}
          joinChannel={joinChannel}
        />
      )}
    </div>
  );
};

export default App;
