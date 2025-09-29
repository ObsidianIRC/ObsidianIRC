import type React from "react";
import { mircToHtml } from "../../lib/ircUtils";
import type { MessageType } from "../../types";
import { EnhancedLinkWrapper } from "../ui/LinkWrapper";

interface MessageReplyProps {
  replyMessage: MessageType;
  theme: string;
  onUsernameClick?: (e: React.MouseEvent) => void;
  onIrcLinkClick?: (url: string) => void;
}

export const MessageReply: React.FC<MessageReplyProps> = ({
  replyMessage,
  theme,
  onUsernameClick,
  onIrcLinkClick,
}) => {
  const replyUsername = replyMessage.userId.split("-")[0];

  return (
    <div
      className={`bg-${theme}-dark-200 rounded text-sm text-${theme}-text-muted mb-2 pl-1 pr-2`}
    >
      ┌ Replying to{" "}
      <strong>
        <span className="cursor-pointer" onClick={onUsernameClick}>
          {replyUsername}
        </span>
        :
      </strong>{" "}
      <EnhancedLinkWrapper onIrcLinkClick={onIrcLinkClick}>
        {mircToHtml(replyMessage.content)}
      </EnhancedLinkWrapper>
    </div>
  );
};
