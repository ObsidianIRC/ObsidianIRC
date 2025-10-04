import type React from "react";
import { useEffect, useRef } from "react";
import { createIgnorePattern, isUserIgnored } from "../../lib/ignoreUtils";
import useStore from "../../store";

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

  // Get user metadata
  const servers = useStore((state) => state.servers);
  const server = servers.find((s) => s.id === serverId);
  const user =
    server?.channels
      .flatMap((c) => c.users)
      .find((u) => u.username === username) ||
    server?.users.find((u) => u.username === username);

  const website = user?.metadata?.url?.value || user?.metadata?.website?.value;
  const status = user?.metadata?.status?.value;

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

  // Ignore list functionality
  const globalSettings = useStore((state) => state.globalSettings);
  const addToIgnoreList = useStore((state) => state.addToIgnoreList);
  const removeFromIgnoreList = useStore((state) => state.removeFromIgnoreList);

  const isIgnored = isUserIgnored(
    username,
    undefined,
    undefined,
    globalSettings.ignoreList,
  );

  const handleIgnoreUser = () => {
    const pattern = createIgnorePattern(username);
    addToIgnoreList(pattern);
    onClose();
  };

  const handleUnignoreUser = () => {
    // Find and remove any patterns that match this user
    const matchingPatterns = globalSettings.ignoreList.filter((pattern) =>
      isUserIgnored(username, undefined, undefined, [pattern]),
    );

    matchingPatterns.forEach((pattern) => {
      removeFromIgnoreList(pattern);
    });
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
          {status && (
            <div className="text-xs text-discord-text-normal normal-case mt-1">
              {status}
            </div>
          )}
          {website && (
            <div className="text-xs text-discord-text-normal normal-case mt-1">
              🌐 {website}
            </div>
          )}
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
        {!isOwnUser && (
          <button
            onClick={isIgnored ? handleUnignoreUser : handleIgnoreUser}
            className={`w-full px-3 py-2 text-left transition-colors duration-150 flex items-center gap-2 ${
              isIgnored
                ? "text-green-400 hover:bg-discord-dark-200 hover:text-green-300"
                : "text-red-400 hover:bg-discord-dark-200 hover:text-red-300"
            }`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isIgnored ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728"
                />
              )}
            </svg>
            {isIgnored ? "Unignore User" : "Ignore User"}
          </button>
        )}
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
