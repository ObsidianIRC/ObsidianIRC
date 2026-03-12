import type React from "react";
import { FaTimes } from "react-icons/fa";
import { RiReplyFill } from "react-icons/ri";
import { stripIrcFormatting } from "../../lib/messageFormatter";
import type { MessageType } from "../../types";

interface MessageReplyProps {
  replyMessage: MessageType;
  theme: string;
  onUsernameClick?: (e: React.MouseEvent) => void;
  onIrcLinkClick?: (url: string) => void;
  onReplyClick?: () => void;
  onClose?: () => void;
}

export const MessageReply: React.FC<MessageReplyProps> = ({
  replyMessage,
  theme,
  onUsernameClick,
  onReplyClick,
  onClose,
}) => {
  const replyUsername = replyMessage.userId;

  const handleUsernameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUsernameClick?.(e);
  };

  const plainContent = stripIrcFormatting(replyMessage.content)
    .replace(/\n+/g, " ")
    .trim();

  const isClickable = !!onReplyClick && !onClose;

  return (
    <div
      className={`flex min-w-0 w-full overflow-hidden bg-black/[0.22] transition-colors
        ${
          onClose
            ? "border-b border-white/[0.06]"
            : "mb-2 rounded-md border border-white/[0.04]"
        }
        ${isClickable ? "cursor-pointer hover:bg-black/[0.32]" : ""}`}
      onClick={isClickable ? onReplyClick : undefined}
      title={isClickable ? "Click to jump to message" : ""}
    >
      <div className="w-0.5 flex-shrink-0 bg-discord-reply/70 rounded-l" />
      <div className="flex-1 min-w-0 py-1.5 px-2.5 overflow-hidden">
        <div className="flex items-center gap-1.5 mb-0.5">
          <RiReplyFill className="text-[11px] flex-shrink-0 text-discord-reply/70" />
          <span
            className="text-xs font-semibold text-discord-reply hover:underline cursor-pointer truncate"
            onClick={handleUsernameClick}
          >
            {replyUsername}
          </span>
        </div>
        <div
          className={`text-xs text-${theme}-text-muted opacity-80 ${onClose ? "line-clamp-3" : "truncate"}`}
        >
          {plainContent}
        </div>
      </div>
      {onClose && (
        <button
          type="button"
          className="flex-shrink-0 self-center p-3 mr-1 rounded-lg hover:bg-white/10 text-discord-text-muted hover:text-discord-text-normal transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Cancel reply"
        >
          <FaTimes className="text-base" />
        </button>
      )}
    </div>
  );
};
