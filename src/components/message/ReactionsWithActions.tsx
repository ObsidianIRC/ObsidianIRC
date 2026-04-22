import type React from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import type { MessageType } from "../../types";
import { MessageActions } from "./MessageActions";
import { MessageReactions } from "./MessageReactions";

interface ReactionsWithActionsProps {
  message: MessageType;
  currentUserUsername?: string;
  onReactionClick: (emoji: string, currentUserReacted: boolean) => void;
  onReactClick: (buttonElement: Element) => void;
  onReplyClick: () => void;
  onTranslateClick?: () => void;
  onRedactClick?: () => void;
  onOpenMedia?: () => void;
  canRedact?: boolean;
  canReply?: boolean;
  canTranslate?: boolean;
  canOpenMedia?: boolean;
  isTranslating?: boolean;
}

export const ReactionsWithActions: React.FC<ReactionsWithActionsProps> = ({
  message,
  currentUserUsername,
  onReactionClick,
  onReactClick,
  onReplyClick,
  onTranslateClick,
  onRedactClick,
  onOpenMedia,
  canRedact = false,
  canReply = true,
  canTranslate = false,
  canOpenMedia = false,
  isTranslating = false,
}) => {
  const isTouchDevice = useMediaQuery("(pointer: coarse)");
  const hasReactions = !!message.reactions?.length;

  if (!isTouchDevice && hasReactions) {
    return (
      <div className="flex items-end gap-2 mt-1">
        <div className="flex-1 min-w-0">
          <MessageReactions
            reactions={message.reactions}
            currentUserUsername={currentUserUsername}
            onReactionClick={onReactionClick}
            onAddReaction={onReactClick}
          />
        </div>
        <MessageActions
          message={message}
          onReplyClick={onReplyClick}
          onReactClick={onReactClick}
          onTranslateClick={onTranslateClick}
          onRedactClick={onRedactClick}
          onOpenMedia={onOpenMedia}
          canRedact={canRedact}
          canReply={canReply}
          canTranslate={canTranslate}
          canOpenMedia={canOpenMedia}
          isTranslating={isTranslating}
          inline
        />
      </div>
    );
  }

  return (
    <>
      <MessageReactions
        reactions={message.reactions}
        currentUserUsername={currentUserUsername}
        onReactionClick={onReactionClick}
        onAddReaction={isTouchDevice ? undefined : onReactClick}
      />
      {!isTouchDevice && (
        <MessageActions
          message={message}
          onReplyClick={onReplyClick}
          onReactClick={onReactClick}
          onTranslateClick={onTranslateClick}
          onRedactClick={onRedactClick}
          onOpenMedia={onOpenMedia}
          canRedact={canRedact}
          canReply={canReply}
          canTranslate={canTranslate}
          canOpenMedia={canOpenMedia}
          isTranslating={isTranslating}
        />
      )}
    </>
  );
};
