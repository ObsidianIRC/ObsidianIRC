import type React from "react";
import { useState } from "react";
import { FaEllipsisH, FaTrash } from "react-icons/fa";
import useStore from "../../store";

export const ServerList: React.FC = () => {
  const {
    servers,
    ui: { selectedServerId },
    selectServer,
    toggleAddServerModal,
    deleteServer, // Add deleteServer action
    toggleChannelListModal, // Add toggleChannelListModal action
  } = useStore();

  const [isOptionsOpen, setIsOptionsOpen] = useState(false);

  const toggleOptions = () => setIsOptionsOpen((prev) => !prev);

  // Generate initial for server icon
  const getServerInitial = (name: string): string => {
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className="py-3 flex flex-col items-center h-full overflow-visible relative">
      {/* Home button - in Discord this would be DMs */}
      <div
        className={`
          mb-2 w-12 h-12 rounded-lg flex items-center justify-center
          transition-all duration-200 group relative
          ${selectedServerId === null ? "bg-discord-primary " : "bg-discord-dark-400 hover:bg-discord-primary"}
        `}
        onClick={() => selectServer(null)}
      >
        <div
          className={`
          absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200
          ${selectedServerId === null ? "h-10" : "h-0 group-hover:h-5"}
        `}
        />
        <div className="text-white text-xl">
          <img
            src="./images/obsidian.png"
            alt="Home"
            className="w-full h-full rounded-lg" // Ensure the image has rounded corners
          />
        </div>
        <div className="absolute top-0 left-16 bg-black text-white p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-40 pointer-events-none">
          Home
        </div>
      </div>

      <div className="w-8 h-0.5 bg-discord-dark-100 rounded-full my-2" />

      {/* Options Button */}
      <div className="relative mb-2">
        <div
          className="w-12 h-12 bg-discord-dark-400 hover:bg-discord-green rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer group"
          onClick={toggleOptions}
          data-testid="server-list-options-button"
        >
          <FaEllipsisH className="text-discord-green group-hover:text-discord-dark-600" />
        </div>

        {/* Dropdown Menu */}
        {isOptionsOpen && (
          <div
            className="absolute top-14 left-0 bg-discord-dark-400 text-white rounded shadow-lg w-40 z-50"
            style={{ zIndex: 9999 }} // Ensure it renders above other components
          >
            <button
              className="w-full text-left px-4 py-2 hover:bg-discord-dark-300"
              onClick={() => {
                toggleAddServerModal(true);
                setIsOptionsOpen(false);
              }}
            >
              Add Server
            </button>
          </div>
        )}
      </div>

      {/* Server list */}
      <div
        className="flex flex-col space-y-2 w-full items-center"
        data-testid="server-list"
      >
        {servers.map((server) => {
          // Check if server has any mentions in channels or private chats
          const hasMentions =
            server.channels.some((ch) => ch.isMentioned) ||
            server.privateChats?.some((pc) => pc.isMentioned);
          const isServerActive = selectedServerId === server.id;

          return (
            <div
              key={server.id}
              className={`
              w-12 h-12 rounded-lg flex items-center justify-center
              transition-all duration-200 cursor-pointer group relative
              ${selectedServerId === server.id ? "bg-discord-primary" : "bg-discord-dark-400 hover:bg-discord-primary"}
            `}
              onClick={() => selectServer(server.id)}
            >
              <div
                className={`
              absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200
              ${selectedServerId === server.id ? "h-10" : "h-0 group-hover:h-5"}
            `}
              />
              {server.icon ? (
                <img
                  src={server.icon}
                  alt={server.name}
                  className="w-9 h-9 rounded-full"
                />
              ) : (
                <div className="text-xl font-semibold text-white">
                  {getServerInitial(server.name)}
                </div>
              )}
              {/* Mention badge in top-right corner */}
              {hasMentions && !isServerActive && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-discord-dark-600" />
              )}
              {selectedServerId === server.id && (
                <div className="absolute -bottom-1 -right-1 group-hover:opacity-100 opacity-0 transition-opacity duration-200">
                  <button
                    className="w-5 h-5 bg-discord-dark-300 hover:bg-discord-red rounded-full flex items-center justify-center text-white text-xs shadow-md"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteServer(server.id);
                    }}
                    title="Disconnect"
                  >
                    <FaTrash />
                  </button>
                </div>
              )}

              <div className="absolute top-0 left-16 bg-black text-white p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-40 pointer-events-none">
                {server.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ServerList;
