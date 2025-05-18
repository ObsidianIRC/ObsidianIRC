import type * as React from "react";
import useStore from "../../store";

const BlankPage: React.FC = () => {
  const {
    servers,
    ui: { selectedServerId },
  } = useStore();
  const server = servers.find((s) => s.id === selectedServerId);

  return (
    <div className="flex flex-col items-center justify-center h-full text-discord-text-muted">
      <div className="text-6xl mb-4">👋</div>
      <h2 className="text-xl font-semibold">
        Welcome to {server?.name || "the unknown"}!
      </h2>
      <p className="text-sm mt-2">Select a channel to get started.</p>
    </div>
  );
};

export default BlankPage;
