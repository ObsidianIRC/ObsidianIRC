import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaCog,
  FaHashtag,
  FaPlus,
  FaTrash,
  FaUser,
  FaUserPlus,
  FaVolumeUp,
} from "react-icons/fa";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import ircClient from "../../lib/ircClient";
import useStore from "../../store";
import TouchableContextMenu from "../mobile/TouchableContextMenu";
import AddPrivateChatModal from "../ui/AddPrivateChatModal";

export const ChannelList: React.FC<{
  onToggle: () => void;
}> = ({ onToggle }: { onToggle: () => void }) => {
  const {
    selectChannel,
    selectPrivateChat,
    joinChannel,
    leaveChannel,
    deletePrivateChat,
    toggleUserProfileModal,
    setMobileViewActiveColumn,
  } = useStore();

  const selectedServerId = useStore((state) => state.ui.selectedServerId);
  const selectedChannelId = useStore((state) => state.ui.selectedChannelId);
  const selectedPrivateChatId = useStore(
    (state) => state.ui.selectedPrivateChatId,
  );

  // Get the current user for the selected server from the store data (includes metadata)
  // Use a selector to ensure reactivity when metadata changes
  const currentUser = useStore((state) => {
    if (!selectedServerId) return null;

    // Get the current user's username from IRCClient
    const ircCurrentUser = ircClient.getCurrentUser(selectedServerId);
    if (!ircCurrentUser) return null;

    // First, check if we have a global current user with metadata for this username
    if (
      state.currentUser &&
      state.currentUser.username === ircCurrentUser.username
    ) {
      return state.currentUser;
    }

    // Find the current user in the server's channel data to get metadata
    const selectedServer = state.servers.find((s) => s.id === selectedServerId);
    if (!selectedServer) return ircCurrentUser;

    // Look for the user in any channel to get their metadata
    for (const channel of selectedServer.channels) {
      const userWithMetadata = channel.users.find(
        (u) => u.username === ircCurrentUser.username,
      );
      if (userWithMetadata) {
        return userWithMetadata;
      }
    }

    // If not found in channels, return the basic IRC user
    return ircCurrentUser;
  });

  const servers = useStore((state) => state.servers);

  const [isTextChannelsOpen, setIsTextChannelsOpen] = useState(true);
  const [isVoiceChannelsOpen, setIsVoiceChannelsOpen] = useState(true);
  const [isPrivateChatsOpen, setIsPrivateChatsOpen] = useState(true);
  const [newChannelName, setNewChannelName] = useState("");
  const [isAddPrivateChatModalOpen, setIsAddPrivateChatModalOpen] =
    useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const selectedServer = servers.find(
    (server) => server.id === selectedServerId,
  );

  // Reset avatar load failed state when user or server changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: We want to reset when user/server changes
  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [currentUser?.username, selectedServerId]);

  // Get user status based on server connection and away status
  const userStatus = useMemo(() => {
    if (!selectedServer || !selectedServer.isConnected) {
      return "offline";
    }
    if (selectedServer.isAway) {
      return "away";
    }
    return "online";
  }, [selectedServer]);

  const handleAddChannel = () => {
    if (selectedServerId && newChannelName.trim()) {
      const channelName = newChannelName.trim().startsWith("#")
        ? newChannelName.trim()
        : `#${newChannelName.trim()}`;

      joinChannel(selectedServerId, channelName);
      setNewChannelName("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddChannel();
    }
  };

  const isNarrowView = useMediaQuery();

  const handleCollapseClick = () => {
    if (isNarrowView) {
      // On mobile, navigate to chat view
      setMobileViewActiveColumn("chatView");
    } else {
      // On desktop, toggle the channel list
      onToggle();
    }
  };

  return (
    <div className="h-full flex flex-col text-discord-channels-default">
      {/* Server header */}
      <div className="px-4 h-12 shadow-md flex items-center justify-between border-b border-discord-dark-400">
        <h1 className="font-bold text-white truncate">
          {selectedServer?.name || "Home"}
        </h1>
        <button
          onClick={handleCollapseClick}
          className="text-discord-channels-default hover:text-white"
        >
          <FaChevronLeft />
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
              Discover
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
                  className={`ml-auto ${!isNarrowView && "opacity-0 group-hover:opacity-100"} cursor-pointer`}
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
                      <TouchableContextMenu
                        key={channel.id}
                        menuItems={[
                          {
                            label: "Delete Channel",
                            icon: <FaTrash size={14} />,
                            onClick: () => {
                              if (selectedServerId) {
                                leaveChannel(selectedServerId, channel.name);
                              }
                            },
                            className: "text-red-400",
                          },
                        ]}
                      >
                        <div
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
                      </TouchableContextMenu>
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
                <FaPlus
                  className={`ml-auto ${!isNarrowView && "opacity-0 group-hover:opacity-100"} cursor-pointer`}
                />
              </div>

              {isVoiceChannelsOpen && (
                <div className="ml-2">
                  <div className="px-2 py-1 mb-1 rounded hover:bg-discord-dark-100 flex items-center gap-2 cursor-pointer group">
                    <FaVolumeUp className="shrink-0" />
                    <span className="truncate">General</span>
                    <div
                      className={`ml-auto flex gap-1 ${!isNarrowView && "opacity-0 group-hover:opacity-100"}`}
                    >
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
                    <div
                      className={`ml-auto flex gap-1 ${!isNarrowView && "opacity-0 group-hover:opacity-100"}`}
                    >
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

            {/* Private Messages */}
            <div className="mb-2">
              <div
                className="flex items-center px-2 group cursor-pointer mb-1"
                onClick={() => setIsPrivateChatsOpen(!isPrivateChatsOpen)}
              >
                {isPrivateChatsOpen ? (
                  <FaChevronDown className="text-xs mr-1" />
                ) : (
                  <FaChevronRight className="text-xs mr-1" />
                )}
                <span className="uppercase text-xs font-semibold tracking-wide">
                  Private Messages
                </span>
                <FaPlus
                  className={`ml-auto ${!isNarrowView && "opacity-0 group-hover:opacity-100"} cursor-pointer`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAddPrivateChatModalOpen(true);
                  }}
                />
              </div>

              {isPrivateChatsOpen && (
                <div className="ml-2">
                  {selectedServer.privateChats?.map((privateChat) => (
                    <TouchableContextMenu
                      key={privateChat.id}
                      menuItems={[
                        {
                          label: "Delete Private Chat",
                          icon: <FaTrash size={14} />,
                          onClick: () => {
                            if (selectedServerId) {
                              deletePrivateChat(
                                selectedServerId,
                                privateChat.id,
                              );
                            }
                          },
                          className: "text-red-400",
                        },
                      ]}
                    >
                      <div
                        className={`
                          px-2 py-1 mb-1 rounded flex items-center justify-between group cursor-pointer
                          ${selectedPrivateChatId === privateChat.id ? "bg-discord-dark-400 text-white" : "hover:bg-discord-dark-100 hover:text-discord-channels-active"}
                        `}
                        onClick={() => selectPrivateChat(privateChat.id)}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FaUser className="shrink-0" />
                          <span className="truncate">
                            {privateChat.username}
                          </span>
                        </div>
                        {/* Delete Button */}
                        {selectedPrivateChatId === privateChat.id && (
                          <button
                            className="hidden group-hover:block text-discord-red hover:text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedServerId) {
                                deletePrivateChat(
                                  selectedServerId,
                                  privateChat.id,
                                );
                              }
                            }}
                          >
                            <FaTrash />
                          </button>
                        )}
                      </div>
                    </TouchableContextMenu>
                  ))}
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
              {currentUser?.metadata?.avatar?.value && !avatarLoadFailed ? (
                <img
                  src={currentUser.metadata.avatar.value}
                  alt={currentUser.username}
                  className="w-8 h-8 rounded-full object-cover"
                  onError={() => {
                    setAvatarLoadFailed(true);
                  }}
                />
              ) : (
                <span className="text-white">
                  {currentUser?.username?.charAt(0)?.toUpperCase()}
                </span>
              )}
            </div>
            <div
              className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-discord-dark-400 ${userStatus === "online" ? "bg-discord-green" : userStatus === "away" ? "bg-discord-yellow" : "bg-discord-dark-500"}`}
            />
          </div>
          <div>
            <div className="text-white font-medium text-sm">
              {currentUser?.username || "User"}
            </div>
            <div className="text-xs text-discord-channels-default">
              {userStatus === "online"
                ? "Online"
                : userStatus === "away"
                  ? selectedServer?.awayMessage || "Away"
                  : "Offline"}
            </div>
          </div>
        </div>
        <div className="ml-auto flex gap-2 text-discord-dark-500">
          <button
            className="hover:text-white"
            data-testid="user-settings-button"
          >
            <FaCog />
          </button>
        </div>
      </div>

      {/* Add Private Chat Modal */}
      {selectedServerId && (
        <AddPrivateChatModal
          isOpen={isAddPrivateChatModalOpen}
          onClose={() => setIsAddPrivateChatModalOpen(false)}
          serverId={selectedServerId}
        />
      )}
    </div>
  );
};

export default ChannelList;
