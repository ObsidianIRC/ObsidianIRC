import type React from "react";
import { FaGrinAlt, FaReply, FaTimes } from "react-icons/fa";
import type { MessageType } from "../../types";

interface MessageActionsProps {
  message: MessageType;
  onReplyClick: () => void;
  onReactClick: (buttonElement: Element) => void;
  onRedactClick?: () => void;
  canRedact?: boolean;
  canReply?: boolean;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  message,
  onReplyClick,
  onReactClick,
  onRedactClick,
  canRedact = false,
  canReply = !!message.msgid,
}) => {
  return (
    <div className="absolute top-full right-4 opacity-0 message-actions-container select-none z-50">
      <div className="flex items-center gap-2 bg-discord-dark-300/95 border border-white/[0.07] rounded-xl shadow-xl shadow-black/50 p-1">
        {canRedact && onRedactClick && (
          <button
            className="p-1.5 rounded-lg text-red-400/75 hover:bg-red-500/15 hover:text-red-300 transition-all duration-150"
            onClick={onRedactClick}
            title="Delete message"
          >
            <FaTimes size={12} />
          </button>
        )}
        {canReply && (
          <button
            className="p-1.5 rounded-lg text-gray-400/75 hover:bg-white/[0.08] hover:text-gray-200 transition-all duration-150"
            onClick={onReplyClick}
            title="Reply"
          >
            <FaReply size={12} />
          </button>
        )}
        {canReply && (
          <button
            className="p-1.5 rounded-lg text-gray-400/75 hover:bg-white/[0.08] hover:text-gray-200 transition-all duration-150"
            onClick={(e) => onReactClick(e.currentTarget)}
            title="React"
          >
            <FaGrinAlt size={12} />
          </button>
        )}
      </div>
    </div>
  );
};
