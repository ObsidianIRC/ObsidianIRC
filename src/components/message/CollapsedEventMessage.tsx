import type React from "react";
import { useState } from "react";
import {
  type EventGroup,
  getEventGroupSummary,
  getEventGroupTooltip,
} from "../../lib/eventGrouping";
import ircClient from "../../lib/ircClient";
import type { User } from "../../types";

interface CollapsedEventMessageProps {
  eventGroup: EventGroup;
  users: User[];
  onUsernameContextMenu: (
    e: React.MouseEvent,
    username: string,
    serverId: string,
    avatarElement?: Element | null,
  ) => void;
}

export const CollapsedEventMessage: React.FC<CollapsedEventMessageProps> = ({
  eventGroup,
  users,
  onUsernameContextMenu,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());
  const serverId = eventGroup.messages[0]?.serverId || "";
  const ircCurrentUser = ircClient.getCurrentUser(serverId);

  if (eventGroup.type !== "eventGroup" || !eventGroup.usernames) {
    return null;
  }

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const handleMouseEnter = () => {
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  const summary = getEventGroupSummary(eventGroup, ircCurrentUser?.username);
  const tooltip = getEventGroupTooltip(eventGroup);
  const uniqueUsernames: string[] = Array.from(new Set(eventGroup.usernames));

  return (
    <div
      className="group relative flex items-center px-4 py-1 hover:bg-discord-dark-500 transition-colors duration-75"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Stacked small avatars - only the hovered one expands */}
      <div className="flex-shrink-0 mr-3 flex items-center">
        <div className="flex -space-x-1">
          {uniqueUsernames.slice(0, 3).map((username, index) => {
            const user = users.find((u) => u.username === username);
            const handleAvatarClick = (e: React.MouseEvent) => {
              onUsernameContextMenu(e, username, serverId, e.currentTarget);
            };

            return (
              <div
                key={username}
                className="w-3 h-3 bg-black border border-discord-dark-200 rounded-full flex items-center justify-center text-white text-xs cursor-pointer hover:opacity-80 overflow-hidden transform transition-all duration-200 hover:w-8 hover:h-8 hover:text-base relative hover:z-20"
                style={{ zIndex: 10 - index }}
                onClick={handleAvatarClick}
              >
                {user?.metadata?.avatar?.value &&
                !failedAvatars.has(username) ? (
                  <img
                    src={user.metadata.avatar.value}
                    alt={username}
                    className="w-3 h-3 rounded-full object-cover hover:w-8 hover:h-8 transition-all duration-200"
                    onError={() => {
                      setFailedAvatars((prev) => new Set(prev).add(username));
                    }}
                  />
                ) : (
                  username.charAt(0).toUpperCase()
                )}
              </div>
            );
          })}

          {/* Show "+X more" indicator if there are more than 3 users */}
          {uniqueUsernames.length > 3 && (
            <div className="w-3 h-3 bg-discord-dark-400 border border-discord-dark-200 rounded-full flex items-center justify-center text-xs text-discord-text-muted font-medium hover:w-8 hover:h-8 hover:text-base transition-all duration-200 relative hover:z-20">
              +{uniqueUsernames.length - 3}
            </div>
          )}
        </div>
      </div>

      {/* Event summary */}
      <div className="flex-1 min-w-0">
        <span className="text-sm italic text-discord-text-muted">
          {summary}
        </span>
      </div>

      {/* Timestamp - only show on hover */}
      <div className="opacity-0 group-hover:opacity-70 transition-opacity text-xs text-discord-text-muted ml-2">
        {formatTime(eventGroup.timestamp)}
      </div>

      {/* Detailed tooltip */}
      {showTooltip && tooltip && (
        <div className="absolute bottom-full left-12 mb-1 px-2 py-1 bg-discord-dark-100 text-white text-xs rounded shadow-lg z-20 whitespace-pre-line">
          {tooltip}
        </div>
      )}
    </div>
  );
};
