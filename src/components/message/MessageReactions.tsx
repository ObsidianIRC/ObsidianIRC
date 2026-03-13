import type React from "react";
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
}

export const MessageReactions: React.FC<MessageReactionsProps> = ({
  reactions,
  currentUserUsername,
  onReactionClick,
  onAddReaction,
}) => {
  if (!reactions || reactions.length === 0) {
    return null;
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
    <div className="flex flex-wrap gap-1 mt-1 select-none">
      {Object.entries(groupedReactions).map(([emoji, data]) => {
        const reactionData = data as ReactionData;
        return (
          <button
            key={emoji}
            type="button"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-all cursor-pointer ${
              reactionData.currentUserReacted
                ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                : "bg-discord-dark-300 text-discord-text-muted hover:bg-discord-dark-200"
            }`}
            title={`${emoji} · ${reactionData.count} · ${reactionData.users.join(", ")}`}
            onClick={() =>
              onReactionClick(emoji, reactionData.currentUserReacted)
            }
          >
            <span>{emoji}</span>
            <span className="text-xs font-medium tabular-nums">
              {reactionData.count}
            </span>
          </button>
        );
      })}
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
