import type React from "react";
import { FaExpand, FaLanguage, FaReply, FaTrash } from "react-icons/fa";
import type { MessageType } from "../../types";
import { MdAddReaction } from "./icons";

interface MessageActionsProps {
  message: MessageType;
  onReplyClick: () => void;
  onReactClick: (buttonElement: Element) => void;
  onTranslateClick?: () => void;
  onRedactClick?: () => void;
  onOpenMedia?: () => void;
  canRedact?: boolean;
  canReply?: boolean;
  canTranslate?: boolean;
  canOpenMedia?: boolean;
  isTranslating?: boolean;
  inline?: boolean;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  message,
  onReplyClick,
  onReactClick,
  onTranslateClick,
  onRedactClick,
  onOpenMedia,
  canRedact = false,
  canReply = !!message.msgid,
  canTranslate = false,
  canOpenMedia = false,
  isTranslating = false,
  inline = false,
}) => {
  return (
    <div
      className={`message-actions-container flex items-center bg-discord-dark-300 border border-white/10 rounded-lg shadow-xl divide-x divide-white/10 select-none z-10 ${
        inline ? "flex-shrink-0 self-end" : "absolute -top-4 right-2"
      }`}
    >
      {canOpenMedia && onOpenMedia && (
        <button
          type="button"
          className="px-2.5 py-1.5 text-discord-text-muted/70 hover:text-discord-text-normal hover:bg-white/10 transition-colors first:rounded-l-lg last:rounded-r-lg"
          onClick={onOpenMedia}
          title="Open in viewer"
        >
          <FaExpand className="w-3.5 h-3.5" />
        </button>
      )}
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
      {canTranslate && onTranslateClick && (
        <button
          type="button"
          className="px-2.5 py-1.5 text-sky-300/80 hover:text-sky-200 hover:bg-white/10 transition-colors first:rounded-l-lg last:rounded-r-lg disabled:opacity-60 disabled:cursor-wait"
          onClick={onTranslateClick}
          title={isTranslating ? "Translating" : "Translate message"}
          aria-label={
            isTranslating ? "Translating message" : "Translate message"
          }
          disabled={isTranslating}
        >
          <FaLanguage className="w-4 h-4" />
        </button>
      )}
      <button
        type="button"
        className="px-2.5 py-1.5 text-discord-text-muted hover:text-discord-text-normal hover:bg-white/10 transition-colors first:rounded-l-lg last:rounded-r-lg"
        onClick={(e) => onReactClick(e.currentTarget)}
        title="Add reaction"
      >
        <MdAddReaction className="w-5 h-5" />
      </button>
    </div>
  );
};
