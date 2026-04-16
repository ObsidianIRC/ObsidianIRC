import type * as React from "react";
import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { SCROLL_TOLERANCE } from "../../hooks/useScrollToBottom";
import { groupConsecutiveEvents } from "../../lib/eventGrouping";
import ircClient from "../../lib/ircClient";
import useStore from "../../store";
import type { Message as MessageType } from "../../types";
import { CollapsedEventMessage } from "../message/CollapsedEventMessage";
import { MessageItem } from "../message/MessageItem";
import LoadingSpinner from "../ui/LoadingSpinner";
import { ScrollToBottomButton } from "../ui/ScrollToBottomButton";

export const DEFAULT_VISIBLE_MESSAGE_COUNT = 100;

// Stable empty array — prevents selector from returning a new [] on every render
// when the channel has no messages yet (undefined ?? [] would create a new ref each time).
const EMPTY_MESSAGES: import("../../types").Message[] = [];

export interface ChannelMessageListHandle {
  setAtBottom: () => void;
  scrollToBottom: () => void;
  getScrollState: () => {
    scrollTop: number;
    isAtBottom: boolean;
    visibleCount: number;
  };
}

interface ChannelMessageListProps {
  channelKey: string;
  serverId: string;
  channelId: string | null;
  privateChatId: string | null;
  isActive: boolean;
  searchQuery: string;
  isMemberListVisible: boolean;
  onReply: (msg: MessageType | null) => void;
  onUsernameContextMenu: (
    e: React.MouseEvent,
    username: string,
    serverId: string,
    channelId: string,
    avatarEl?: Element | null,
  ) => void;
  onIrcLinkClick: (url: string) => void;
  onReactClick: (msg: MessageType, el: Element) => void;
  onReactionUnreact: (emoji: string, msg: MessageType) => void;
  onOpenReactionModal: (
    msg: MessageType,
    position: { x: number; y: number },
  ) => void;
  onDirectReaction: (emoji: string, msg: MessageType) => void;
  onRedactMessage: (msg: MessageType) => void;
  onOpenProfile: (username: string) => void;
  joinChannel: (serverId: string, channelName: string) => void;
  onClearSearch: () => void;
  highlightedMessageId?: string;
  // undefined = first visit; null = was at bottom; object = restore to saved position
  initialScrollState?: { scrollTop: number; visibleCount: number } | null;
}

export const ChannelMessageList = forwardRef<
  ChannelMessageListHandle,
  ChannelMessageListProps
>(
  (
    {
      channelKey,
      serverId,
      channelId,
      privateChatId,
      isActive,
      searchQuery,
      isMemberListVisible,
      onReply,
      onUsernameContextMenu,
      onIrcLinkClick,
      onReactClick,
      onReactionUnreact,
      onOpenReactionModal,
      onDirectReaction,
      onRedactMessage,
      onOpenProfile,
      joinChannel,
      onClearSearch,
      highlightedMessageId,
      initialScrollState,
    },
    ref,
  ) => {
    const [isScrolledUp, setIsScrolledUp] = useState(false);
    const wasAtBottomRef = useRef(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const isFetchingMoreRef = useRef(false);
    const virtuosoRef = useRef<VirtuosoHandle>(null);

    // Snapshot of the last known scroll position captured while the container was visible.
    const lastScrollTopRef = useRef(initialScrollState?.scrollTop ?? 0);

    useImperativeHandle(ref, () => ({
      setAtBottom: () => {
        // virtuoso handles this via followOutput
      },
      scrollToBottom: () => {
        virtuosoRef.current?.scrollToIndex({
          index: eventGroups.length - 1,
          align: "end",
          behavior: "smooth",
        });
      },
      getScrollState: () => ({
        scrollTop: lastScrollTopRef.current,
        isAtBottom: wasAtBottomRef.current,
        visibleCount: eventGroups.length, // Virtuoso handles visibility, but we report total count
      }),
    }));

    const channelMessages = useStore(
      useCallback(
        (state) => state.messages[channelKey] ?? EMPTY_MESSAGES,
        [channelKey],
      ),
    );
    const servers = useStore((state) => state.servers);

    const channel = useMemo(
      () =>
        channelId
          ? (servers
              .find((s) => s.id === serverId)
              ?.channels.find((c) => c.id === channelId) ?? null)
          : null,
      [servers, serverId, channelId],
    );

    const filteredMessages = useMemo(() => {
      if (!searchQuery.trim()) return channelMessages;
      const query = searchQuery.toLowerCase();
      return channelMessages.filter(
        (msg) =>
          msg.content.toLowerCase().includes(query) ||
          msg.userId.toLowerCase().includes(query),
      );
    }, [channelMessages, searchQuery]);

    const eventGroups = useMemo(
      () => groupConsecutiveEvents(filteredMessages),
      [filteredMessages],
    );

    const isLoadingHistory = channel?.isLoadingHistory ?? false;

    // Reset fetch spinner at batch end.
    const wasLoadingHistoryRef = useRef(false);
    useLayoutEffect(() => {
      if (wasLoadingHistoryRef.current && !isLoadingHistory) {
        if (isFetchingMoreRef.current) {
          isFetchingMoreRef.current = false;
          setIsFetchingMore(false);
        }
      }
      wasLoadingHistoryRef.current = isLoadingHistory;
    }, [isLoadingHistory]);

    const renderItem = useCallback(
      (index: number) => {
        const group = eventGroups[index];
        if (!group) return null;

        if (group.type === "eventGroup") {
          const firstId = group.messages[0]?.id || "";
          const lastId = group.messages[group.messages.length - 1]?.id || "";
          const groupKey = `group-${firstId}-${lastId}`;
          return (
            <CollapsedEventMessage
              key={groupKey}
              eventGroup={group}
              users={channel?.users || []}
              onUsernameContextMenu={onUsernameContextMenu}
            />
          );
        }

        const message = group.messages[0];
        const originalIndex = filteredMessages.findIndex(
          (m) => m.id === message.id,
        );
        const previousMessage = filteredMessages[originalIndex - 1];
        const showHeader =
          !previousMessage ||
          previousMessage.type !== "message" ||
          previousMessage.userId !== message.userId ||
          new Date(message.timestamp).getTime() -
            new Date(previousMessage.timestamp).getTime() >
            5 * 60 * 1000;

        return (
          <MessageItem
            key={message.id}
            message={message}
            showDate={
              originalIndex === 0 ||
              new Date(message.timestamp).toDateString() !==
                new Date(
                  filteredMessages[originalIndex - 1]?.timestamp,
                ).toDateString()
            }
            showHeader={showHeader}
            setReplyTo={onReply}
            isHighlighted={message.id === highlightedMessageId}
            onUsernameContextMenu={onUsernameContextMenu}
            onIrcLinkClick={onIrcLinkClick}
            onReactClick={onReactClick}
            joinChannel={joinChannel}
            onReactionUnreact={onReactionUnreact}
            onOpenReactionModal={onOpenReactionModal}
            onDirectReaction={onDirectReaction}
            serverId={serverId}
            channelId={channelId || undefined}
            privateChatId={privateChatId || undefined}
            onRedactMessage={onRedactMessage}
            onOpenProfile={onOpenProfile}
          />
        );
      },
      [
        eventGroups,
        filteredMessages,
        onUsernameContextMenu,
        onReply,
        highlightedMessageId,
        onIrcLinkClick,
        onReactClick,
        joinChannel,
        onReactionUnreact,
        onOpenReactionModal,
        onDirectReaction,
        serverId,
        channelId,
        privateChatId,
        onRedactMessage,
        onOpenProfile,
        channel?.users,
      ],
    );

    const Header = useMemo(() => {
      if (!isLoadingHistory && channel?.hasMoreHistory && !searchQuery) {
        return (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={() => {
                if (channel && channelId) {
                  const oldest = channelMessages[0];
                  if (oldest?.timestamp) {
                    const ts = new Date(oldest.timestamp).toISOString();
                    isFetchingMoreRef.current = true;
                    setIsFetchingMore(true);
                    ircClient.requestChathistoryBefore(
                      serverId,
                      channel.name,
                      ts,
                    );
                  }
                }
              }}
              disabled={isFetchingMore}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full text-discord-text-muted hover:text-discord-text-normal bg-discord-dark-400 hover:bg-discord-dark-300 border border-white/5 transition-all"
            >
              {isFetchingMore ? (
                <LoadingSpinner size="sm" text="" />
              ) : (
                <svg
                  className="w-3 h-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              )}
              {isFetchingMore ? "Getting messages..." : "Load older messages"}
            </button>
          </div>
        );
      }
      if (searchQuery) {
        return (
          <div className="flex justify-center items-center gap-2 py-2 bg-discord-dark-300 text-discord-text-muted text-sm">
            <span>
              Found {filteredMessages.length} message
              {filteredMessages.length === 1 ? "" : "s"} matching "{searchQuery}
              "
            </span>
            <button
              type="button"
              onClick={onClearSearch}
              className="text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        );
      }
      return null;
    }, [
      isLoadingHistory,
      channelId,
      searchQuery,
      isFetchingMore,
      serverId,
      filteredMessages.length,
      onClearSearch,
      channel.name,
      channelMessages[0],
      channel?.hasMoreHistory,
      channel,
    ]);

    if (isLoadingHistory && !isFetchingMore) {
      return (
        <div className="flex-grow flex items-center justify-center bg-discord-dark-200">
          <LoadingSpinner size="lg" text="Loading chat history..." />
        </div>
      );
    }

    return (
      <div className="flex-grow flex flex-col relative bg-discord-dark-200">
        <Virtuoso
          ref={virtuosoRef}
          data={eventGroups}
          itemContent={renderItem}
          components={{ Header: () => Header }}
          followOutput={(isAtBottom) => (isAtBottom ? "smooth" : false)}
          atBottomStateChange={(atBottom) => {
            wasAtBottomRef.current = atBottom;
            setIsScrolledUp(!atBottom);
          }}
          atBottomThreshold={SCROLL_TOLERANCE}
          initialTopMostItemIndex={
            initialScrollState ? undefined : eventGroups.length - 1
          }
          increaseViewportBy={300}
          className="flex-grow virtuoso-scroller"
          style={{ overflowAnchor: "none" }}
        />
        <ScrollToBottomButton
          isVisible={isScrolledUp}
          onClick={() => {
            virtuosoRef.current?.scrollToIndex({
              index: eventGroups.length - 1,
              align: "end",
              behavior: "smooth",
            });
          }}
        />
      </div>
    );
  },
);

ChannelMessageList.displayName = "ChannelMessageList";

// Wrap with memo so hidden keep-alive channels skip re-renders when their props
// haven't changed (e.g. when messageText changes in the input — the only thing
// that changes on typing is local state inside ChatArea, not the props we pass here).
export const MemoChannelMessageList = memo(ChannelMessageList);
