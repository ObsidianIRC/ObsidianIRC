import type React from "react";
import { getColorStyle } from "../../lib/ircUtils";

interface MessageHeaderProps {
  userId: string;
  displayName?: string;
  userColor?: string;
  timestamp: Date;
  theme: string;
  isClickable?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export const MessageHeader: React.FC<MessageHeaderProps> = ({
  userId,
  displayName,
  userColor,
  timestamp,
  theme,
  isClickable = false,
  onClick,
}) => {
  const username = userId.split("-")[0];
  const isSystem = userId === "system";

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div className="flex items-center">
      <span
        className={`font-bold text-white ${isClickable ? "cursor-pointer" : ""}`}
        style={getColorStyle(userColor)}
        onClick={onClick}
      >
        {isSystem ? "System" : displayName || username}
        {displayName && (
          <span className="ml-2 text-xs bg-discord-dark-600 px-1 py-0.5 rounded">
            {username}
          </span>
        )}
      </span>
      <span className={`ml-2 text-xs text-${theme}-text-muted`}>
        {formatTime(timestamp)}
      </span>
    </div>
  );
};
