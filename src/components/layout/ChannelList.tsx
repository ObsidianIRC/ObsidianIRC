import type React from "react";
import { useState } from "react";
import {
  FaHashtag,
  FaVolumeUp,
  FaPlus,
  FaCog,
  FaUserPlus,
  FaChevronDown,
  FaChevronRight,
  FaTrash,
} from "react-icons/fa";
import useStore from "../../store";

export const ChannelList: React.FC = () => {
  const {
    servers,
    ui: { selectedServerId, selectedChannelId },
    selectChannel,
    joinChannel,
    leaveChannel,
    toggleUserProfileModal,
    currentUser,
  } = useStore();

  const [isTextChannelsOpen, setIsTextChannelsOpen] = useState(true);
  const [isVoiceChannelsOpen, setIsVoiceChannelsOpen] = useState(true);
  const [newChannelName, setNewChannelName] = useState("");

  const selectedServer = servers.find(
    (server) => server.id === selectedServerId,
  );

  const handleAddChannel = () => {
    if (selectedServerId && newChannelName.trim()) {
      const channelName = newChannelName.trim().startsWith("#")
        ? newChannelName.trim()
        : `#${newChannelName.trim()}`;

      joinChannel(selectedServerId, channelName);
      selectChannel(channelName); // Ensure the new channel is selected
      setNewChannelName("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAddChannel();
    }
  };

  return (
    <div className="h-full flex flex-col text-discord-channels-default">
      {/* Server header */}
      <div className="px-4 h-12 shadow-md flex items-center justify-between border-b border-discord-dark-400">
        <h1 className="font-bold text-white truncate">
          {selectedServer?.name || "Home"}
        </h1>
        <button className="text-discord-channels-default hover:text-white">
          <FaChevronDown />
        </button>
      </div>

      {/* Channel list */}
      <div className="flex-grow overflow-y-auto overflow-x-hidden px-2 pt-4">
        {/* Home/Direct Messages view */}
        {!selectedServer && (
          <div className="px-2">
            <div className="text-discord-channels-default font-medium mb-1 text-xs">
              HOME
            </div>
            <div
              className={`
                px-2 py-1 mb-1 rounded flex items-center gap-2 cursor-pointer
                ${selectedChannelId === null ? "bg-discord-dark-400 text-white" : "hover:bg-discord-dark-100 hover:text-discord-channels-active"}
              `}
              onClick={() => selectChannel(null)}
            >
              <FaHashtag />
              <span>Welcome</span>
            </div>
          </div>
        )}

        {/* Server Channels */}
        {selectedServer && (
          <>
            {/* Text Channels */}
            <div className="mb-2">
              <div
                className="flex items-center px-2 group cursor-pointer mb-1"
                onClick={() => setIsTextChannelsOpen(!isTextChannelsOpen)}
              >
                {isTextChannelsOpen ? (
                  <FaChevronDown className="text-xs mr-1" />
                ) : (
                  <FaChevronRight className="text-xs mr-1" />
                )}
                <span className="uppercase text-xs font-semibold tracking-wide">
                  Text Channels
                </span>
                <FaPlus
                  className="ml-auto opacity-0 group-hover:opacity-100 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (newChannelName === "") setNewChannelName("#");
                  }}
                />
              </div>

              {/* Add Channel Input */}
              {newChannelName !== "" && (
                <div className="px-2 py-1 mb-1">
                  <div className="flex items-center bg-discord-dark-400 rounded overflow-hidden">
                    <span className="pl-2 pr-1 text-discord-channels-default">
                      <FaHashtag />
                    </span>
                    <input
                      type="text"
                      className="bg-transparent border-none outline-none py-1 w-full text-discord-channels-active"
                      placeholder="channel-name"
                      value={
                        newChannelName.startsWith("#")
                          ? newChannelName.slice(1)
                          : newChannelName
                      }
                      onChange={(e) => setNewChannelName(`#${e.target.value}`)}
                      onKeyDown={handleKeyDown}
                      autoFocus
                    />
                    <button
                      className="px-2 text-discord-green hover:bg-discord-dark-300"
                      onClick={handleAddChannel}
                    >
                      <FaPlus />
                    </button>
                    <button
                      className="px-2 text-discord-red hover:bg-discord-dark-300"
                      onClick={() => setNewChannelName("")}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {isTextChannelsOpen && (
                <div className="ml-2">
                  {selectedServer.channels
                    .filter(
                      (channel, index, self) =>
                        index === self.findIndex((c) => c.id === channel.id), // Ensure unique channels by ID
                    )
                    .filter((channel) => !channel.isPrivate)
                    .map((channel) => (
                      <div
                        key={channel.id}
                        className={`
                          px-2 py-1 mb-1 rounded flex items-center justify-between group cursor-pointer
                          ${selectedChannelId === channel.id ? "bg-discord-dark-400 text-white" : "hover:bg-discord-dark-100 hover:text-discord-channels-active"}
                        `}
                        onClick={() => selectChannel(channel.id)}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FaHashtag className="shrink-0" />
                          <span className="truncate">
                            {channel.name.replace(/^#/, "")}
                          </span>
                        </div>
                        {/* Trash Button */}
                        {selectedChannelId === channel.id && (
                          <button
                            className="hidden group-hover:block text-discord-red hover:text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedServerId) {
                                leaveChannel(selectedServerId, channel.name);
                              }
                            }}
                          >
                            <FaTrash />
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Voice Channels */}
            <div>
              <div
                className="flex items-center px-2 group cursor-pointer mb-1"
                onClick={() => setIsVoiceChannelsOpen(!isVoiceChannelsOpen)}
              >
                {isVoiceChannelsOpen ? (
                  <FaChevronDown className="text-xs mr-1" />
                ) : (
                  <FaChevronRight className="text-xs mr-1" />
                )}
                <span className="uppercase text-xs font-semibold tracking-wide">
                  Voice Channels
                </span>
                <FaPlus className="ml-auto opacity-0 group-hover:opacity-100 cursor-pointer" />
              </div>

              {isVoiceChannelsOpen && (
                <div className="ml-2">
                  <div className="px-2 py-1 mb-1 rounded hover:bg-discord-dark-100 flex items-center gap-2 cursor-pointer group">
                    <FaVolumeUp className="shrink-0" />
                    <span className="truncate">General</span>
                    <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100">
                      <button className="hover:text-discord-channels-active">
                        <FaUserPlus size={12} />
                      </button>
                      <button className="hover:text-discord-channels-active">
                        <FaCog size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="px-2 py-1 mb-1 rounded hover:bg-discord-dark-100 flex items-center gap-2 cursor-pointer group">
                    <FaVolumeUp className="shrink-0" />
                    <span className="truncate">AFK</span>
                    <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100">
                      <button className="hover:text-discord-channels-active">
                        <FaUserPlus size={12} />
                      </button>
                      <button className="hover:text-discord-channels-active">
                        <FaCog size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* User panel */}
      <div
        className="mt-auto h-14 bg-discord-dark-400 px-2 flex items-center cursor-pointer"
        onClick={() => toggleUserProfileModal(true)}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-discord-dark-100 flex items-center justify-center">
              {currentUser?.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt={currentUser.username}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <span className="text-white">
                  {currentUser?.username?.charAt(0)?.toUpperCase()}
                </span>
              )}
            </div>
            <div
              className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-discord-dark-400 ${currentUser?.status === "online" ? "bg-discord-green" : currentUser?.status === "idle" ? "bg-discord-yellow" : currentUser?.status === "dnd" ? "bg-discord-red" : "bg-discord-dark-500"}`}
            />
          </div>
          <div>
            <div className="text-white font-medium text-sm">
              {currentUser?.username || "User"}
            </div>
            <div className="text-xs text-discord-channels-default">
              {currentUser?.status === "online"
                ? "Online"
                : currentUser?.status === "idle"
                  ? "Idle"
                  : currentUser?.status === "dnd"
                    ? "Do Not Disturb"
                    : "Offline"}
            </div>
          </div>
        </div>
        <div className="ml-auto flex gap-2 text-discord-dark-500">
          <button className="hover:text-white">
            <FaCog />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChannelList;
