import type React from "react";
import AppLayout from "./components/layout/AppLayout";
import AddServerModal from "./components/ui/AddServerModal";
import UserSettings from "./components/ui/UserSettings";
import useStore from "./store";

const App: React.FC = () => {
  const {
    ui: { isAddServerModalOpen, isUserProfileModalOpen },
  } = useStore();

  return (
    <div className="h-screen overflow-hidden">
      <AppLayout />
      {isAddServerModalOpen && <AddServerModal />}
      {isUserProfileModalOpen && <UserSettings />}
    </div>
  );
};

export default App;
