import type React from "react";
import { useEffect, useRef } from "react";

interface UserContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  username: string;
  serverId: string;
  onClose: () => void;
  onOpenPM: (username: string) => void;
  currentUserStatus?: string;
  currentUsername?: string;
  onKickUser?: (username: string, reason: string) => void;
  onBanUser?: (username: string, reason: string) => void;
}

export const UserContextMenu: React.FC<UserContextMenuProps> = ({
  isOpen,
  x,
  y,
  username,
  serverId,
  onClose,
  onOpenPM,
  currentUserStatus,
  currentUsername,
  onKickUser,
  onBanUser,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  const handleOpenPM = () => {
    onOpenPM(username);
    onClose();
  };

  const handleKickUser = () => {
    const reason = window.prompt("Kick reason:", "Requested by user");
    if (reason !== null && onKickUser) {
      onKickUser(username, reason);
    }
    onClose();
  };

  const handleBanUser = () => {
    const reason = window.prompt("Ban reason:", "Requested by user");
    if (reason !== null && onBanUser) {
      onBanUser(username, reason);
    }
    onClose();
  };

  const getStatusPriority = (status?: string): number => {
    if (!status) return 1;
    let maxPriority = 1;
    for (const char of status) {
      let priority = 1;
      switch (char) {
        case "~":
          priority = 6;
          break;
        case "&":
          priority = 5;
          break;
        case "@":
          priority = 4;
          break;
        case "%":
          priority = 3;
          break;
        case "+":
          priority = 2;
          break;
      }
      if (priority > maxPriority) maxPriority = priority;
    }
    return maxPriority;
  };

  const canModerate = getStatusPriority(currentUserStatus) >= 3; // halfop or higher
  const isOwnUser = username === currentUsername;

  if (!isOpen) return null;

  // Adjust position to prevent menu from going off-screen
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 100);

  return (
    <div
      ref={menuRef}
      className="fixed z-[10000] bg-discord-dark-300 border border-discord-dark-500 rounded-md shadow-xl min-w-[160px]"
      style={{
        left: adjustedX,
        top: adjustedY,
      }}
    >
      <div className="py-1">
        <div className="px-3 py-2 text-xs text-discord-text-muted font-semibold uppercase tracking-wide border-b border-discord-dark-500 mb-1">
          {username}
        </div>
        <button
          onClick={handleOpenPM}
          className="w-full px-3 py-2 text-left text-discord-text-normal hover:bg-discord-dark-200 hover:text-white transition-colors duration-150 flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          Send Message
        </button>
        {canModerate && !isOwnUser && (
          <>
            <button
              onClick={handleKickUser}
              className="w-full px-3 py-2 text-left text-discord-text-normal hover:bg-discord-dark-200 hover:text-white transition-colors duration-150 flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
              Kick User
            </button>
            <button
              onClick={handleBanUser}
              className="w-full px-3 py-2 text-left text-discord-text-normal hover:bg-discord-dark-200 hover:text-white transition-colors duration-150 flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Ban User
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default UserContextMenu;
