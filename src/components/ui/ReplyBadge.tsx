/**
 * Reply badge component that displays "Replying to X" with close button
 */
import { FaTimes } from "react-icons/fa";
import type { Message } from "../../types";

interface ReplyBadgeProps {
  replyTo: Message;
  onClose: () => void;
}

/**
 * Displays a badge showing who the user is replying to, with a close button
 */
export function ReplyBadge({ replyTo, onClose }: ReplyBadgeProps) {
  return (
    <div className="bg-discord-dark-200 rounded text-sm text-discord-text-muted mr-3 flex items-center h-8 px-2">
      <span className="flex-grow text-center">
        Replying to <strong>{replyTo.userId}</strong>
      </span>
      <button
        className="ml-2 text-xs text-discord-text-muted hover:text-discord-text-normal"
        onClick={onClose}
      >
        <FaTimes />
      </button>
    </div>
  );
}
