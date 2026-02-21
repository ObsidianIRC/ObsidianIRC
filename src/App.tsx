import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import { ServerNoticesPopup } from "./components/message/ServerNoticesPopup";
import PrivacyPolicy from "./components/PrivacyPolicy";
import AddServerModal from "./components/ui/AddServerModal";
import ChannelListModal from "./components/ui/ChannelListModal";
import ChannelRenameModal from "./components/ui/ChannelRenameModal";
import { EditServerModal } from "./components/ui/EditServerModal";
import LinkSecurityWarningModal from "./components/ui/LinkSecurityWarningModal";
import LoadingOverlay from "./components/ui/LoadingOverlay";
import QuickActions from "./components/ui/QuickActions";
import UserProfileModal from "./components/ui/UserProfileModal";
import UserSettings from "./components/ui/UserSettings";
import { useKeyboardResize } from "./hooks/useKeyboardResize";
import ircClient from "./lib/ircClient";
import { parseIrcUrl } from "./lib/ircUrlParser";
import { isTauri } from "./lib/platformUtils";
import useStore, { loadSavedServers } from "./store";
import type { ConnectionDetails } from "./store/types";

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
    toggleEditServerModal,
    toggleQuickActions,
    ui: {
      isAddServerModalOpen,
      isChannelListModalOpen,
      isChannelRenameModalOpen,
      isServerNoticesPopupOpen,
      isEditServerModalOpen,
      isSettingsModalOpen,
      isQuickActionsOpen,
      isUserProfileModalOpen,
      editServerId,
      linkSecurityWarnings,
      profileViewRequest,
      prefillServerDetails,
    },
    joinChannel,
    connectToSavedServers,
    toggleServerNoticesPopup,
    clearProfileViewRequest,
    messages,
    isConnecting,
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
    const parsed = parseIrcUrl(url, "user");
    toggleAddServerModal(true, {
      name: parsed.host,
      host: parsed.host,
      port: parsed.port.toString(),
      nickname: parsed.nick || "user",
      useWebSocket: false,
    });
  };

  // Initialize keyboard resize handling for mobile platforms
  useKeyboardResize();

  // askPermissions();
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    initializeEnvSettings(toggleAddServerModal, joinChannel);
    connectToSavedServers();
  }, [connectToSavedServers, joinChannel, toggleAddServerModal]);

  // Handle deeplinks
  useEffect(() => {
    const setupDeepLinkHandler = async () => {
      if (!isTauri()) {
        return;
      }

      try {
        // Register handler for when app is already running
        await onOpenUrl((urls) => {
          console.log("Deep link received:", urls);

          for (const url of urls) {
            if (url.startsWith("irc://") || url.startsWith("ircs://")) {
              try {
                // Parse the IRC URL
                const parsed = parseIrcUrl(url);

                // Open the connect modal with pre-filled details
                toggleAddServerModal(true, {
                  name: parsed.host || "IRC Server",
                  host: parsed.host,
                  port: parsed.port.toString(),
                  nickname: parsed.nick || "user",
                  useWebSocket: false,
                });
              } catch (error) {
                console.error("Failed to parse IRC URL:", error);
              }
            }
          }
        });
      } catch (error) {
        console.error("Failed to setup deep link handler:", error);
      }
    };

    setupDeepLinkHandler();
  }, [toggleAddServerModal]);

  // Global keyboard shortcut for Quick Actions (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        toggleQuickActions();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleQuickActions]);

  return (
    <div className="h-screen overflow-hidden">
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route
          path="/*"
          element={
            <>
              <AppLayout />
              {isAddServerModalOpen && <AddServerModal />}
              {isEditServerModalOpen && editServerId && (
                <EditServerModal
                  serverId={editServerId}
                  onClose={() => toggleEditServerModal(false)}
                />
              )}
              {isSettingsModalOpen && <UserSettings />}
              {isQuickActionsOpen && <QuickActions />}
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
              {isConnecting && <LoadingOverlay />}
            </>
          }
        />
      </Routes>
    </div>
  );
};

export default App;
