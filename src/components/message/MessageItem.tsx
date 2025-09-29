import type React from "react";
import { mircToHtml } from "../../lib/ircUtils";
import useStore from "../../store";
import type { MessageType, User } from "../../types";
import { EnhancedLinkWrapper } from "../ui/LinkWrapper";
import {
  ActionMessage,
  DateSeparator,
  MessageActions,
  MessageAvatar,
  MessageHeader,
  MessageReactions,
  MessageReply,
  SystemMessage,
} from "./index";

interface MessageItemProps {
  message: MessageType;
  showDate: boolean;
  showHeader: boolean;
  setReplyTo: (msg: MessageType) => void;
  onUsernameContextMenu: (
    e: React.MouseEvent,
    username: string,
    serverId: string,
    avatarElement?: Element | null,
  ) => void;
  onIrcLinkClick?: (url: string) => void;
  onReactClick: (message: MessageType, buttonElement: Element) => void;
  selectedServerId: string | null;
  onReactionUnreact: (emoji: string, message: MessageType) => void;
  onOpenReactionModal: (
    message: MessageType,
    position: { x: number; y: number },
  ) => void;
  onDirectReaction: (emoji: string, message: MessageType) => void;
  users: User[];
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  showDate,
  showHeader,
  setReplyTo,
  onUsernameContextMenu,
  onIrcLinkClick,
  onReactClick,
  selectedServerId,
  onReactionUnreact,
  onOpenReactionModal,
  onDirectReaction,
  users,
}) => {
  const { currentUser } = useStore();
  const isCurrentUser = currentUser?.id === message.userId;

  // Find the user for this message
  const messageUser = users.find(
    (user) => user.username === message.userId.split("-")[0],
  );
  const avatarUrl = messageUser?.metadata?.avatar?.value;
  const displayName = messageUser?.metadata?.["display-name"]?.value;
  const userColor = messageUser?.metadata?.color?.value;
  const userStatus = messageUser?.metadata?.status?.value;
  const isSystem = message.type === "system";

  // Convert message content to React elements
  const htmlContent = mircToHtml(message.content);
  const theme = localStorage.getItem("theme") || "discord";
  const username = message.userId.split("-")[0];

  // Handle system messages
  if (isSystem) {
    return <SystemMessage message={message} onIrcLinkClick={onIrcLinkClick} />;
  }

  // Handle ACTION messages
  if (message.content.substring(0, 7) === "\u0001ACTION") {
    return (
      <>
        {showDate && (
          <DateSeparator date={new Date(message.timestamp)} theme={theme} />
        )}
        <ActionMessage
          message={message}
          showDate={showDate}
          messageUser={messageUser}
          onUsernameContextMenu={onUsernameContextMenu}
        />
      </>
    );
  }

  // Handle regular messages
  const handleReactionClick = (emoji: string, currentUserReacted: boolean) => {
    if (currentUserReacted) {
      onReactionUnreact(emoji, message);
    } else {
      onDirectReaction(emoji, message);
    }
  };

  const handleAvatarClick = (e: React.MouseEvent) => {
    if (message.userId !== "system") {
      onUsernameContextMenu(e, username, message.serverId, e.currentTarget);
    }
  };

  const handleUsernameClick = (e: React.MouseEvent) => {
    if (message.userId !== "system") {
      // Find the avatar element to position menu over it
      const messageElement = e.currentTarget.closest(".flex");
      const avatarElement = messageElement?.querySelector(".mr-4");
      onUsernameContextMenu(e, username, message.serverId, avatarElement);
    }
  };

  const handleReplyUsernameClick = (e: React.MouseEvent) => {
    if (message.replyMessage) {
      // Find the avatar element to position menu over it
      const messageElement = e.currentTarget.closest(".flex");
      const avatarElement = messageElement?.querySelector(".mr-4");
      onUsernameContextMenu(
        e,
        message.replyMessage.userId.split("-")[0],
        message.serverId,
        avatarElement,
      );
    }
  };

  const isClickable =
    message.userId !== "system" && currentUser?.username !== username;

  return (
    <div className={`px-4 py-1 hover:bg-${theme}-message-hover group relative`}>
      {showDate && (
        <DateSeparator date={new Date(message.timestamp)} theme={theme} />
      )}

      <div className="flex">
        <MessageAvatar
          userId={message.userId}
          avatarUrl={avatarUrl}
          userStatus={userStatus}
          theme={theme}
          showHeader={showHeader}
          onClick={handleAvatarClick}
          isClickable={isClickable}
        />

        <div className={`flex-1 relative ${isCurrentUser ? "text-white" : ""}`}>
          {showHeader && (
            <MessageHeader
              userId={message.userId}
              displayName={displayName}
              userColor={userColor}
              timestamp={new Date(message.timestamp)}
              theme={theme}
              isClickable={isClickable}
              onClick={handleUsernameClick}
            />
          )}

          <div className="relative">
            {message.replyMessage && (
              <MessageReply
                replyMessage={message.replyMessage}
                theme={theme}
                onUsernameClick={handleReplyUsernameClick}
                onIrcLinkClick={onIrcLinkClick}
              />
            )}

            <EnhancedLinkWrapper onIrcLinkClick={onIrcLinkClick}>
              {htmlContent}
            </EnhancedLinkWrapper>
          </div>

          <MessageReactions
            reactions={message.reactions}
            currentUserUsername={currentUser?.username}
            onReactionClick={handleReactionClick}
          />
        </div>

        <MessageActions
          message={message}
          onReplyClick={() => setReplyTo(message)}
          onReactClick={(buttonElement) => onReactClick(message, buttonElement)}
        />
      </div>
    </div>
  );
};
