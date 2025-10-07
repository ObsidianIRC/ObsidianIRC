import type React from "react";
import { FaArrowDown } from "react-icons/fa";

interface ScrollToBottomButtonProps {
  isVisible: boolean;
  onClick: () => void;
  unreadCount?: number;
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({
  isVisible,
  onClick,
  unreadCount,
}) => {
  if (!isVisible) return null;

  return (
    <div className="relative bottom-10 z-50">
      <div className="absolute right-4">
        <button
          onClick={onClick}
          className="bg-discord-dark-400 hover:bg-discord-dark-300 text-white rounded-full p-2 shadow-lg transition-all relative"
          aria-label="Scroll to bottom"
        >
          <FaArrowDown className="text-white" />
          {unreadCount && unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-discord-accent text-white text-xs font-bold rounded-full h-5 min-w-5 flex items-center justify-center px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
