import type React from "react";
import { FaReply, FaTrash } from "react-icons/fa";
import { MdAddReaction } from "react-icons/md";
import type { MessageType } from "../../types";

interface MessageActionsProps {
  message: MessageType;
  onReplyClick: () => void;
  onReactClick: (buttonElement: Element) => void;
  onRedactClick?: () => void;
  canRedact?: boolean;
  canReply?: boolean;
  inline?: boolean;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  message,
  onReplyClick,
  onReactClick,
  onRedactClick,
  canRedact = false,
  canReply = !!message.msgid,
  inline = false,
}) => {
  return (
    <div
      className={`opacity-0 message-actions-container flex items-center bg-discord-dark-300 border border-white/10 rounded-lg shadow-xl divide-x divide-white/10 select-none z-10 ${
        inline ? "flex-shrink-0 self-end" : "absolute bottom-1 right-4"
      }`}
    >
      {canRedact && onRedactClick && (
        <button
          type="button"
          className="px-2.5 py-1.5 text-red-400/70 hover:text-red-400 hover:bg-red-500/15 transition-colors first:rounded-l-lg last:rounded-r-lg"
          onClick={onRedactClick}
          title="Delete message"
        >
          <FaTrash className="w-4 h-4" />
        </button>
      )}
      {canReply && (
        <button
          type="button"
          className="px-2.5 py-1.5 text-discord-reply/70 hover:text-discord-reply hover:bg-white/10 transition-colors first:rounded-l-lg last:rounded-r-lg"
          onClick={onReplyClick}
          title="Reply"
        >
          <FaReply className="w-4 h-4" />
        </button>
      )}
      {canReply && (
        <button
          type="button"
          className="px-2.5 py-1.5 text-discord-text-muted hover:text-discord-text-normal hover:bg-white/10 transition-colors first:rounded-l-lg last:rounded-r-lg"
          onClick={(e) => onReactClick(e.currentTarget)}
          title="Add reaction"
        >
          <MdAddReaction className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
