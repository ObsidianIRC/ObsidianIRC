import { FaTimes } from "react-icons/fa";
import type { Message } from "../../types";

interface ReplyBadgeProps {
  replyTo: Message;
  onClose: () => void;
}

export function ReplyBadge({ replyTo, onClose }: ReplyBadgeProps) {
  return (
    <div className="bg-discord-dark-100 rounded-t-lg px-4 py-2 flex items-center gap-2 text-sm text-discord-text-muted border-l-2 border-blue-500">
      <span className="truncate">
        Replying to{" "}
        <strong className="text-discord-text-normal">{replyTo.userId}</strong>
      </span>
      <button
        className="ml-auto flex-shrink-0 p-1 rounded hover:bg-discord-dark-300 text-discord-text-muted hover:text-discord-text-normal transition-colors"
        onClick={onClose}
      >
        <FaTimes className="text-xs" />
      </button>
    </div>
  );
}
