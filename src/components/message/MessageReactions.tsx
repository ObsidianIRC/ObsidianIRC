import type React from "react";
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
}

export const MessageReactions: React.FC<MessageReactionsProps> = ({
  reactions,
  currentUserUsername,
  onReactionClick,
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
      // Check if current user reacted with this emoji
      if (reaction.userId === currentUserUsername) {
        acc[reaction.emoji].currentUserReacted = true;
      }
      return acc;
    },
    {},
  );

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(groupedReactions).map(([emoji, data]) => {
        const reactionData = data as ReactionData;
        return (
          <div
            key={emoji}
            className="bg-discord-dark-300 hover:bg-discord-dark-200 text-white px-1.5 py-0.5 rounded text-xs flex items-center gap-1 transition-colors cursor-pointer group"
            title={`${emoji} ${reactionData.count} ${reactionData.count === 1 ? "reaction" : "reactions"} by ${reactionData.users.join(", ")}`}
            onClick={() =>
              onReactionClick(emoji, reactionData.currentUserReacted)
            }
          >
            <span>{emoji}</span>
            <span className="text-xs font-medium">{reactionData.count}</span>
            {/* Show X button if current user reacted */}
            {reactionData.currentUserReacted && (
              <button
                className="ml-1 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onReactionClick(emoji, true);
                }}
                title="Remove reaction"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
