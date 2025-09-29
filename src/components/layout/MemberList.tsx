import type React from "react";
import { useState } from "react";
import { FaChevronLeft } from "react-icons/fa";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import useStore from "../../store";
import type { User } from "../../types";
import UserContextMenu from "../ui/UserContextMenu";
import { getColorStyle } from "../../lib/ircUtils";

const StatusIndicator: React.FC<{ status?: string }> = ({ status }) => {
  let bgColor = "bg-discord-dark-500"; // Default/offline

  if (status === "online") {
    bgColor = "bg-discord-green";
  } else if (status === "idle") {
    bgColor = "bg-discord-yellow";
  } else if (status === "dnd") {
    bgColor = "bg-discord-red";
  }

  return <div className={`w-3 h-3 rounded-full ${bgColor}`} />;
};

const getStatusPriority = (status?: string): number => {
  if (!status) return 1;
  let maxPriority = 1;
  for (const char of status) {
    let priority = 1;
    switch (char) {
      case "~":
        priority = 6; // owner
        break;
      case "&":
        priority = 5; // admin
        break;
      case "@":
        priority = 4; // chanop
        break;
      case "%":
        priority = 3; // halfop
        break;
      case "+":
        priority = 2; // voice
        break;
    }
    if (priority > maxPriority) maxPriority = priority;
  }
  return maxPriority;
};

const UserItem: React.FC<{
  user: User;
  serverId: string;
  currentUser: User | null;
  onContextMenu: (
    e: React.MouseEvent,
    username: string,
    serverId: string,
    avatarElement?: Element | null,
  ) => void;
}> = ({ user, serverId, currentUser, onContextMenu }) => {
  // Display metadata like website or status
  const website = user.metadata?.url?.value || user.metadata?.website?.value;
  const status = user.metadata?.status?.value;
  const avatarUrl = user.metadata?.avatar?.value;
  const color = user.metadata?.color?.value;

  return (
    <div
      className={`flex items-center py-2 px-3 mx-2 rounded cursor-pointer ${
        currentUser?.username !== user.username
          ? "hover:bg-discord-dark-400"
          : "opacity-60 hover:bg-discord-dark-400"
      }`}
      onClick={(e) => {
        const avatarElement = e.currentTarget.querySelector(".w-10.h-10");
        onContextMenu(e, user.username, serverId, avatarElement);
      }}
    >
      <div className="w-10 h-10 rounded-full bg-discord-dark-400 flex items-center justify-center text-white text-lg font-bold relative">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={user.username}
            className="w-10 h-10 rounded-full object-cover"
            onError={(e) => {
              // Fallback to initial if image fails to load
              e.currentTarget.style.display = "none";
              const parent = e.currentTarget.parentElement;
              if (parent) {
                parent.textContent = user.username.charAt(0).toUpperCase();
              }
            }}
          />
        ) : (
          user.username.charAt(0).toUpperCase()
        )}
        {status && (
          <div className="absolute -bottom-1 -left-1 bg-discord-dark-600 rounded-full p-1 group">
            <div className="w-3 h-3 bg-yellow-400 rounded-full flex items-center justify-center">
              <span className="text-xs">💡</span>
            </div>
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block">
              <div className="bg-discord-dark-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                {status}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="ml-3 flex-1 min-w-0">
        <div className="flex items-center">
          {user.status && (
            <span className="inline-block bg-discord-dark-600 text-white px-1 rounded text-xs mr-1">
              {user.status}
            </span>
          )}
          <span className="truncate" style={getColorStyle(color)}>{user.username}</span>
        </div>
        {status && (
          <div className="text-xs text-discord-text-muted truncate">
            {status}
          </div>
        )}
        {website && (
          <div className="text-xs text-discord-text-muted truncate">
            🌐 {website}
          </div>
        )}
      </div>
    </div>
  );
};

export const MemberList: React.FC = () => {
  const {
    servers,
    ui: { selectedServerId, selectedChannelId },
    currentUser,
    toggleMemberList,
    openPrivateChat,
    kickUser,
    banUser,
  } = useStore();

  const [userContextMenu, setUserContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    username: string;
    serverId: string;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    username: "",
    serverId: "",
  });

  const selectedServer = servers.find(
    (server) => server.id === selectedServerId,
  );
  const selectedChannel = selectedServer?.channels.find(
    (channel) => channel.id === selectedChannelId,
  );

  // Get current user's status in the channel
  const currentUserInChannel = selectedChannel?.users.find(
    (user) => user.username === currentUser?.username,
  );
  const currentUserStatus = currentUserInChannel?.status;

  // Sort users by status priority (descending), then alphabetically by username
  const sortedUsers = selectedChannel?.users.slice().sort((a, b) => {
    const priorityA = getStatusPriority(a.status);
    const priorityB = getStatusPriority(b.status);
    if (priorityA !== priorityB) {
      return priorityB - priorityA; // Higher priority first
    }
    return a.username.localeCompare(b.username);
  });

  const handleUsernameClick = (
    e: React.MouseEvent,
    username: string,
    serverId: string,
    avatarElement?: Element | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    // Don't show context menu for own username
    // if (currentUser?.username === username) {
    //   return;
    // }

    let x = e.clientX;
    let y = e.clientY;

    // If avatar element is provided, position menu relative to it
    if (avatarElement) {
      const rect = avatarElement.getBoundingClientRect();
      x = rect.left;
      y = rect.top - 5; // Position above the avatar with small gap
    }

    setUserContextMenu({
      isOpen: true,
      x,
      y,
      username,
      serverId,
    });
  };

  const handleCloseUserContextMenu = () => {
    setUserContextMenu({
      isOpen: false,
      x: 0,
      y: 0,
      username: "",
      serverId: "",
    });
  };

  const handleOpenPM = (username: string) => {
    if (selectedServerId) {
      openPrivateChat(selectedServerId, username);
    }
  };

  const isMobileView = useMediaQuery();
  return (
    <div className="p-3 h-full overflow-y-auto">
      {isMobileView && (
        <button
          onClick={() => toggleMemberList(false)}
          className="text-discord-channels-default hover:text-white mb-5"
        >
          <FaChevronLeft />
        </button>
      )}
      <h3 className="text-xs font-semibold text-discord-channels-default uppercase mb-2 px-2">
        Members — {sortedUsers?.length || 0}
      </h3>
      {sortedUsers?.map((user) => (
        <UserItem
          key={user.id}
          user={user}
          serverId={selectedServerId || ""}
          currentUser={currentUser}
          onContextMenu={handleUsernameClick}
        />
      ))}

      <UserContextMenu
        isOpen={userContextMenu.isOpen}
        x={userContextMenu.x}
        y={userContextMenu.y}
        username={userContextMenu.username}
        serverId={userContextMenu.serverId}
        onClose={handleCloseUserContextMenu}
        onOpenPM={handleOpenPM}
        currentUserStatus={currentUserStatus}
        currentUsername={currentUser?.username}
        onKickUser={(username, reason) => {
          if (selectedServerId && selectedChannel?.name) {
            kickUser(selectedServerId, selectedChannel.name, username, reason);
          }
        }}
        onBanUser={(username, reason) => {
          if (selectedServerId && selectedChannel?.name) {
            banUser(selectedServerId, selectedChannel.name, username, reason);
          }
        }}
      />
    </div>
  );
};

export default MemberList;
