import type React from "react";
import { useRef, useState } from "react";
import { MdAddReaction } from "react-icons/md";
import type { MessageType } from "../../types";

interface ReactionData {
  count: number;
  users: string[];
  currentUserReacted: boolean;
}

interface MessageReactionsProps {
  reactions: MessageType["reactions"];
  currentUserUsername?: string;
  onReactionClick: (emoji: string, currentUserReacted: boolean) => void;
  onAddReaction?: (el: Element) => void;
  alwaysShowAdd?: boolean;
}

const ReactionButton: React.FC<{
  emoji: string;
  reactionData: ReactionData;
  onReactionClick: (emoji: string, currentUserReacted: boolean) => void;
}> = ({ emoji, reactionData, onReactionClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseEnter() {
    timerRef.current = setTimeout(() => setShowTooltip(true), 200);
  }

  function handleMouseLeave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowTooltip(false);
  }

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-discord-dark-100 text-white text-xs rounded shadow-lg z-50 whitespace-nowrap pointer-events-none">
          {(() => {
            const limit = 5;
            const shown = reactionData.users.slice(0, limit);
            const rest = reactionData.users.length - shown.length;
            return rest > 0
              ? `${shown.join(", ")} +${rest} more`
              : shown.join(", ");
          })()}
        </div>
      )}
      <button
        type="button"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-all cursor-pointer ${
          reactionData.currentUserReacted
            ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
            : "bg-discord-dark-300 text-discord-text-muted hover:bg-discord-dark-200"
        }`}
        onClick={() => onReactionClick(emoji, reactionData.currentUserReacted)}
      >
        <span>{emoji}</span>
        <span className="text-xs font-medium tabular-nums">
          {reactionData.count}
        </span>
      </button>
    </div>
  );
};

export const MessageReactions: React.FC<MessageReactionsProps> = ({
  reactions,
  currentUserUsername,
  onReactionClick,
  onAddReaction,
  alwaysShowAdd = false,
}) => {
  if (!reactions || reactions.length === 0) {
    if (!alwaysShowAdd || !onAddReaction) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-0.5 mb-2 select-none">
        <button
          type="button"
          className="inline-flex items-center px-2 py-0.5 rounded-full text-sm bg-discord-dark-300 text-discord-channels-default hover:bg-discord-dark-200 hover:text-discord-text-muted transition-all"
          title="Add reaction"
          onClick={(e) => onAddReaction(e.currentTarget)}
        >
          <MdAddReaction className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Group reactions by emoji
  const groupedReactions = reactions.reduce(
    (
      acc: Record<string, ReactionData>,
      reaction: { emoji: string; userId: string },
    ) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = {
          count: 0,
          users: [],
          currentUserReacted: false,
        };
      }
      acc[reaction.emoji].count++;
      acc[reaction.emoji].users.push(reaction.userId);
      if (reaction.userId === currentUserUsername) {
        acc[reaction.emoji].currentUserReacted = true;
      }
      return acc;
    },
    {},
  );

  return (
    <div className="flex flex-wrap gap-1 mt-0.5 mb-2 select-none">
      {Object.entries(groupedReactions).map(([emoji, data]) => (
        <ReactionButton
          key={emoji}
          emoji={emoji}
          reactionData={data as ReactionData}
          onReactionClick={onReactionClick}
        />
      ))}
      {onAddReaction && (
        <button
          type="button"
          className="inline-flex items-center px-2 py-0.5 rounded-full text-sm bg-discord-dark-300 text-discord-channels-default hover:bg-discord-dark-200 hover:text-discord-text-muted transition-all"
          title="Add reaction"
          onClick={(e) => onAddReaction(e.currentTarget)}
        >
          <MdAddReaction className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
