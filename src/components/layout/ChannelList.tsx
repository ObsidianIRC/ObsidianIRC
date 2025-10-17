import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaCheckCircle,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaCog,
  FaHashtag,
  FaPlus,
  FaSpinner,
  FaThumbtack,
  FaTrash,
  FaUser,
} from "react-icons/fa";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import ircClient from "../../lib/ircClient";
import {
  getChannelAvatarUrl,
  getChannelDisplayName,
  isUrlFromFilehost,
  processMarkdownInText,
} from "../../lib/ircUtils";
import useStore, { loadSavedMetadata } from "../../store";
import type { PrivateChat, User } from "../../types";
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
    pinPrivateChat,
    unpinPrivateChat,
    reorderPrivateChats,
    toggleUserProfileModal,
    setMobileViewActiveColumn,
    reorderChannels,
  } = useStore();

  const selectedServerId = useStore((state) => state.ui.selectedServerId);
  const selectedChannelId = useStore((state) => {
    if (!state.ui.selectedServerId) return null;
    return (
      state.ui.perServerSelections[state.ui.selectedServerId]
        ?.selectedChannelId || null
    );
  });
  const selectedPrivateChatId = useStore((state) => {
    if (!state.ui.selectedServerId) return null;
    return (
      state.ui.perServerSelections[state.ui.selectedServerId]
        ?.selectedPrivateChatId || null
    );
  });

  // Get global settings for media controls
  const { showSafeMedia, showExternalContent } = useStore(
    (state) => state.globalSettings,
  );

  // Get the current user for the selected server from the store data (includes metadata)
  // Use a selector to ensure reactivity when metadata changes
  const currentUser = useStore((state) => {
    if (!selectedServerId) return null;

    // Get the current user's username from IRCClient
    const ircCurrentUser = ircClient.getCurrentUser(selectedServerId);
    if (!ircCurrentUser) return null;

    // If we have a currentUser in the store that matches this server's current user, use it (it has modes)
    if (
      state.currentUser &&
      state.currentUser.username === ircCurrentUser.username
    ) {
      return state.currentUser;
    }

    // Otherwise, try to find user in channels for metadata and merge with store currentUser if available
    const selectedServer = state.servers.find((s) => s.id === selectedServerId);
    if (!selectedServer) return state.currentUser || ircCurrentUser;

    // Look for the user in any channel
    for (const channel of selectedServer.channels) {
      const userWithMetadata = channel.users.find(
        (u) => u.username === ircCurrentUser.username,
      );
      if (userWithMetadata) {
        // If we have currentUser in store, merge its modes and IRC op status with the channel user's metadata
        if (
          state.currentUser &&
          state.currentUser.username === userWithMetadata.username
        ) {
          return {
            ...userWithMetadata,
            modes: state.currentUser.modes,
            isIrcOp: state.currentUser.isIrcOp,
          };
        }
        return userWithMetadata;
      }
    }

    // If not found in channels, return store currentUser or IRC user
    return state.currentUser || ircCurrentUser;
  });

  const servers = useStore((state) => state.servers);

  const [isTextChannelsOpen, setIsTextChannelsOpen] = useState(true);
  const [isVoiceChannelsOpen, setIsVoiceChannelsOpen] = useState(true);
  const [isPrivateChatsOpen, setIsPrivateChatsOpen] = useState(true);
  const [newChannelName, setNewChannelName] = useState("");
  const [isAddPrivateChatModalOpen, setIsAddPrivateChatModalOpen] =
    useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [clickedPM, setClickedPM] = useState<string | null>(null);
  const lastSelectedPM = useRef<string | null>(null);
  const [draggedChannelId, setDraggedChannelId] = useState<string | null>(null);
  const [dragOverChannelId, setDragOverChannelId] = useState<string | null>(
    null,
  );
  const [draggedPMId, setDraggedPMId] = useState<string | null>(null);
  const [dragOverPMId, setDragOverPMId] = useState<string | null>(null);

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

  // Check if current user is an IRC operator
  // Check both the computed currentUser and the store's currentUser for IRC operator status
  const storeCurrentUser = useStore((state) => state.currentUser);
  const isIrcOp = currentUser?.isIrcOp || storeCurrentUser?.isIrcOp || false;

  // Get channel order from store
  const channelOrder = useStore((state) => state.channelOrder);

  // Sort channels by saved order, falling back to join order
  const sortedChannels = useMemo(() => {
    if (!selectedServer || !selectedServerId) return [];

    const savedOrder = channelOrder[selectedServerId];
    const channels = selectedServer.channels;

    if (!savedOrder || savedOrder.length === 0) {
      // No saved order, return channels in join order
      return channels;
    }

    // Sort channels by saved order (which now contains channel names)
    const sorted = [...channels].sort((a, b) => {
      const indexA = savedOrder.indexOf(a.name);
      const indexB = savedOrder.indexOf(b.name);

      // If both channels are in the saved order, sort by index
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }

      // If only one channel is in the saved order, it comes first
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;

      // If neither channel is in the saved order, maintain original order
      return 0;
    });

    return sorted;
  }, [selectedServer, selectedServerId, channelOrder]);

  useEffect(() => {
    setClickedPM(null);
    lastSelectedPM.current = null;
  });

  // Helper function to get user metadata for a private chat
  const getUserMetadata = (username: string) => {
    if (!selectedServerId) return null;

    // First check localStorage for saved metadata
    const savedMetadata = loadSavedMetadata();
    const serverMetadata = savedMetadata[selectedServerId];
    if (serverMetadata?.[username]) {
      return serverMetadata[username];
    }

    // If not in localStorage, check if user is in any shared channels
    if (!selectedServer) return null;

    // Search through all channels for this user
    for (const channel of selectedServer.channels) {
      const user = channel.users.find(
        (u) => u.username.toLowerCase() === username.toLowerCase(),
      );
      if (user?.metadata && Object.keys(user.metadata).length > 0) {
        return user.metadata;
      }
    }

    return null;
  };

  // Helper function to get full user object from shared channels
  const getUserFromChannels = (username: string) => {
    if (!selectedServer) return null;

    // Search through all channels for this user
    for (const channel of selectedServer.channels) {
      const user = channel.users.find(
        (u) => u.username.toLowerCase() === username.toLowerCase(),
      );
      if (user) {
        return user;
      }
    }

    return null;
  };

  // Helper function to render verification and bot badges
  // showVerified: only show verified badge when rendering next to the actual nickname
  const renderUserBadges = (
    username: string,
    privateChat: PrivateChat | undefined,
    user: User | null,
    showVerified = true,
  ) => {
    // Get account and bot info from privateChat first, fall back to channel user
    const account = privateChat?.account || user?.account;
    const isBot =
      privateChat?.isBot ||
      user?.isBot ||
      user?.metadata?.bot?.value === "true";
    const isIrcOp = user?.isIrcOp || false;

    const isVerified =
      showVerified &&
      account &&
      account !== "0" &&
      username.toLowerCase() === account.toLowerCase();

    if (!isVerified && !isBot && !isIrcOp) return null;

    return (
      <>
        {isVerified && (
          <FaCheckCircle
            className="inline ml-0.5 text-green-500"
            style={{ fontSize: "0.75em", verticalAlign: "baseline" }}
            title="Verified account"
          />
        )}
        {isBot && (
          <span
            className="inline ml-0.5"
            style={{ fontSize: "0.9em" }}
            title="Bot"
          >
            🤖
          </span>
        )}
        {isIrcOp && (
          <span
            className="inline ml-0.5"
            style={{ fontSize: "0.9em" }}
            title="IRC Operator"
          >
            🔑
          </span>
        )}
      </>
    );
  };

  // Sort private chats by order (pinned first, then by order number)
  const sortedPrivateChats = useMemo(() => {
    if (!selectedServer) return [];

    const privateChats = selectedServer.privateChats || [];

    // Sort: pinned chats first (by order), then unpinned chats
    return [...privateChats].sort((a, b) => {
      // Both pinned: sort by order
      if (a.isPinned && b.isPinned) {
        return (a.order || 0) - (b.order || 0);
      }
      // Only a is pinned
      if (a.isPinned) return -1;
      // Only b is pinned
      if (b.isPinned) return 1;
      // Neither pinned: maintain order
      return 0;
    });
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

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, channelId: string) => {
    setDraggedChannelId(channelId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);
  };

  const handleDragOver = (e: React.DragEvent, channelId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverChannelId(channelId);
  };

  const handleDragLeave = () => {
    setDragOverChannelId(null);
  };

  const handleDrop = (e: React.DragEvent, targetChannelId: string) => {
    e.preventDefault();

    if (
      !draggedChannelId ||
      !selectedServerId ||
      draggedChannelId === targetChannelId
    ) {
      setDraggedChannelId(null);
      setDragOverChannelId(null);
      return;
    }

    // Get the current order of non-private channels
    const nonPrivateChannels = sortedChannels.filter((c) => !c.isPrivate);
    const draggedIndex = nonPrivateChannels.findIndex(
      (c) => c.id === draggedChannelId,
    );
    const targetIndex = nonPrivateChannels.findIndex(
      (c) => c.id === targetChannelId,
    );

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedChannelId(null);
      setDragOverChannelId(null);
      return;
    }

    // Reorder the channels
    const reordered = [...nonPrivateChannels];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, removed);

    // Update the store with the new order
    const newOrder = reordered.map((c) => c.id);
    reorderChannels(selectedServerId, newOrder);

    setDraggedChannelId(null);
    setDragOverChannelId(null);
  };

  const handleDragEnd = () => {
    setDraggedChannelId(null);
    setDragOverChannelId(null);
  };

  // Private message drag and drop handlers
  const handlePMDragStart = (e: React.DragEvent, pmId: string) => {
    setDraggedPMId(pmId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);
  };

  const handlePMDragOver = (e: React.DragEvent, pmId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverPMId(pmId);
  };

  const handlePMDragLeave = () => {
    setDragOverPMId(null);
  };

  const handlePMDrop = (e: React.DragEvent, targetPMId: string) => {
    e.preventDefault();

    if (!draggedPMId || !selectedServerId || draggedPMId === targetPMId) {
      setDraggedPMId(null);
      setDragOverPMId(null);
      return;
    }

    // Get sorted private chats
    const privateChats = sortedPrivateChats;
    const draggedIndex = privateChats.findIndex((pm) => pm.id === draggedPMId);
    const targetIndex = privateChats.findIndex((pm) => pm.id === targetPMId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedPMId(null);
      setDragOverPMId(null);
      return;
    }

    // Reorder the private chats
    const reordered = [...privateChats];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, removed);

    // Update the store with the new order
    const newOrder = reordered.map((pm) => pm.id);
    reorderPrivateChats(selectedServerId, newOrder);

    setDraggedPMId(null);
    setDragOverPMId(null);
  };

  const handlePMDragEnd = () => {
    setDraggedPMId(null);
    setDragOverPMId(null);
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
        <div className="flex flex-col min-w-0 flex-1">
          <h1 className="font-bold text-white truncate">
            {selectedServer?.networkName || selectedServer?.name || "Home"}
          </h1>
          {selectedServer?.networkName &&
            selectedServer.name !== selectedServer.networkName && (
              <div className="text-xs text-discord-channels-default truncate">
                {selectedServer.name}
              </div>
            )}
        </div>
        <button
          onClick={handleCollapseClick}
          className="text-discord-channels-default hover:text-white"
        >
          <FaChevronLeft />
        </button>
      </div>

      {/* Channel list */}
      <div className="flex-grow overflow-y-auto overflow-x-hidden px-2 pt-4 max-w-full">
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
                  <div className="flex items-center bg-discord-dark-400 rounded overflow-hidden max-w-full">
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
                <div>
                  {sortedChannels
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
                          draggable
                          onDragStart={(e) => handleDragStart(e, channel.id)}
                          onDragOver={(e) => handleDragOver(e, channel.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, channel.id)}
                          onDragEnd={handleDragEnd}
                          className={`
                          px-2 py-1 mb-1 rounded-md flex items-center justify-between group cursor-pointer max-w-full
                          transition-all duration-200 ease-in-out
                          shadow-sm
                          ${
                            selectedChannelId === channel.id
                              ? "bg-black text-white"
                              : "bg-discord-dark-400/50 hover:bg-discord-primary/70 hover:text-white"
                          }
                          ${draggedChannelId === channel.id ? "opacity-50" : ""}
                        `}
                          onClick={() => selectChannel(channel.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {/* Avatar or Hash Icon */}
                            <div className="flex-shrink-0">
                              {(() => {
                                const avatarUrl = getChannelAvatarUrl(
                                  channel.metadata,
                                  selectedChannelId === channel.id ? 32 : 24,
                                );
                                const selectedServer = servers.find(
                                  (s) => s.id === selectedServerId,
                                );
                                const isFilehostAvatar =
                                  avatarUrl &&
                                  selectedServer?.filehost &&
                                  isUrlFromFilehost(
                                    avatarUrl,
                                    selectedServer.filehost,
                                  );
                                const shouldShowAvatar =
                                  avatarUrl &&
                                  ((isFilehostAvatar && showSafeMedia) ||
                                    showExternalContent);

                                return shouldShowAvatar ? (
                                  <img
                                    src={avatarUrl}
                                    alt={channel.name}
                                    className={`rounded-full object-cover ${
                                      selectedChannelId === channel.id
                                        ? "w-8 h-8"
                                        : "w-6 h-6"
                                    }`}
                                    onError={(e) => {
                                      // Fallback to # icon on error
                                      e.currentTarget.style.display = "none";
                                      const parent =
                                        e.currentTarget.parentElement;
                                      const fallbackIcon =
                                        parent?.querySelector(
                                          ".fallback-hash-icon",
                                        );
                                      if (fallbackIcon) {
                                        (
                                          fallbackIcon as HTMLElement
                                        ).style.display = "inline-block";
                                      }
                                    }}
                                  />
                                ) : null;
                              })()}
                              <FaHashtag
                                className={`fallback-hash-icon ${
                                  selectedChannelId === channel.id
                                    ? "text-2xl"
                                    : "text-lg"
                                }`}
                                style={{
                                  display: (() => {
                                    const avatarUrl = getChannelAvatarUrl(
                                      channel.metadata,
                                      selectedChannelId === channel.id
                                        ? 32
                                        : 24,
                                    );
                                    const selectedServer = servers.find(
                                      (s) => s.id === selectedServerId,
                                    );
                                    const isFilehostAvatar =
                                      avatarUrl &&
                                      selectedServer?.filehost &&
                                      avatarUrl.startsWith(
                                        selectedServer.filehost,
                                      );
                                    const shouldShowAvatar =
                                      avatarUrl &&
                                      ((isFilehostAvatar && showSafeMedia) ||
                                        showExternalContent);
                                    return shouldShowAvatar
                                      ? "none"
                                      : "inline-block";
                                  })(),
                                }}
                              />
                            </div>

                            {/* Channel name and topic */}
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="truncate font-medium max-w-full">
                                {getChannelDisplayName(
                                  channel.name,
                                  channel.metadata,
                                )}
                              </span>
                              {/* Badge with channel name (if display-name exists) and topic */}
                              <div className="flex items-center gap-1.5 text-xs truncate">
                                {(() => {
                                  const displayName =
                                    channel.metadata?.["display-name"]?.value;
                                  const channelNameWithoutHash =
                                    channel.name.replace(/^#/, "");
                                  const topic = channel.topic;

                                  // Show actual channel name in green badge if display-name exists and is different
                                  const showChannelBadge =
                                    displayName &&
                                    displayName !== channelNameWithoutHash;

                                  // Render the badge
                                  if (showChannelBadge && topic) {
                                    return (
                                      <>
                                        <span
                                          className={`bg-gray-300 text-black px-0.5 py-0 rounded font-bold whitespace-nowrap ${
                                            selectedChannelId === channel.id
                                              ? "text-[11px]"
                                              : "text-[9px]"
                                          }`}
                                        >
                                          {channel.name}
                                        </span>
                                        <span className="text-discord-text-muted opacity-50">
                                          •
                                        </span>
                                        <span className="text-discord-text-muted truncate">
                                          {topic}
                                        </span>
                                      </>
                                    );
                                  }
                                  if (showChannelBadge) {
                                    return (
                                      <span
                                        className={`bg-gray-300 text-black px-0.5 py-0 rounded font-bold whitespace-nowrap ${
                                          selectedChannelId === channel.id
                                            ? "text-[11px]"
                                            : "text-[9px]"
                                        }`}
                                      >
                                        {channel.name}
                                      </span>
                                    );
                                  }
                                  if (topic) {
                                    return (
                                      <span className="text-discord-text-muted truncate">
                                        {topic}
                                      </span>
                                    );
                                  }

                                  return null;
                                })()}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Loading/Unread/Mention indicators */}
                            {channel.isLoadingHistory ? (
                              <FaSpinner className="w-3 h-3 text-gray-400 animate-spin" />
                            ) : (
                              selectedChannelId !== channel.id &&
                              (channel.isMentioned &&
                              channel.unreadCount > 0 ? (
                                <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                                  {channel.unreadCount}
                                </span>
                              ) : channel.unreadCount > 0 ? (
                                <span className="w-2 h-2 bg-blue-500 rounded-full" />
                              ) : null)
                            )}
                            {/* Trash Button */}
                            {selectedChannelId === channel.id && (
                              <button
                                className="hidden group-hover:block text-discord-red hover:text-white"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (selectedServerId) {
                                    leaveChannel(
                                      selectedServerId,
                                      channel.name,
                                    );
                                  }
                                }}
                              >
                                <FaTrash />
                              </button>
                            )}
                          </div>
                        </div>
                      </TouchableContextMenu>
                    ))}
                </div>
              )}
            </div>

            {/* Voice Channels */}
            <div className="px-2 mb-2">
              <div className="w-full flex items-center justify-center bg-discord-dark-400 rounded px-2 py-0.5 leading-none">
                <span className="text-[10px] text-discord-text-muted italic">
                  Voice Channels coming soon!
                </span>
              </div>
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
                <div>
                  {sortedPrivateChats.map((privateChat) => (
                    <TouchableContextMenu
                      key={privateChat.id}
                      menuItems={[
                        {
                          label: privateChat.isPinned
                            ? "Unpin Private Chat"
                            : "Pin Private Chat",
                          icon: <FaThumbtack size={14} />,
                          onClick: () => {
                            if (selectedServerId) {
                              if (privateChat.isPinned) {
                                unpinPrivateChat(
                                  selectedServerId,
                                  privateChat.id,
                                );
                              } else {
                                pinPrivateChat(
                                  selectedServerId,
                                  privateChat.id,
                                );
                              }
                            }
                          },
                          className: privateChat.isPinned
                            ? "text-yellow-400"
                            : "",
                        },
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
                        draggable={privateChat.isPinned}
                        onDragStart={(e) =>
                          privateChat.isPinned &&
                          handlePMDragStart(e, privateChat.id)
                        }
                        onDragOver={(e) => handlePMDragOver(e, privateChat.id)}
                        onDragLeave={handlePMDragLeave}
                        onDrop={(e) => handlePMDrop(e, privateChat.id)}
                        onDragEnd={handlePMDragEnd}
                        className={`
                          px-2 py-1 mb-1 rounded-md flex items-center justify-between group cursor-pointer max-w-full
                          ${selectedPrivateChatId === privateChat.id ? "bg-discord-dark-400 text-white" : "hover:bg-discord-dark-100 hover:text-discord-channels-active"}
                          ${draggedPMId === privateChat.id ? "opacity-50" : ""}
                          ${dragOverPMId === privateChat.id && draggedPMId !== privateChat.id ? "border-t-2 border-discord-blurple" : ""}
                        `}
                        style={{
                          transition:
                            "background-color 150ms ease-in, color 150ms ease-in, opacity 200ms ease-in-out",
                          backgroundColor:
                            selectedPrivateChatId !== privateChat.id
                              ? privateChat.isOnline
                                ? privateChat.isAway
                                  ? "rgba(234, 179, 8, 0.12)" // yellow tint
                                  : "rgba(34, 197, 94, 0.12)" // green tint
                                : "rgba(107, 114, 128, 0.08)" // gray tint
                              : undefined,
                        }}
                        onClick={() => {
                          if (lastSelectedPM.current === privateChat.id) return;
                          lastSelectedPM.current = privateChat.id;
                          selectPrivateChat(privateChat.id);
                        }}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {/* User avatar with status indicator */}
                          <div className="relative flex-shrink-0">
                            {(() => {
                              const userMetadata = getUserMetadata(
                                privateChat.username,
                              );
                              const avatarUrl = userMetadata?.avatar?.value;
                              const selectedServer = servers.find(
                                (s) => s.id === selectedServerId,
                              );
                              const isFilehostAvatar =
                                avatarUrl &&
                                selectedServer?.filehost &&
                                isUrlFromFilehost(
                                  avatarUrl,
                                  selectedServer.filehost,
                                );
                              const shouldShowAvatar =
                                avatarUrl &&
                                ((isFilehostAvatar && showSafeMedia) ||
                                  showExternalContent);

                              return shouldShowAvatar ? (
                                <img
                                  src={avatarUrl}
                                  alt={privateChat.username}
                                  className={`rounded-full object-cover ${
                                    selectedPrivateChatId === privateChat.id
                                      ? "w-8 h-8"
                                      : "w-6 h-6"
                                  }`}
                                  onError={(e) => {
                                    // Fallback to FaUser icon on error
                                    e.currentTarget.style.display = "none";
                                    const parent =
                                      e.currentTarget.parentElement;
                                    const fallbackIcon = parent?.querySelector(
                                      ".fallback-user-icon",
                                    );
                                    if (fallbackIcon) {
                                      (
                                        fallbackIcon as HTMLElement
                                      ).style.display = "block";
                                    }
                                  }}
                                />
                              ) : (
                                <FaUser
                                  className={`shrink-0 fallback-user-icon ${
                                    selectedPrivateChatId === privateChat.id
                                      ? "text-2xl"
                                      : ""
                                  }`}
                                />
                              );
                            })()}
                            {/* Fallback icon (hidden by default if avatar exists) */}
                            {(() => {
                              const userMetadata = getUserMetadata(
                                privateChat.username,
                              );
                              const avatarUrl = userMetadata?.avatar?.value;
                              const selectedServer = servers.find(
                                (s) => s.id === selectedServerId,
                              );
                              const isFilehostAvatar =
                                avatarUrl &&
                                selectedServer?.filehost &&
                                isUrlFromFilehost(
                                  avatarUrl,
                                  selectedServer.filehost,
                                );
                              const shouldShowAvatar =
                                avatarUrl &&
                                ((isFilehostAvatar && showSafeMedia) ||
                                  showExternalContent);

                              return shouldShowAvatar ? (
                                <FaUser
                                  className={`shrink-0 fallback-user-icon ${
                                    selectedPrivateChatId === privateChat.id
                                      ? "text-2xl"
                                      : ""
                                  }`}
                                  style={{ display: "none" }}
                                />
                              ) : null;
                            })()}
                            {/* Status indicator */}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-discord-dark-200 ${
                                privateChat.isOnline
                                  ? privateChat.isAway
                                    ? "bg-yellow-500"
                                    : "bg-green-500"
                                  : "bg-gray-500"
                              }`}
                              title={
                                privateChat.isOnline
                                  ? privateChat.isAway
                                    ? "Away"
                                    : "Online"
                                  : "Offline"
                              }
                            />
                          </div>
                          <div className="flex flex-col truncate min-w-0">
                            {/* Display name or username */}
                            <span className="truncate font-medium max-w-full">
                              {(() => {
                                const userMetadata = getUserMetadata(
                                  privateChat.username,
                                );
                                const displayName =
                                  userMetadata?.["display-name"]?.value;
                                const user = getUserFromChannels(
                                  privateChat.username,
                                );
                                return (
                                  <>
                                    {displayName || privateChat.username}
                                    {/* Only show verified badge if NO display-name (showing username directly) */}
                                    {renderUserBadges(
                                      privateChat.username,
                                      privateChat,
                                      user,
                                      !displayName,
                                    )}
                                  </>
                                );
                              })()}
                            </span>
                            {/* Badge with nick/realname and status/away message */}
                            <div className="flex items-center gap-1.5 text-xs truncate">
                              {(() => {
                                const userMetadata = getUserMetadata(
                                  privateChat.username,
                                );
                                const displayName =
                                  userMetadata?.["display-name"]?.value;
                                const user = getUserFromChannels(
                                  privateChat.username,
                                );

                                // Show username in green badge if display-name exists
                                const showUsernameBadge = !!displayName;

                                // Determine what to show after the username badge
                                let secondPart: React.ReactNode = null;
                                if (!displayName) {
                                  // If no display-name (nick is shown as main text), show realname
                                  const realname =
                                    privateChat.realname || user?.realname;
                                  if (realname) {
                                    // Parse IRC colors/formatting in realname
                                    secondPart =
                                      processMarkdownInText(realname);
                                  }
                                }

                                // Away message or status (always check for this)
                                const awayMsg = privateChat.awayMessage;
                                const statusText = userMetadata?.status?.value;
                                const statusOrAway = awayMsg || statusText;
                                const isAway = !!awayMsg;

                                // If we have both secondPart and status, append status
                                if (secondPart && statusOrAway) {
                                  secondPart = (
                                    <>
                                      {secondPart}
                                      <span className="text-discord-text-muted opacity-50 mx-1.5">
                                        •
                                      </span>
                                      <span
                                        className={`text-discord-text-muted truncate ${isAway ? "italic" : ""}`}
                                      >
                                        {statusOrAway}
                                      </span>
                                    </>
                                  );
                                } else if (!secondPart && statusOrAway) {
                                  // Only status/away, no realname
                                  secondPart = (
                                    <span
                                      className={`text-discord-text-muted truncate ${isAway ? "italic" : ""}`}
                                    >
                                      {statusOrAway}
                                    </span>
                                  );
                                }

                                // Render the badge
                                if (showUsernameBadge && secondPart) {
                                  return (
                                    <>
                                      <span
                                        className={`bg-gray-300 text-black px-0.5 py-0 rounded font-bold whitespace-nowrap ${
                                          selectedPrivateChatId ===
                                          privateChat.id
                                            ? "text-[11px]"
                                            : "text-[9px]"
                                        }`}
                                      >
                                        {privateChat.username}
                                        {renderUserBadges(
                                          privateChat.username,
                                          privateChat,
                                          user,
                                        )}
                                      </span>
                                      <span className="text-discord-text-muted opacity-50">
                                        •
                                      </span>
                                      {secondPart}
                                    </>
                                  );
                                }
                                if (showUsernameBadge) {
                                  return (
                                    <span
                                      className={`bg-gray-300 text-black px-0.5 py-0 rounded font-bold whitespace-nowrap ${
                                        selectedPrivateChatId === privateChat.id
                                          ? "text-[11px]"
                                          : "text-[9px]"
                                      }`}
                                    >
                                      {privateChat.username}
                                      {renderUserBadges(
                                        privateChat.username,
                                        privateChat,
                                        user,
                                      )}
                                    </span>
                                  );
                                }
                                if (secondPart) {
                                  return secondPart;
                                }

                                return null;
                              })()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Unread/Mention indicators */}
                          {selectedPrivateChatId !== privateChat.id &&
                            (privateChat.isMentioned &&
                            privateChat.unreadCount > 0 ? (
                              <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                                {privateChat.unreadCount}
                              </span>
                            ) : privateChat.unreadCount > 0 ? (
                              <span className="w-2 h-2 bg-blue-500 rounded-full" />
                            ) : null)}
                          {/* Pin/Unpin and Delete Buttons */}
                          {selectedPrivateChatId === privateChat.id && (
                            <>
                              <button
                                className={`hidden group-hover:block ${
                                  privateChat.isPinned
                                    ? "text-green-500 hover:text-green-400"
                                    : "text-discord-text-muted hover:text-yellow-400"
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (selectedServerId) {
                                    if (privateChat.isPinned) {
                                      unpinPrivateChat(
                                        selectedServerId,
                                        privateChat.id,
                                      );
                                    } else {
                                      pinPrivateChat(
                                        selectedServerId,
                                        privateChat.id,
                                      );
                                    }
                                  }
                                }}
                                title={privateChat.isPinned ? "Unpin" : "Pin"}
                              >
                                <FaThumbtack
                                  className={
                                    privateChat.isPinned ? "" : "rotate-[25deg]"
                                  }
                                  style={
                                    privateChat.isPinned
                                      ? {}
                                      : { transform: "rotate(25deg)" }
                                  }
                                />
                              </button>
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
                                title="Close"
                              >
                                <FaTrash />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </TouchableContextMenu>
                  ))}
                </div>
              )}
            </div>

            {/* Server */}
            <div className="mb-2">
              <div className="px-2 mb-1">
                <span className="uppercase text-xs font-semibold tracking-wide">
                  Server
                </span>
              </div>

              <div>
                <div
                  className={`
                    px-2 py-1 mb-1 rounded-md flex items-center cursor-pointer
                    transition-all duration-200 ease-in-out
                    ${selectedChannelId === "server-notices" ? "bg-discord-dark-400 text-white" : "hover:bg-discord-dark-100 hover:text-discord-channels-active"}
                  `}
                  onClick={() => selectChannel("server-notices")}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FaHashtag
                      className={`shrink-0 ${
                        selectedChannelId === "server-notices" ? "text-2xl" : ""
                      }`}
                    />
                    <span className="truncate">Server Notices</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="mt-auto mb-2 px-2">
        <div
          className="py-1 rounded-md flex items-center justify-between group cursor-pointer max-w-full transition-all duration-200 ease-in-out shadow-sm bg-discord-dark-400/50 hover:bg-discord-primary/70"
          onClick={() => toggleUserProfileModal(true)}
        >
          <div className="flex items-center gap-2 ml-2 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-discord-dark-100 flex items-center justify-center">
                {(() => {
                  const avatarUrl = currentUser?.metadata?.avatar?.value;
                  const selectedServer = servers.find(
                    (s) => s.id === selectedServerId,
                  );
                  const isFilehostAvatar =
                    avatarUrl &&
                    selectedServer?.filehost &&
                    isUrlFromFilehost(avatarUrl, selectedServer.filehost);
                  const shouldShowAvatar =
                    avatarUrl &&
                    ((isFilehostAvatar && showSafeMedia) ||
                      showExternalContent) &&
                    !avatarLoadFailed;

                  return shouldShowAvatar ? (
                    <img
                      src={avatarUrl}
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
                  );
                })()}
              </div>
              <div
                className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-discord-dark-400 ${userStatus === "online" ? "bg-discord-green" : userStatus === "away" ? "bg-discord-yellow" : "bg-discord-dark-500"}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-discord-channels-active font-medium text-sm truncate flex items-center gap-1">
                <span>{currentUser?.username || "User"}</span>
                {isIrcOp && (
                  <span
                    className="bg-blue-600 text-white px-1 py-0.5 rounded text-xs font-bold flex-shrink-0"
                    title="You are an IRC Operator"
                  >
                    🔑
                  </span>
                )}
              </div>
              <div className="text-xs text-discord-channels-default truncate">
                {userStatus === "online"
                  ? "Online"
                  : userStatus === "away"
                    ? selectedServer?.awayMessage || "Away"
                    : "Offline"}
              </div>
            </div>
          </div>
          <div className="ml-auto flex gap-2 text-discord-dark-500 flex-shrink-0">
            <button
              className="hover:text-white"
              data-testid="user-settings-button"
              onClick={() => toggleUserProfileModal(true)}
            >
              <FaCog className="mr-2" />
            </button>
          </div>
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
