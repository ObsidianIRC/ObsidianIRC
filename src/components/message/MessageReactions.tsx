import { Trans } from "@lingui/macro";
import { useLingui } from "@lingui/react/macro";
import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MessageType } from "../../types";
import { MdAddReaction } from "./icons";

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

const MAX_TOOLTIP_NAMES = 20;
const TOOLTIP_MAX_WIDTH = 240;

const ReactionTooltip: React.FC<{
  emoji: string;
  users: string[];
  anchor: { x: number; y: number };
}> = ({ emoji, users, anchor }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const gap = 6;
    const left = Math.max(
      8,
      Math.min(anchor.x - width / 2, window.innerWidth - width - 8),
    );
    const top = Math.max(8, anchor.y - height - gap);
    setPos({ left, top, visibility: "visible" });
  }, [anchor]);

  const shown = users.slice(0, MAX_TOOLTIP_NAMES);
  const rest = users.length - shown.length;
  const names =
    rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ");

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        zIndex: 9999,
        maxWidth: TOOLTIP_MAX_WIDTH,
        ...pos,
      }}
      className="bg-discord-dark-100 ring-1 ring-white/10 text-white rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.7)] pointer-events-none px-3 py-2.5 text-center"
    >
      <div className="text-2xl mb-1">{emoji}</div>
      <div className="text-xs font-semibold text-white/90 leading-relaxed">
        {names}
      </div>
      <div className="text-[11px] text-white/40 mt-1">
        <Trans>reacted to this message</Trans>
      </div>
    </div>
  );
};

const ReactionButton: React.FC<{
  emoji: string;
  reactionData: ReactionData;
  onReactionClick: (emoji: string, currentUserReacted: boolean) => void;
}> = ({ emoji, reactionData, onReactionClick }) => {
  const { t } = useLingui();
  const [showTooltip, setShowTooltip] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function handleMouseEnter() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ x: rect.left + rect.width / 2, y: rect.top });
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
      {showTooltip &&
        anchor &&
        createPortal(
          <ReactionTooltip
            emoji={emoji}
            users={reactionData.users}
            anchor={anchor}
          />,
          document.body,
        )}
      <button
        ref={buttonRef}
        type="button"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-all cursor-pointer ${
          reactionData.currentUserReacted
            ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
            : "bg-discord-dark-300 text-discord-text-muted hover:bg-discord-dark-200"
        }`}
        onClick={() => onReactionClick(emoji, reactionData.currentUserReacted)}
        aria-label={
          reactionData.currentUserReacted
            ? t`Remove reaction ${emoji}`
            : t`Add reaction ${emoji}`
        }
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
  const { t } = useLingui();
  if (!reactions || reactions.length === 0) {
    if (!alwaysShowAdd || !onAddReaction) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-0.5 mb-2 select-none">
        <button
          type="button"
          className="inline-flex items-center px-2 py-0.5 rounded-full text-sm bg-discord-dark-300 text-discord-channels-default hover:bg-discord-dark-200 hover:text-discord-text-muted transition-all"
          title={t`Add reaction`}
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
          title={t`Add reaction`}
          onClick={(e) => onAddReaction(e.currentTarget)}
        >
          <MdAddReaction className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
