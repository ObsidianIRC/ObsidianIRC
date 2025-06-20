import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import type React from "react";
import { useEffect } from "react";
import AppLayout from "./components/layout/AppLayout";
import AddServerModal from "./components/ui/AddServerModal";
import UserSettings from "./components/ui/UserSettings";
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
    console.log("Skipping default server connection, missing host or port.");
    return;
  }
  if (!__DEFAULT_IRC_SERVER_NAME__) {
    console.warn(
      "Default IRC server name is not set. Using 'Obsidian IRC' as default.",
    );
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
    ui: { isAddServerModalOpen, isUserProfileModalOpen },
    joinChannel,
  } = useStore();
  // askPermissions();
  useEffect(() => {
    initializeEnvSettings(toggleAddServerModal, joinChannel);
  }, [toggleAddServerModal, joinChannel]);

  return (
    <div className="h-screen overflow-hidden">
      <AppLayout />
      {isAddServerModalOpen && <AddServerModal />}
      {isUserProfileModalOpen && <UserSettings />}
    </div>
  );
};

export default App;
