import { ArrowLeftIcon, XMarkIcon } from "@heroicons/react/24/solid";
import type { EmojiClickData } from "emoji-picker-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { FaPlus } from "react-icons/fa";
import { useShallow } from "zustand/react/shallow";
import { useMessageSending } from "../../hooks/useMessageSending";
import { useReactions } from "../../hooks/useReactions";
import { canShowImageUrl } from "../../lib/imageUtils";
import ircClient from "../../lib/ircClient";
import {
  type FormattingType,
  getPreviewStyles,
  stripIrcFormatting,
} from "../../lib/messageFormatter";
import useStore from "../../store";
import type { Message } from "../../types";
import { MessageItem } from "../message/MessageItem";
import { MessageReactions } from "../message/MessageReactions";
import AutocompleteDropdown from "./AutocompleteDropdown";
import ColorPicker from "./ColorPicker";
import { EmojiPickerInline } from "./EmojiPickerInline";
import { EmojiPickerModal } from "./EmojiPickerModal";
import { InputToolbar } from "./InputToolbar";
import ReactionModal from "./ReactionModal";
import { ReactionPopover } from "./ReactionPopover";
import { TextArea } from "./TextInput";

interface MediaCommentsSidebarProps {
  sourceMessage: Message;
  currentImageUrl: string;
  serverId: string;
  channelId: string;
  isAlbum: boolean;
  isMobile: boolean;
  onClose: () => void;
  onCloseAll: () => void;
  onImageClick: (url: string) => void;
}

export function MediaCommentsSidebar({
  sourceMessage,
  currentImageUrl,
  serverId,
  channelId,
  isAlbum,
  isMobile,
  onClose,
  onCloseAll,
  onImageClick,
}: MediaCommentsSidebarProps) {
  const [commentText, setCommentText] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isEmojiSelectorOpen, setIsEmojiSelectorOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedFormatting, setSelectedFormatting] = useState<
    FormattingType[]
  >([]);
  const [reactionAnchorRect, setReactionAnchorRect] = useState<DOMRect | null>(
    null,
  );
  const sidebarRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Cache line-height + padding after first read — same pattern as ChatArea
  const textareaMetricsRef = useRef<{
    lineHeight: number;
    paddingTop: number;
    paddingBottom: number;
  } | null>(null);

  const { showSafeMedia, showExternalContent } = useStore(
    (state) => state.globalSettings,
  );
  const filehost = useStore
    .getState()
    .servers.find((s) => s.id === serverId)?.filehost;

  // Look up Channel object — useMessageSending needs channel.name for PRIVMSG target
  const selectedChannel = useStore((state) => {
    for (const server of state.servers) {
      if (server.id === serverId) {
        return server.channels.find((c) => c.id === channelId) ?? null;
      }
    }
    return null;
  });

  const channelName = selectedChannel?.name ?? null;
  const currentUser = ircClient.getCurrentUser(serverId);
  const redactMessage = useStore((state) => state.redactMessage);

  const {
    directReaction,
    unreact,
    reactionModal,
    openReactionModal,
    closeReactionModal,
    selectReaction,
  } = useReactions({
    selectedServerId: serverId,
    currentUser,
  });

  // useMessageSending handles reply tag, IRC formatting, long-message splitting
  // localReplyTo = sourceMessage means every send gets @+draft/reply=<msgid> prepended
  const { sendMessage } = useMessageSending({
    selectedServerId: serverId,
    selectedChannelId: channelId,
    selectedPrivateChatId: null,
    selectedChannel,
    selectedPrivateChat: null,
    currentUser,
    selectedColor,
    selectedFormatting,
    localReplyTo: sourceMessage,
  });

  // Live source message — re-reads from store so reactions update in real time
  const liveSourceMessage = useStore(
    useShallow((state) => {
      const key = `${serverId}-${channelId}`;
      return (
        (state.messages[key] ?? []).find((m) => m.id === sourceMessage.id) ??
        sourceMessage
      );
    }),
  );

  // Live comments — useShallow prevents infinite loop from filter() returning a new array ref each call
  const comments = useStore(
    useShallow((state) => {
      const key = `${serverId}-${channelId}`;
      return (state.messages[key] ?? []).filter(
        (m) => m.tags?.["+draft/reply"]?.trim() === sourceMessage.msgid,
      );
    }),
  );

  const toggleFormatting = (format: FormattingType) => {
    setSelectedFormatting((prev) =>
      prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format],
    );
  };

  const handleSend = () => {
    if (!commentText.trim() || !sourceMessage.msgid) return;
    sendMessage(commentText);
    setCommentText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    setCommentText((prev) => prev + emojiData.emoji);
    setIsEmojiSelectorOpen(false);
  };

  const trackCursor = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPosition((e.target as HTMLTextAreaElement).selectionStart ?? 0);
  };

  const handleUsernameSelect = (username: string) => {
    // Replace the @-word before cursor (or just insert @username if @ button triggered)
    const before = commentText.slice(0, cursorPosition);
    const after = commentText.slice(cursorPosition);
    const atIndex = before.lastIndexOf("@");
    const newText =
      atIndex >= 0
        ? `${before.slice(0, atIndex)}@${username} ${after}`
        : `${before}@${username} ${after}`;
    setCommentText(newText);
    setShowMentionDropdown(false);
    textareaRef.current?.focus();
  };

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (!textareaMetricsRef.current) {
      const computed = window.getComputedStyle(textarea);
      textareaMetricsRef.current = {
        lineHeight: Number.parseFloat(computed.lineHeight) || 20,
        paddingTop: Number.parseFloat(computed.paddingTop) || 0,
        paddingBottom: Number.parseFloat(computed.paddingBottom) || 0,
      };
    }
    const { lineHeight, paddingTop, paddingBottom } =
      textareaMetricsRef.current;
    const maxHeight = lineHeight * 5 + paddingTop + paddingBottom;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: commentText drives resize
  useLayoutEffect(() => {
    resizeTextarea();
  }, [resizeTextarea, commentText]);

  const sourceText = stripIrcFormatting(liveSourceMessage.content);
  const commentCount = comments.length;
  // Only apply previewStyle when the user has actually chosen formatting/color.
  // getPreviewStyles always returns color:"inherit" as a fallback, which as an
  // inline style overrides the Tailwind text-discord-text-normal class and makes
  // the text inherit the browser default (black) in the modal's DOM tree.
  const hasActiveFormatting =
    (selectedColor !== null && selectedColor !== "inherit") ||
    selectedFormatting.length > 0;
  const previewStyle = hasActiveFormatting
    ? getPreviewStyles({
        color: selectedColor ?? "inherit",
        formatting: selectedFormatting,
      })
    : undefined;

  return (
    <div
      ref={sidebarRef}
      data-comments-sidebar=""
      className={`flex flex-col bg-discord-dark-200 border-l border-white/[0.06] ${
        isMobile ? "w-full h-full" : "w-80 flex-shrink-0"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-white/[0.06] flex-shrink-0">
        {isMobile ? (
          <>
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to image"
              className="p-1.5 rounded-full hover:bg-white/10 text-discord-text-muted hover:text-discord-text-normal transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </button>
            <span className="flex-1 text-sm font-semibold text-discord-text-normal truncate">
              Comments
              {commentCount > 0 && (
                <span className="ml-1.5 text-discord-text-muted font-normal">
                  ({commentCount})
                </span>
              )}
              {channelName && (
                <span className="ml-1.5 text-xs text-discord-text-muted font-normal">
                  {channelName}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onCloseAll}
              aria-label="Close viewer"
              className="p-1.5 rounded-full hover:bg-white/10 text-discord-text-muted hover:text-discord-text-normal transition-colors"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm font-semibold text-discord-text-normal truncate">
              Comments
              {commentCount > 0 && (
                <span className="ml-1.5 text-discord-text-muted font-normal">
                  ({commentCount})
                </span>
              )}
              {channelName && (
                <span className="ml-1.5 text-xs text-discord-text-muted font-normal">
                  {channelName}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close comments"
              className="p-1.5 rounded-full hover:bg-white/10 text-discord-text-muted hover:text-discord-text-normal transition-colors"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Context strip */}
      <div className="flex items-start gap-2.5 px-3 py-2.5 bg-discord-dark-100 border-b border-white/[0.06] flex-shrink-0">
        {canShowImageUrl(
          currentImageUrl,
          showSafeMedia,
          showExternalContent,
          filehost,
        ) && (
          <img
            src={currentImageUrl}
            alt=""
            className="w-10 h-10 rounded object-cover flex-shrink-0 transparency-grid"
            draggable={false}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-discord-text-muted leading-tight">
            {isAlbum ? "Album" : "Image"} · @{liveSourceMessage.userId}
          </p>
          <p className="text-xs text-discord-text-normal/80 leading-snug mt-0.5 line-clamp-2 break-words">
            {sourceText}
          </p>
          <MessageReactions
            reactions={liveSourceMessage.reactions}
            currentUserUsername={currentUser?.username}
            alwaysShowAdd
            onReactionClick={(emoji, currentUserReacted) => {
              if (currentUserReacted) {
                unreact(emoji, liveSourceMessage);
              } else {
                directReaction(emoji, liveSourceMessage);
              }
            }}
            onAddReaction={(el) => {
              setReactionAnchorRect(el.getBoundingClientRect());
              openReactionModal(liveSourceMessage);
            }}
          />
        </div>
      </div>

      {/* Comments list — event delegation catches img clicks from MessageItem */}
      <div
        className="flex-1 overflow-y-auto py-2 min-h-0"
        onClick={(e) => {
          const img = (e.target as Element).closest("img");
          if (img) {
            const src = img.getAttribute("src");
            if (src) onImageClick(src);
          }
        }}
      >
        {comments.length === 0 ? (
          <p className="text-center text-xs text-discord-text-muted px-4 py-6">
            No comments yet. Be the first!
          </p>
        ) : (
          comments.map((comment) => (
            <MessageItem
              key={comment.id}
              message={{ ...comment, replyMessage: null }}
              showDate={false}
              showHeader={true}
              hideReply={true}
              setReplyTo={() => {}}
              onUsernameContextMenu={() => {}}
              onReactClick={(msg, el) => {
                setReactionAnchorRect(el.getBoundingClientRect());
                openReactionModal(msg);
              }}
              onReactionUnreact={unreact}
              onOpenReactionModal={(msg, _pos) => openReactionModal(msg)}
              onDirectReaction={directReaction}
              onRedactMessage={(msg) => {
                if (!msg.msgid || !channelName) return;
                if (
                  window.confirm("Delete this message? This cannot be undone.")
                ) {
                  redactMessage(serverId, channelName, msg.msgid);
                }
              }}
              serverId={serverId}
              channelId={channelId}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input — same structure as main ChatArea input */}
      <div className="px-3 pb-3 pt-1 relative">
        <div className="bg-discord-dark-100 rounded-lg flex items-center relative flex-nowrap">
          <button
            type="button"
            className="px-2 sm:px-4 text-discord-text-muted hover:text-discord-text-normal flex-shrink-0"
            aria-label="Attachment options"
          >
            <FaPlus />
          </button>
          <TextArea
            ref={textareaRef}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={handleKeyDown}
            onKeyUp={trackCursor}
            onClick={trackCursor}
            autoCorrect="on"
            autoCapitalize="sentences"
            spellCheck={true}
            enterKeyHint={isMobile ? "enter" : "send"}
            placeholder={
              sourceMessage.msgid
                ? `Reply in ${channelName ?? "channel"}…`
                : "Replies unavailable (no message ID)"
            }
            disabled={!sourceMessage.msgid}
            rows={1}
            className="bg-transparent border-none outline-none py-3 flex-grow text-discord-text-normal resize-none min-h-[44px] overflow-y-auto placeholder:truncate disabled:opacity-50 disabled:cursor-not-allowed"
            style={previewStyle}
          />
          <InputToolbar
            selectedColor={selectedColor}
            onEmojiClick={() => {
              setIsEmojiSelectorOpen((prev) => !prev);
              setIsColorPickerOpen(false);
              setShowMentionDropdown(false);
            }}
            onColorPickerClick={() => {
              setIsColorPickerOpen((prev) => !prev);
              setIsEmojiSelectorOpen(false);
              setShowMentionDropdown(false);
            }}
            onAtClick={() => {
              setShowMentionDropdown((prev) => !prev);
              setIsEmojiSelectorOpen(false);
              setIsColorPickerOpen(false);
            }}
            onSendClick={handleSend}
            showSendButton={isMobile}
            hasText={commentText.trim().length > 0}
          />
        </div>
        {isColorPickerOpen && (
          <ColorPicker
            isNarrowView={isMobile}
            onSelect={(color) => setSelectedColor(color)}
            onClose={() => setIsColorPickerOpen(false)}
            selectedColor={selectedColor}
            selectedFormatting={selectedFormatting}
            toggleFormatting={toggleFormatting}
          />
        )}
        {!isMobile && (
          <EmojiPickerInline
            isOpen={isEmojiSelectorOpen}
            onEmojiClick={(e) => setCommentText((prev) => prev + e.emoji)}
            onClose={() => setIsEmojiSelectorOpen(false)}
          />
        )}
        <AutocompleteDropdown
          users={selectedChannel?.users ?? []}
          isVisible={showMentionDropdown}
          inputValue={commentText}
          cursorPosition={cursorPosition}
          onSelect={handleUsernameSelect}
          onClose={() => setShowMentionDropdown(false)}
          inputElement={textareaRef.current}
          isAtButtonTriggered={showMentionDropdown}
          isNarrowView={isMobile}
        />
      </div>

      {isMobile && (
        <EmojiPickerModal
          isOpen={isEmojiSelectorOpen}
          onEmojiClick={handleEmojiSelect}
          onClose={() => setIsEmojiSelectorOpen(false)}
          onBackdropClick={(e) => {
            if (e.target === e.currentTarget) setIsEmojiSelectorOpen(false);
          }}
          zIndex={9999}
        />
      )}

      {isMobile ? (
        <ReactionModal
          isOpen={reactionModal.isOpen}
          onClose={closeReactionModal}
          onSelectEmoji={selectReaction}
          zIndex={10000}
        />
      ) : (
        <ReactionPopover
          isOpen={reactionModal.isOpen}
          anchorRect={reactionAnchorRect}
          placement="left"
          containerLeft={sidebarRef.current?.getBoundingClientRect().left}
          onClose={() => {
            closeReactionModal();
            setReactionAnchorRect(null);
          }}
          onSelectEmoji={selectReaction}
          zIndex={10000}
        />
      )}
    </div>
  );
}
