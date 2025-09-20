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
}

export const UserContextMenu: React.FC<UserContextMenuProps> = ({
  isOpen,
  x,
  y,
  username,
  serverId,
  onClose,
  onOpenPM,
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
      </div>
    </div>
  );
};

export default UserContextMenu;
