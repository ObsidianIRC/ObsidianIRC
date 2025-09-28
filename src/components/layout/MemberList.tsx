import type React from "react";
import { useState } from "react";
import { FaChevronLeft } from "react-icons/fa";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import useStore from "../../store";
import type { User } from "../../types";
import UserContextMenu from "../ui/UserContextMenu";

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
  switch (status) {
    case "~":
      return 6; // owner
    case "&":
      return 5; // admin
    case "@":
      return 4; // chanop
    case "%":
      return 3; // halfop
    case "+":
      return 2; // voice
    default:
      return 1; // normal
  }
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
  return (
    <div
      className={`flex items-center py-2 px-3 mx-2 rounded ${
        currentUser?.username !== user.username
          ? "hover:bg-discord-dark-400 cursor-pointer"
          : "opacity-60"
      }`}
      onClick={(e) => {
        const avatarElement = e.currentTarget.querySelector(".w-10.h-10");
        onContextMenu(e, user.username, serverId, avatarElement);
      }}
    >
      <div className="w-10 h-10 rounded-full bg-discord-dark-400 flex items-center justify-center text-white text-lg font-bold">
        {user.username.charAt(0).toUpperCase()}
      </div>
      <span className="ml-3">{user.status || ""}{user.username}</span>
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

  // Sort users by status priority (descending), then alphabetically by username
  const sortedUsers = selectedChannel?.users
    .slice()
    .sort((a, b) => {
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
    if (currentUser?.username === username) {
      return;
    }

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
      />
    </div>
  );
};

export default MemberList;
