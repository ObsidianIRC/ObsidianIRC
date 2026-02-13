import type React from "react";
import { FaGrinAlt, FaReply, FaTimes } from "react-icons/fa";
import type { MessageType } from "../../types";

interface MessageActionsProps {
  message: MessageType;
  onReplyClick: () => void;
  onReactClick: (buttonElement: Element) => void;
  onRedactClick?: () => void;
  canRedact?: boolean;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  message,
  onReplyClick,
  onReactClick,
  onRedactClick,
  canRedact = false,
}) => {
  return (
    <div className="absolute bottom-1 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2 select-none">
      {canRedact && onRedactClick && (
        <button
          className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
          onClick={onRedactClick}
          title="Delete message"
        >
          <FaTimes />
        </button>
      )}
      {message.msgid && (
        <button
          className="bg-discord-dark-300 hover:bg-discord-dark-200 text-white px-2 py-1 rounded text-xs"
          onClick={onReplyClick}
        >
          <FaReply />
        </button>
      )}
      {message.msgid && (
        <button
          className="bg-discord-dark-300 hover:bg-discord-dark-200 text-white px-2 py-1 rounded text-xs"
          onClick={(e) => onReactClick(e.currentTarget)}
        >
          <FaGrinAlt />
        </button>
      )}
    </div>
  );
};
