import type React from "react";
import ircClient from "../../lib/ircClient";
import { isUserVerified, mircToHtml } from "../../lib/ircUtils";
import useStore from "../../store";
import type { MessageType, User } from "../../types";
import { EnhancedLinkWrapper } from "../ui/LinkWrapper";
import {
  ActionMessage,
  DateSeparator,
  EventMessage,
  MessageActions,
  MessageAvatar,
  MessageHeader,
  MessageReactions,
  MessageReply,
  StandardReplyNotification,
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
  onRedactMessage?: (message: MessageType) => void;
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
  onRedactMessage,
}) => {
  const ircCurrentUser = ircClient.getCurrentUser(message.serverId);
  const isCurrentUser = ircCurrentUser?.username === message.userId;

  // Find the user for this message
  const messageUser = users.find(
    (user) => user.username === message.userId.split("-")[0],
  );
  const avatarUrl = messageUser?.metadata?.avatar?.value;
  const displayName = messageUser?.metadata?.["display-name"]?.value;
  const userColor = messageUser?.metadata?.color?.value;
  const userStatus = messageUser?.metadata?.status?.value;
  const isSystem = message.type === "system";
  const isBot =
    messageUser?.isBot ||
    messageUser?.metadata?.bot?.value === "true" ||
    message.tags?.bot === "";
  const isVerified = isUserVerified(message.userId, message.tags);

  // Check if message redaction is supported and possible
  const server = useStore
    .getState()
    .servers.find((s) => s.id === message.serverId);
  const canRedact =
    !isSystem &&
    isCurrentUser &&
    !!message.msgid &&
    !!server?.capabilities?.includes("draft/message-redaction") &&
    !!onRedactMessage;

  // Convert message content to React elements
  const htmlContent = mircToHtml(message.content);
  const theme = localStorage.getItem("theme") || "discord";
  const username = message.userId.split("-")[0];

  // Handle system messages
  if (isSystem) {
    return <SystemMessage message={message} onIrcLinkClick={onIrcLinkClick} />;
  }

  // Handle event messages (join, part, quit, nick)
  if (["join", "part", "quit", "nick"].includes(message.type)) {
    return (
      <>
        {showDate && (
          <DateSeparator date={new Date(message.timestamp)} theme={theme} />
        )}
        <EventMessage
          message={message}
          messageUser={messageUser}
          users={users}
          showDate={showDate}
          onUsernameContextMenu={onUsernameContextMenu}
        />
      </>
    );
  }

  // Handle standard reply messages
  if (message.type === "standard-reply") {
    // Ensure all required standard reply properties are present
    if (
      message.standardReplyType &&
      message.standardReplyCommand &&
      message.standardReplyCode &&
      message.standardReplyMessage
    ) {
      return (
        <>
          {showDate && (
            <DateSeparator date={new Date(message.timestamp)} theme={theme} />
          )}
          <StandardReplyNotification
            type={message.standardReplyType}
            command={message.standardReplyCommand}
            code={message.standardReplyCode}
            message={message.standardReplyMessage}
            target={message.standardReplyTarget}
            timestamp={new Date(message.timestamp)}
            onIrcLinkClick={onIrcLinkClick}
          />
        </>
      );
    }
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
    message.userId !== "system" && ircCurrentUser?.username !== username;

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
              isBot={isBot}
              isVerified={isVerified}
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
            currentUserUsername={ircCurrentUser?.username}
            onReactionClick={handleReactionClick}
          />
        </div>

        <MessageActions
          message={message}
          onReplyClick={() => setReplyTo(message)}
          onReactClick={(buttonElement) => onReactClick(message, buttonElement)}
          onRedactClick={
            canRedact ? () => onRedactMessage?.(message) : undefined
          }
          canRedact={canRedact}
        />
      </div>
    </div>
  );
};
