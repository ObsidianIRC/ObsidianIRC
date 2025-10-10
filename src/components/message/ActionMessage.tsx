import type React from "react";
import type { MessageType, User } from "../../types";
import { MessageAvatar } from "./MessageAvatar";

interface ActionMessageProps {
  message: MessageType;
  showDate: boolean;
  messageUser?: User;
  onUsernameContextMenu: (
    e: React.MouseEvent,
    username: string,
    serverId: string,
    channelId: string,
    avatarElement?: Element | null,
  ) => void;
}

export const ActionMessage: React.FC<ActionMessageProps> = ({
  message,
  showDate,
  messageUser,
  onUsernameContextMenu,
}) => {
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  const displayName = messageUser?.metadata?.["display-name"]?.value;
  const username = message.userId.split("-")[0];

  return (
    <div className="px-4 py-1 hover:bg-discord-message-hover group">
      {showDate && (
        <div className="flex items-center text-xs text-discord-text-muted mb-2">
          <div className="flex-grow border-t border-discord-dark-400" />
          <div className="px-2">{formatDate(new Date(message.timestamp))}</div>
          <div className="flex-grow border-t border-discord-dark-400" />
        </div>
      )}
      <div className="flex">
        <MessageAvatar
          userId={message.userId}
          avatarUrl={messageUser?.metadata?.avatar?.value}
          userStatus={messageUser?.metadata?.status?.value}
          isAway={messageUser?.isAway}
          theme="discord"
          showHeader={true}
          onClick={(e) => {
            onUsernameContextMenu(
              e,
              username,
              message.serverId,
              message.channelId,
              e.currentTarget,
            );
          }}
          isClickable={true}
        />
        <div className="flex-1 text-white">
          <div className="flex items-center">
            <span className="ml-2 text-xs text-discord-text-muted">
              {formatTime(new Date(message.timestamp))}
            </span>
          </div>
          <span className="italic text-white">
            {message.userId === "system"
              ? "System"
              : (displayName || username) +
                (displayName ? ` (${username})` : "") +
                message.content.substring(7, message.content.length - 1)}
          </span>
        </div>
      </div>
    </div>
  );
};
