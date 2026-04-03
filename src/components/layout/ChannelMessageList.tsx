import type * as React from "react";
import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useScrollToBottom } from "../../hooks/useScrollToBottom";
import { groupConsecutiveEvents } from "../../lib/eventGrouping";
import ircClient from "../../lib/ircClient";
import useStore from "../../store";
import type { Message as MessageType } from "../../types";
import { CollapsedEventMessage } from "../message/CollapsedEventMessage";
import { MessageItem } from "../message/MessageItem";
import LoadingSpinner from "../ui/LoadingSpinner";
import { ScrollToBottomButton } from "../ui/ScrollToBottomButton";

export interface ChannelMessageListHandle {
  setAtBottom: () => void;
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
    },
    ref,
  ) => {
    const [visibleMessageCount, setVisibleMessageCount] = useState(100);
    // Distinguishes initial join (full-screen spinner) from subsequent "load more" (button spinner).
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const isFetchingMoreRef = useRef(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messagesInnerRef = useRef<HTMLDivElement>(null);
    // scrollHeight from the previous render — used to compute delta for scroll correction.
    const prevScrollHeightRef = useRef(0);
    // Ref mirror of isScrolledUp for useLayoutEffect closures that shouldn't re-run on scroll changes.
    const isScrolledUpRef = useRef(false);
    // Track first message identity to detect when older messages are prepended.
    const prevFilteredLengthRef = useRef(0);
    const prevFirstMsgIdRef = useRef<string | null>(null);

    const messages = useStore((state) => state.messages);
    const servers = useStore((state) => state.servers);
    const mobileViewActiveColumn = useStore(
      (state) => state.ui.mobileViewActiveColumn,
    );

    const channel = useMemo(
      () =>
        channelId
          ? (servers
              .find((s) => s.id === serverId)
              ?.channels.find((c) => c.id === channelId) ?? null)
          : null,
      [servers, serverId, channelId],
    );

    const { isScrolledUp, wasAtBottomRef, scrollToBottom } = useScrollToBottom(
      messagesContainerRef,
      messagesEndRef,
      { channelId: `${channelId || privateChatId}-${isMemberListVisible}` },
    );

    useImperativeHandle(ref, () => ({
      setAtBottom: () => {
        wasAtBottomRef.current = true;
      },
    }));

    const channelMessages = useMemo(
      () => (channelKey ? messages[channelKey] || [] : []),
      [messages, channelKey],
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

    useEffect(() => {
      isScrolledUpRef.current = isScrolledUp;
    }, [isScrolledUp]);

    // Reset windowing state when switching channels so stale refs don't affect the new channel.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional full reset on channel change
    useEffect(() => {
      setVisibleMessageCount(100);
      prevFilteredLengthRef.current = 0;
      prevFirstMsgIdRef.current = null;
      prevScrollHeightRef.current = 0;
    }, [channelKey]);

    const displayedMessages = useMemo(() => {
      if (searchQuery.trim()) return filteredMessages;
      return filteredMessages.slice(-visibleMessageCount);
    }, [filteredMessages, visibleMessageCount, searchQuery]);

    const locallyHidden = filteredMessages.length > displayedMessages.length;
    const serverHasMore = channel?.hasMoreHistory === true;
    const hasMoreMessages = locallyHidden || serverHasMore;

    const eventGroups = useMemo(
      () => groupConsecutiveEvents(displayedMessages),
      [displayedMessages],
    );

    const isLoadingHistory = channel?.isLoadingHistory ?? false;

    // Scroll to bottom on initial mount (first time this channel enters keep-alive cache).
    // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount only
    useEffect(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop =
          messagesContainerRef.current.scrollHeight;
      }
      wasAtBottomRef.current = true;
    }, []);

    // Scroll to bottom after initial join history loads; clear fetch spinner at batch end.
    const wasLoadingHistoryRef = useRef(false);
    // biome-ignore lint/correctness/useExhaustiveDependencies: scrollToBottom is stable via useCallback; refs and setters are stable
    useLayoutEffect(() => {
      if (wasLoadingHistoryRef.current && !isLoadingHistory) {
        if (isFetchingMoreRef.current) {
          // delta correction for scroll position is handled by useLayoutEffect([displayedMessages])
          isFetchingMoreRef.current = false;
          setIsFetchingMore(false);
        } else {
          scrollToBottom();
          wasAtBottomRef.current = true;
        }
      }
      wasLoadingHistoryRef.current = isLoadingHistory;
    }, [isLoadingHistory]);

    // When older messages are prepended, grow the window so they enter displayedMessages.
    useLayoutEffect(() => {
      const newLength = filteredMessages.length;
      const newFirstId = filteredMessages[0]?.id ?? null;

      if (
        prevFilteredLengthRef.current > 0 &&
        newLength > prevFilteredLengthRef.current &&
        newFirstId !== prevFirstMsgIdRef.current
      ) {
        setVisibleMessageCount(
          (prev) => prev + (newLength - prevFilteredLengthRef.current),
        );
      }

      prevFilteredLengthRef.current = newLength;
      prevFirstMsgIdRef.current = newFirstId;
    }, [filteredMessages]);

    // Compensate scrollTop when content is prepended above the viewport.
    // biome-ignore lint/correctness/useExhaustiveDependencies: refs don't need to be deps
    useLayoutEffect(() => {
      const container = messagesContainerRef.current;
      if (!container) return;

      const prevHeight = prevScrollHeightRef.current;
      const newHeight = container.scrollHeight;

      if (isScrolledUpRef.current && prevHeight > 0 && newHeight > prevHeight) {
        container.scrollTop += newHeight - prevHeight;
      }

      prevScrollHeightRef.current = newHeight;
    }, [displayedMessages]);

    // Re-stick to bottom when inner message content grows (media/audio previews loading).
    // Uses prevScrollHeight instead of wasAtBottomRef to avoid stale-flag race where the
    // ref is true while the user is actively scrolling up.
    // biome-ignore lint/correctness/useExhaustiveDependencies: scrollToBottom is a stable ref
    useEffect(() => {
      const container = messagesContainerRef.current;
      const inner = messagesInnerRef.current;
      if (!inner || !container) return;
      let prevScrollHeight = container.scrollHeight;
      const observer = new ResizeObserver(() => {
        const wasAtPrevBottom =
          container.scrollTop + container.clientHeight >= prevScrollHeight - 30;
        prevScrollHeight = container.scrollHeight;
        if (wasAtPrevBottom) {
          scrollToBottom();
        }
      });
      observer.observe(inner);
      return () => observer.disconnect();
    }, [isLoadingHistory, channelId, privateChatId]);

    // Auto-scroll on new messages — skip when this channel is hidden (display:none).
    // biome-ignore lint/correctness/useExhaustiveDependencies: only scroll when messages change, not when isActive changes
    useEffect(() => {
      if (!isActive) return;
      const isNarrowView = window.matchMedia("(max-width: 768px)").matches;
      const isChatVisible =
        !isNarrowView || mobileViewActiveColumn === "chatView";
      if (wasAtBottomRef.current && isChatVisible) {
        scrollToBottom();
      }
    }, [displayedMessages, mobileViewActiveColumn, scrollToBottom, isActive]);

    return (
      <>
        <div
          ref={messagesContainerRef}
          className="flex-grow overflow-y-auto overflow-x-hidden flex flex-col bg-discord-dark-200 text-discord-text-normal relative"
          // Disable CSS scroll anchoring — it compounds with our useLayoutEffect delta correction causing double-jumps in browser.
          style={{ overflowAnchor: "none" }}
        >
          {isLoadingHistory && !isFetchingMore ? (
            <div className="flex-grow flex items-center justify-center">
              <LoadingSpinner
                size="lg"
                text="Loading chat history..."
                className="text-discord-text-muted"
              />
            </div>
          ) : (
            <div ref={messagesInnerRef} className="flex flex-col">
              {hasMoreMessages && !searchQuery && (
                <div className="flex justify-center py-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (locallyHidden) {
                        setVisibleMessageCount((prev) => prev + 100);
                      } else if (serverHasMore && channel && channelId) {
                        const oldest = channelMessages[0];
                        if (oldest?.timestamp) {
                          isFetchingMoreRef.current = true;
                          setIsFetchingMore(true);
                          const ts = new Date(oldest.timestamp).toISOString();
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
                      <LoadingSpinner
                        size="sm"
                        className="text-discord-text-muted"
                      />
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-3 h-3"
                        aria-hidden="true"
                      >
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    )}
                    {locallyHidden
                      ? `${filteredMessages.length - displayedMessages.length} older messages`
                      : "Load older messages"}
                  </button>
                </div>
              )}
              {searchQuery && (
                <div className="flex justify-center items-center gap-2 py-2 bg-discord-dark-300 text-discord-text-muted text-sm">
                  <span>
                    Found {filteredMessages.length} message
                    {filteredMessages.length === 1 ? "" : "s"} matching "
                    {searchQuery}"
                  </span>
                  <button
                    type="button"
                    onClick={onClearSearch}
                    className="text-red-400 hover:text-red-300"
                    title="Clear search"
                  >
                    ✕
                  </button>
                </div>
              )}
              {eventGroups.map((group) => {
                if (group.type === "eventGroup") {
                  const firstId = group.messages[0]?.id || "";
                  const lastId =
                    group.messages[group.messages.length - 1]?.id || "";
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
                const originalIndex = channelMessages.findIndex(
                  (m) => m.id === message.id,
                );
                const previousMessage = channelMessages[originalIndex - 1];
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
                          channelMessages[originalIndex - 1]?.timestamp,
                        ).toDateString()
                    }
                    showHeader={showHeader}
                    setReplyTo={onReply}
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
              })}
            </div>
          )}
          <div ref={messagesEndRef} className="h-px" />
        </div>
        <ScrollToBottomButton
          isVisible={isScrolledUp}
          onClick={scrollToBottom}
        />
      </>
    );
  },
);

ChannelMessageList.displayName = "ChannelMessageList";

// Wrap with memo so hidden keep-alive channels skip re-renders when their props
// haven't changed (e.g. when messageText changes in the input — the only thing
// that changes on typing is local state inside ChatArea, not the props we pass here).
export const MemoChannelMessageList = memo(ChannelMessageList);
