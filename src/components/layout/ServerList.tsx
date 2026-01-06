import type React from "react";
import { useEffect, useState } from "react";
import { FaPencilAlt, FaPlus, FaRedo, FaTrash } from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import useStore from "../../store";
import type { Server } from "../../types";

export const ServerList: React.FC = () => {
  const {
    servers,
    ui: { selectedServerId },
    selectServer,
    toggleAddServerModal,
    deleteServer, // Add deleteServer action
    toggleChannelListModal, // Add toggleChannelListModal action
    reconnectServer, // Add reconnectServer action
    toggleEditServerModal, // Add toggleEditServerModal action
  } = useStore();

  const [shimmeringServers, setShimmeringServers] = useState<Set<string>>(
    new Set(),
  );

  // Generate initial for server icon
  const getServerInitial = (server: Server): string => {
    // Use network name if available, otherwise server name
    const displayName = server.networkName || server.name;
    return displayName.charAt(0).toUpperCase();
  };

  // Handle shimmer effect when servers send RPL_WELCOME (ready event)
  useEffect(() => {
    const handleServerReady = ({ serverId }: { serverId: string }) => {
      // Start shimmer for the server that just became ready
      setShimmeringServers((prev) => new Set(prev).add(serverId));

      // Remove shimmer after animation completes
      setTimeout(() => {
        setShimmeringServers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(serverId);
          return newSet;
        });
      }, 1000); // Match the animation duration
    };

    ircClient.on("ready", handleServerReady);
  }, []);

  return (
    <div className="pt-3 pb-6 md:pb-3 flex flex-col items-center h-full overflow-visible relative">
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

      {/* Add Server Button */}
      <div className="relative mb-2">
        <div
          className="w-12 h-12 bg-discord-primary hover:bg-discord-primary/80 rounded-lg flex items-center justify-center transition-all duration-200 cursor-pointer group hover:rounded-xl"
          onClick={() => toggleAddServerModal(true)}
          data-testid="server-list-add-button"
        >
          <FaPlus className="group-hover:text-white text-3xl font-extrabold transition-colors duration-200" />
          <div className="absolute top-0 left-16 bg-black text-white p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-40 pointer-events-none">
            Add Server
          </div>
        </div>
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
              ${shimmeringServers.has(server.id) ? "shimmer" : ""}
            `}
              onClick={() => selectServer(server.id)}
            >
              {/* Grey overlay for disconnected/connecting states */}
              {(server.connectionState === "disconnected" ||
                server.connectionState === "connecting" ||
                server.connectionState === "reconnecting") && (
                <div className="absolute inset-0 bg-gray-500 bg-opacity-50 rounded-lg" />
              )}

              {/* Spinning refresh icon for connecting/reconnecting */}
              {(server.connectionState === "connecting" ||
                server.connectionState === "reconnecting") && (
                <FaRedo className="absolute inset-0 m-auto text-white animate-spin text-lg" />
              )}

              {/* Static refresh icon for disconnected servers */}
              {server.connectionState === "disconnected" && (
                <FaRedo
                  className="absolute inset-0 m-auto text-white text-lg cursor-pointer hover:text-gray-300 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    reconnectServer(server.id);
                  }}
                  title="Reconnect to server"
                />
              )}

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
                  {getServerInitial(server)}
                </div>
              )}
              {/* Mention badge in top-right corner */}
              {hasMentions && !isServerActive && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-discord-dark-600" />
              )}
              {selectedServerId === server.id && (
                <div className="absolute -bottom-1 -right-1 flex space-x-1 group-hover:opacity-100 opacity-0 transition-opacity duration-200">
                  <button
                    className="w-5 h-5 bg-discord-dark-300 hover:bg-blue-500 rounded-full flex items-center justify-center text-white text-xs shadow-md"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleEditServerModal(true, server.id);
                    }}
                    title="Edit Server"
                  >
                    <FaPencilAlt />
                  </button>
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
