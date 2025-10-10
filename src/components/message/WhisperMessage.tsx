import type React from "react";
import { mircToHtml } from "../../lib/ircUtils";
import type { MessageType, User } from "../../types";
import { EnhancedLinkWrapper } from "../ui/LinkWrapper";
import { MessageActions } from "./MessageActions";
import { MessageAvatar } from "./MessageAvatar";
import { MessageHeader } from "./MessageHeader";
import { MessageReactions } from "./MessageReactions";

interface WhisperMessageProps {
  message: MessageType;
  showDate: boolean;
  showHeader: boolean;
  messageUser?: User;
  setReplyTo: (msg: MessageType) => void;
  onUsernameContextMenu: (
    e: React.MouseEvent,
    username: string,
    serverId: string,
    channelId: string,
    avatarElement?: Element | null,
  ) => void;
  onIrcLinkClick?: (url: string) => void;
  onReactClick: (message: MessageType, buttonElement: Element) => void;
  onReactionUnreact: (emoji: string, message: MessageType) => void;
  onDirectReaction: (emoji: string, message: MessageType) => void;
  onRedactMessage?: (message: MessageType) => void;
  canRedact: boolean;
  ircCurrentUser?: { username: string };
}

export const WhisperMessage: React.FC<WhisperMessageProps> = ({
  message,
  showHeader,
  messageUser,
  setReplyTo,
  onUsernameContextMenu,
  onIrcLinkClick,
  onReactClick,
  onReactionUnreact,
  onDirectReaction,
  onRedactMessage,
  canRedact,
  ircCurrentUser,
}) => {
  const username = message.userId.split("-")[0];
  const avatarUrl = messageUser?.metadata?.avatar?.value;
  const displayName = messageUser?.metadata?.["display-name"]?.value;
  const userColor = messageUser?.metadata?.color?.value;
  const userStatus = messageUser?.metadata?.status?.value;
  const isBot =
    messageUser?.isBot ||
    messageUser?.metadata?.bot?.value === "true" ||
    message.tags?.bot === "";

  const theme = localStorage.getItem("theme") || "discord";
  const htmlContent = mircToHtml(message.content);

  const handleReactionClick = (emoji: string, currentUserReacted: boolean) => {
    if (currentUserReacted) {
      onReactionUnreact(emoji, message);
    } else {
      onDirectReaction(emoji, message);
    }
  };

  const handleAvatarClick = (e: React.MouseEvent) => {
    if (message.userId !== "system") {
      onUsernameContextMenu(
        e,
        username,
        message.serverId,
        message.channelId,
        e.currentTarget,
      );
    }
  };

  const handleUsernameClick = (e: React.MouseEvent) => {
    if (message.userId !== "system") {
      const messageElement = e.currentTarget.closest(".flex");
      const avatarElement = messageElement?.querySelector(".mr-4");
      onUsernameContextMenu(
        e,
        username,
        message.serverId,
        message.channelId,
        avatarElement,
      );
    }
  };

  const isClickable =
    message.userId !== "system" && ircCurrentUser?.username !== username;

  // Determine who is sending and who is receiving
  const sender = username;
  const recipient = message.whisperTarget || "unknown";
  const isOutgoing = ircCurrentUser?.username === sender;

  return (
    <div data-message-id={message.id} className="px-4 py-1 group relative">
      {/* Whisper container with special styling */}
      <div className="border-l-4 border-purple-500 bg-purple-950/20 rounded-r-lg px-3 py-2">
        {/* Whisper label with sender and recipient */}
        <div className="text-xs text-purple-400 font-semibold mb-1 flex items-center gap-2">
          <span>🔒</span>
          <span>WHISPER</span>
          <span className="text-purple-300 font-normal">
            {isOutgoing ? (
              <>
                from <span className="font-semibold">{sender}</span> to{" "}
                <span className="font-semibold">{recipient}</span>
              </>
            ) : (
              <>
                from <span className="font-semibold">{sender}</span> to{" "}
                <span className="font-semibold">{recipient}</span>
              </>
            )}
          </span>
        </div>

        <div className="flex">
          <MessageAvatar
            userId={message.userId}
            avatarUrl={avatarUrl}
            userStatus={userStatus}
            isAway={messageUser?.isAway}
            theme={theme}
            showHeader={showHeader}
            onClick={handleAvatarClick}
            isClickable={isClickable}
          />

          <div className="flex-1 relative">
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
                isVerified={false}
              />
            )}

            <div className="relative">
              <EnhancedLinkWrapper onIrcLinkClick={onIrcLinkClick}>
                <div style={{ whiteSpace: "pre-wrap" }}>{htmlContent}</div>
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
            onReactClick={(buttonElement) =>
              onReactClick(message, buttonElement)
            }
            onRedactClick={
              canRedact ? () => onRedactMessage?.(message) : undefined
            }
            canRedact={canRedact}
          />
        </div>
      </div>
    </div>
  );
};
