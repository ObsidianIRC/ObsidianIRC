import React from "react";

const BlankPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-discord-text-muted">
      <div className="text-6xl mb-4">👋</div>
      <h2 className="text-xl font-semibold">Welcome to your server!</h2>
      <p className="text-sm mt-2">Select a channel to get started.</p>
    </div>
  );
};

export default BlankPage;