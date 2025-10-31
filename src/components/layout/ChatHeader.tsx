import { UsersIcon } from "@heroicons/react/24/solid";
import type React from "react";
import { useMemo, useState } from "react";
import {
  FaBell,
  FaBellSlash,
  FaCheckCircle,
  FaChevronLeft,
  FaChevronRight,
  FaEdit,
  FaHashtag,
  FaInfoCircle,
  FaList,
  FaPenAlt,
  FaSearch,
  FaThumbtack,
  FaUser,
  FaUserPlus,
} from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import {
  getChannelAvatarUrl,
  getChannelDisplayName,
  hasOpPermission,
  isUrlFromFilehost,
} from "../../lib/ircUtils";
import useStore, { loadSavedMetadata } from "../../store";
import type { Channel, PrivateChat, User } from "../../types";
import UserProfileModal from "../ui/UserProfileModal";

interface ChatHeaderProps {
  selectedChannel: Channel | null;
  selectedPrivateChat: PrivateChat | null;
  selectedServerId: string | null;
  selectedChannelId: string | null;
  currentUser: User | null;
  isChanListVisible: boolean;
  isMemberListVisible: boolean;
  isNarrowView: boolean;
  globalSettings: {
    notificationVolume: number;
  };
  searchQuery: string;
  onToggleChanList: () => void;
  onToggleMemberList: () => void;
  onSearchQueryChange: (query: string) => void;
  onToggleNotificationVolume: () => void;
  onOpenChannelSettings: () => void;
  onOpenInviteUser: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  selectedChannel,
  selectedPrivateChat,
  selectedServerId,
  selectedChannelId,
  currentUser,
  isChanListVisible,
  isMemberListVisible,
  isNarrowView,
  globalSettings,
  searchQuery,
  onToggleChanList,
  onToggleMemberList,
  onSearchQueryChange,
  onToggleNotificationVolume,
  onOpenChannelSettings,
  onOpenInviteUser,
}) => {
  const { openModal, toggleMemberList, pinPrivateChat, unpinPrivateChat } =
    useStore();
  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [editedTopic, setEditedTopic] = useState("");
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [userProfileModalOpen, setUserProfileModalOpen] = useState(false);

  const servers = useStore((state) => state.servers);

  // Get global settings for media controls
  const { showSafeMedia, showExternalContent } = useStore(
    (state) => state.globalSettings,
  );

  // Get private chat user metadata - first check localStorage, then check shared channels
  const privateChatUserMetadata = useMemo(() => {
    if (!selectedPrivateChat || !selectedServerId) return null;

    // First check localStorage for saved metadata
    const savedMetadata = loadSavedMetadata();
    const serverMetadata = savedMetadata[selectedServerId];
    if (serverMetadata?.[selectedPrivateChat.username]) {
      return serverMetadata[selectedPrivateChat.username];
    }

    // If not in localStorage, check if user is in any shared channels
    const server = servers.find((s) => s.id === selectedServerId);
    if (!server) return null;

    // Search through all channels for this user
    for (const channel of server.channels) {
      const user = channel.users.find(
        (u) =>
          u.username.toLowerCase() ===
          selectedPrivateChat.username.toLowerCase(),
      );
      if (user?.metadata && Object.keys(user.metadata).length > 0) {
        return user.metadata;
      }
    }

    return null;
  }, [selectedPrivateChat, selectedServerId, servers]);

  // Helper function to get user metadata
  const getUserMetadata = (username: string) => {
    if (!selectedServerId) return null;

    // First check localStorage for saved metadata
    const savedMetadata = loadSavedMetadata();
    const serverMetadata = savedMetadata[selectedServerId];
    if (serverMetadata?.[username]) {
      return serverMetadata[username];
    }

    // If not in localStorage, check if user is in any shared channels
    const server = servers.find((s) => s.id === selectedServerId);
    if (!server) return null;

    // Search through all channels for this user
    for (const channel of server.channels) {
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
    const server = servers.find((s) => s.id === selectedServerId);
    if (!server) return null;

    // Search through all channels for this user
    for (const channel of server.channels) {
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

  const privateChatAvatar = privateChatUserMetadata?.avatar?.value;

  // Check if current user is operator
  const isOperator = (() => {
    if (!selectedChannel || !selectedServerId) return false;
    const serverCurrentUser = ircClient.getCurrentUser(selectedServerId);
    if (!serverCurrentUser) return false;

    const channelUser = selectedChannel.users.find(
      (u) => u.username === serverCurrentUser.username,
    );
    return (
      channelUser?.status?.includes("@") || channelUser?.status?.includes("~")
    );
  })();

  return (
    <div className="min-h-[56px] px-4 border-b border-discord-dark-400 flex flex-wrap items-start md:items-center justify-between shadow-sm py-2 md:py-0 md:h-12 gap-y-2">
      <div className="flex items-center flex-1 min-w-0 w-full md:w-auto">
        {!isChanListVisible && (
          <button
            onClick={onToggleChanList}
            className="text-discord-channels-default hover:text-white mr-4 flex-shrink-0"
            aria-label="Expand channel list"
          >
            {isNarrowView ? <FaChevronLeft /> : <FaChevronRight />}
          </button>
        )}
        {selectedChannel && (
          <div className="flex flex-col min-w-0 flex-1 md:flex-row md:items-center">
            <div className="flex items-center min-w-0 flex-shrink-0">
              {(() => {
                const avatarUrl = getChannelAvatarUrl(
                  selectedChannel.metadata,
                  50,
                );
                const selectedServer = servers.find(
                  (s) => s.id === selectedServerId,
                );
                const isFilehostAvatar =
                  avatarUrl &&
                  selectedServer?.filehost &&
                  isUrlFromFilehost(avatarUrl, selectedServer.filehost);
                const shouldShowAvatar =
                  avatarUrl &&
                  ((isFilehostAvatar && showSafeMedia) || showExternalContent);

                return shouldShowAvatar ? (
                  <img
                    src={avatarUrl}
                    alt={selectedChannel.name}
                    className="w-12 h-12 rounded-full object-cover mr-2 flex-shrink-0"
                    onError={(e) => {
                      // Fallback to # icon on error
                      e.currentTarget.style.display = "none";
                      const parent = e.currentTarget.parentElement;
                      const fallbackIcon = parent?.querySelector(
                        ".fallback-hash-icon",
                      );
                      if (fallbackIcon) {
                        (fallbackIcon as HTMLElement).style.display =
                          "inline-block";
                      }
                    }}
                  />
                ) : null;
              })()}
              <FaHashtag
                className="text-discord-text-muted mr-2 fallback-hash-icon flex-shrink-0 text-3xl"
                style={{
                  display: (() => {
                    const avatarUrl = getChannelAvatarUrl(
                      selectedChannel.metadata,
                      50,
                    );
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
                        showExternalContent);
                    return shouldShowAvatar ? "none" : "inline-block";
                  })(),
                }}
              />
              <h2 className="font-bold text-white mr-4 truncate">
                {getChannelDisplayName(
                  selectedChannel.name,
                  selectedChannel.metadata,
                )}
              </h2>
            </div>
            <div className="md:mx-2 md:text-discord-text-muted hidden md:block">
              |
            </div>
            {isEditingTopic ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (selectedServerId && selectedChannel) {
                    ircClient.setTopic(
                      selectedServerId,
                      selectedChannel.name,
                      editedTopic,
                    );
                    setIsEditingTopic(false);
                  }
                }}
                className="flex items-center gap-2 flex-1 max-w-md mt-1 md:mt-0"
              >
                <input
                  type="text"
                  value={editedTopic}
                  onChange={(e) => setEditedTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setIsEditingTopic(false);
                    }
                  }}
                  autoFocus
                  className="flex-1 px-2 py-1 bg-discord-dark-300 text-white text-sm rounded"
                  placeholder="Enter topic..."
                />
                <button
                  type="submit"
                  className="px-3 py-1 bg-discord-primary hover:bg-opacity-80 text-white text-sm rounded"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTopic(false)}
                  className="px-3 py-1 bg-discord-dark-400 hover:bg-discord-dark-500 text-white text-sm rounded"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => {
                  if (selectedChannel) {
                    const currentUserInChannel = selectedChannel.users.find(
                      (u) => u.username === currentUser?.username,
                    );
                    if (hasOpPermission(currentUserInChannel?.status)) {
                      setEditedTopic(selectedChannel.topic || "");
                      setIsEditingTopic(true);
                    }
                  }
                }}
                className="text-discord-text-muted text-xs md:text-sm hover:text-white truncate min-w-0 md:max-w-md mt-0.5 mb-1 md:mt-0 md:mb-0"
                title={
                  selectedChannel.topic
                    ? `Topic: ${selectedChannel.topic}${
                        selectedChannel.users.find(
                          (u) => u.username === currentUser?.username,
                        ) &&
                        hasOpPermission(
                          selectedChannel.users.find(
                            (u) => u.username === currentUser?.username,
                          )?.status,
                        )
                          ? " (Click to edit)"
                          : ""
                      }`
                    : "No topic set"
                }
              >
                {selectedChannel.topic || "No topic"}
              </button>
            )}
          </div>
        )}
        {selectedPrivateChat && (
          <div className="flex items-center gap-3">
            {/* User avatar */}
            <div className="relative w-10 h-10 flex-shrink-0">
              {(() => {
                const selectedServer = servers.find(
                  (s) => s.id === selectedServerId,
                );
                const isFilehostAvatar =
                  privateChatAvatar &&
                  selectedServer?.filehost &&
                  isUrlFromFilehost(privateChatAvatar, selectedServer.filehost);
                const shouldShowAvatar =
                  privateChatAvatar &&
                  ((isFilehostAvatar && showSafeMedia) ||
                    showExternalContent) &&
                  !avatarLoadFailed;

                return shouldShowAvatar ? (
                  <img
                    src={privateChatAvatar}
                    alt={selectedPrivateChat.username}
                    className="w-full h-full rounded-full object-cover"
                    onError={() => setAvatarLoadFailed(true)}
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-discord-dark-400 flex items-center justify-center">
                    <FaUser className="text-discord-text-muted text-xl" />
                  </div>
                );
              })()}
              {/* Status indicator */}
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-discord-dark-200 ${
                  selectedPrivateChat.isOnline
                    ? selectedPrivateChat.isAway
                      ? "bg-yellow-500"
                      : "bg-green-500"
                    : "bg-gray-500"
                }`}
                title={
                  selectedPrivateChat.isOnline
                    ? selectedPrivateChat.isAway
                      ? "Away"
                      : "Online"
                    : "Offline"
                }
              />
            </div>
            {/* Username and status */}
            <div className="flex flex-col">
              <h2 className="font-bold text-white">
                {(() => {
                  const userMetadata = getUserMetadata(
                    selectedPrivateChat.username,
                  );
                  const displayName = userMetadata?.["display-name"]?.value;
                  const user = getUserFromChannels(
                    selectedPrivateChat.username,
                  );
                  return (
                    <>
                      {displayName || selectedPrivateChat.username}
                      {/* Only show verified badge if NO display-name (showing username directly) */}
                      {renderUserBadges(
                        selectedPrivateChat.username,
                        selectedPrivateChat,
                        user,
                        !displayName,
                      )}
                    </>
                  );
                })()}
              </h2>
              {(() => {
                const userMetadata = getUserMetadata(
                  selectedPrivateChat.username,
                );
                const displayName = userMetadata?.["display-name"]?.value;
                const user = getUserFromChannels(selectedPrivateChat.username);

                // Show username in badge if display-name exists
                if (displayName) {
                  return (
                    <div className="flex items-center gap-1.5 text-xs truncate mt-0.5">
                      <span className="bg-gray-300 text-black px-1 py-0 rounded font-bold whitespace-nowrap text-[10px]">
                        {selectedPrivateChat.username}
                        {renderUserBadges(
                          selectedPrivateChat.username,
                          selectedPrivateChat,
                          user,
                        )}
                      </span>
                    </div>
                  );
                }

                // Show status if no display-name (status was already shown above when display-name exists)
                return privateChatUserMetadata?.status?.value ? (
                  <span className="text-xs text-discord-text-muted">
                    {privateChatUserMetadata.status.value}
                  </span>
                ) : null;
              })()}
            </div>
            {/* Pin/Unpin button */}
            {selectedServerId && (
              <button
                className={`ml-2 ${
                  selectedPrivateChat.isPinned
                    ? "text-green-500 hover:text-green-400"
                    : "text-discord-text-muted hover:text-yellow-400"
                }`}
                onClick={() => {
                  if (selectedPrivateChat.isPinned) {
                    unpinPrivateChat(selectedServerId, selectedPrivateChat.id);
                  } else {
                    pinPrivateChat(selectedServerId, selectedPrivateChat.id);
                  }
                }}
                title={selectedPrivateChat.isPinned ? "Unpin" : "Pin"}
              >
                <FaThumbtack
                  className={
                    selectedPrivateChat.isPinned ? "" : "rotate-[25deg]"
                  }
                  style={
                    selectedPrivateChat.isPinned
                      ? {}
                      : { transform: "rotate(25deg)" }
                  }
                />
              </button>
            )}
            {/* User Info button */}
            {selectedServerId && (
              <button
                className="ml-2 text-discord-text-muted hover:text-white"
                onClick={() => setUserProfileModalOpen(true)}
                title="User Profile"
              >
                <FaInfoCircle />
              </button>
            )}
          </div>
        )}
        {selectedChannelId === "server-notices" && (
          <>
            <FaList className="text-discord-text-muted mr-2" />
            <h2 className="font-bold text-white mr-4">Server Notices</h2>
          </>
        )}
      </div>
      {!!selectedServerId && selectedChannelId !== "server-notices" && (
        <div className="flex items-center gap-2 md:gap-4 text-discord-text-muted flex-shrink-0">
          <button
            className="hover:text-discord-text-normal"
            onClick={onToggleNotificationVolume}
            title={
              globalSettings.notificationVolume > 0
                ? "Mute notifications"
                : "Enable notifications"
            }
          >
            {globalSettings.notificationVolume > 0 ? (
              <FaBell />
            ) : (
              <FaBellSlash />
            )}
          </button>
          {selectedChannel && (
            <button
              className="hover:text-discord-text-normal"
              onClick={onOpenChannelSettings}
              title="Channel Settings"
            >
              <FaPenAlt />
            </button>
          )}
          {selectedChannel && (
            <button
              className="hover:text-discord-text-normal"
              onClick={onOpenInviteUser}
              title="Invite User"
            >
              <FaUserPlus />
            </button>
          )}
          <button
            className="hover:text-discord-text-normal"
            onClick={() => openModal("channelList")}
            title="List Channels"
          >
            <FaList />
          </button>
          {selectedChannel && isOperator && (
            <button
              className="hover:text-discord-text-normal"
              onClick={() => openModal("channelRename")}
              title="Rename Channel"
            >
              <FaEdit />
            </button>
          )}
          {/* Only show member list toggle for channels, not private chats */}
          {selectedChannel && (
            <button
              className="hover:text-discord-text-normal"
              onClick={() => toggleMemberList(!isMemberListVisible)}
              aria-label={
                isMemberListVisible
                  ? "Collapse member list"
                  : "Expand member list"
              }
              data-testid="toggle-member-list"
            >
              {isMemberListVisible ? (
                <UsersIcon className="w-4 h-4 text-white" />
              ) : (
                <UsersIcon className="w-4 h-4 text-gray" />
              )}
            </button>
          )}
          <div className="relative">
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="bg-discord-dark-400 text-discord-text-muted text-sm rounded px-2 py-1 w-20 md:w-32 focus:outline-none focus:ring-1 focus:ring-discord-text-link"
            />
            <FaSearch className="absolute right-2 top-1.5 text-xs" />
          </div>
        </div>
      )}
      {selectedChannelId === "server-notices" && (
        <div className="flex items-center gap-4 text-discord-text-muted">
          {/* TODO: Re-enable pop out button for server notices
          <button
            className="hover:text-discord-text-normal"
            onClick={() =>
              setIsServerNoticesPoppedOut(!isServerNoticesPoppedOut)
            }
            title={
              isServerNoticesPoppedOut
                ? "Pop in server notices"
                : "Pop out server notices"
            }
          >
            <FaExternalLinkAlt />
          </button>
          */}
        </div>
      )}

      {/* User Profile Modal */}
      {userProfileModalOpen && selectedPrivateChat && selectedServerId && (
        <UserProfileModal
          isOpen={userProfileModalOpen}
          onClose={() => setUserProfileModalOpen(false)}
          serverId={selectedServerId}
          username={selectedPrivateChat.username}
        />
      )}
    </div>
  );
};
