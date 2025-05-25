import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import type React from "react";
import { useEffect } from "react";
import AppLayout from "./components/layout/AppLayout";
import AddServerModal from "./components/ui/AddServerModal";
import UserSettings from "./components/ui/UserSettings";
import useStore from "./store";

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
) => {
  const host = __DEFAULT_IRC_SERVER__
    ? __DEFAULT_IRC_SERVER__.split(":")[1].replace(/^\/\//, "")
    : undefined;
  const port = __DEFAULT_IRC_SERVER__
    ? __DEFAULT_IRC_SERVER__.split(":")[2]
    : undefined;
  if (!host || !port) {
    console.error("Invalid default IRC server configuration.");
    return;
  }
  toggleAddServerModal(true, {
    name: __DEFAULT_IRC_SERVER_NAME__,
    host,
    port,
    nickname: "",
    ui: {
      hideServerInfo: true,
    },
  });
};

const App: React.FC = () => {
  const {
    toggleAddServerModal,
    ui: { isAddServerModalOpen, isUserProfileModalOpen },
  } = useStore();
  // askPermissions();
  useEffect(() => {
    initializeEnvSettings(toggleAddServerModal);
  }, [toggleAddServerModal]);

  return (
    <div className="h-screen overflow-hidden">
      <AppLayout />
      {isAddServerModalOpen && <AddServerModal />}
      {isUserProfileModalOpen && <UserSettings />}
    </div>
  );
};

export default App;
