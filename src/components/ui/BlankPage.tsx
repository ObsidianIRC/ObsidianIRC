import type * as React from "react";
import { FaList } from "react-icons/fa";
import useStore from "../../store";

const BlankPage: React.FC = () => {
  const {
    servers,
    ui: { selectedServerId },
    toggleChannelListModal,
  } = useStore();
  const server = servers.find((s) => s.id === selectedServerId);

  return (
    <div className="flex flex-col items-center justify-center h-full text-discord-text-muted">
      <div className="text-6xl mb-4">👋</div>
      <h2 className="text-xl font-semibold">
        Welcome to {server?.name || "the unknown"}!
      </h2>
      <p className="text-sm mt-2">Select or add a channel to get started.</p>

      <button
        onClick={() => toggleChannelListModal(true)}
        className="mt-6 flex items-center gap-2 px-4 py-2 bg-discord-dark-400 hover:bg-discord-dark-300 text-discord-text-normal hover:text-white rounded-lg transition-colors duration-200"
        title="Server Channels"
      >
        <FaList />
        <span>Server Channels</span>
      </button>
    </div>
  );
};

export default BlankPage;
