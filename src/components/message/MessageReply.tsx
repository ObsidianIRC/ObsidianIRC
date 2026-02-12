import type React from "react";
import { processMarkdownInText } from "../../lib/ircUtils";
import type { MessageType } from "../../types";
import { EnhancedLinkWrapper } from "../ui/LinkWrapper";

interface MessageReplyProps {
  replyMessage: MessageType;
  theme: string;
  onUsernameClick?: (e: React.MouseEvent) => void;
  onIrcLinkClick?: (url: string) => void;
  onReplyClick?: () => void;
}

export const MessageReply: React.FC<MessageReplyProps> = ({
  replyMessage,
  theme,
  onUsernameClick,
  onIrcLinkClick,
  onReplyClick,
}) => {
  const replyUsername = replyMessage.userId.split("-")[0];

  const handleUsernameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUsernameClick?.(e);
  };

  return (
    <div
      className={`bg-${theme}-dark-200 rounded text-sm text-${theme}-text-muted mb-2 pl-1 pr-2 select-none ${onReplyClick ? "cursor-pointer hover:bg-opacity-80" : ""}`}
      onClick={onReplyClick}
      title={onReplyClick ? "Click to jump to message" : ""}
    >
      ┌ Replying to{" "}
      <strong>
        <span className="cursor-pointer" onClick={handleUsernameClick}>
          {replyUsername}
        </span>
        :
      </strong>{" "}
      <EnhancedLinkWrapper onIrcLinkClick={onIrcLinkClick}>
        {processMarkdownInText(
          replyMessage.content,
          true,
          false,
          `reply-${replyMessage.id || replyMessage.msgid || "unknown"}`,
        )}
      </EnhancedLinkWrapper>
    </div>
  );
};
