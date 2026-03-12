import type React from "react";
import { RiReplyFill } from "react-icons/ri";
import { stripIrcFormatting } from "../../lib/messageFormatter";
import type { MessageType } from "../../types";

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
  onReplyClick,
}) => {
  const replyUsername = replyMessage.userId;

  const handleUsernameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUsernameClick?.(e);
  };

  const plainContent = stripIrcFormatting(replyMessage.content)
    .replace(/\n+/g, " ")
    .trim();

  return (
    <div
      className={`flex mb-2 min-w-0 w-full rounded-md overflow-hidden bg-black/[0.22] border border-white/[0.04] transition-colors ${onReplyClick ? "cursor-pointer hover:bg-black/[0.32]" : ""}`}
      onClick={onReplyClick}
      title={onReplyClick ? "Click to jump to message" : ""}
    >
      <div className="w-0.5 flex-shrink-0 bg-indigo-400/70 rounded-l" />
      <div className="flex-1 min-w-0 py-1.5 px-2.5 overflow-hidden">
        <div className="flex items-center gap-1.5 mb-0.5">
          <RiReplyFill className="text-[11px] flex-shrink-0 text-indigo-400/70" />
          <span
            className="text-xs font-semibold text-indigo-300 hover:underline cursor-pointer truncate"
            onClick={handleUsernameClick}
          >
            {replyUsername}
          </span>
        </div>
        <div className={`text-xs text-${theme}-text-muted opacity-80 truncate`}>
          {plainContent}
        </div>
      </div>
    </div>
  );
};
