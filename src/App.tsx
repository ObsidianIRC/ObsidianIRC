import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import type React from "react";
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

const App: React.FC = () => {
  const {
    ui: { isAddServerModalOpen, isUserProfileModalOpen },
  } = useStore();
  // askPermissions();

  return (
    <div className="h-screen overflow-hidden">
      <AppLayout />
      {isAddServerModalOpen && <AddServerModal />}
      {isUserProfileModalOpen && <UserSettings />}
    </div>
  );
};

export default App;
