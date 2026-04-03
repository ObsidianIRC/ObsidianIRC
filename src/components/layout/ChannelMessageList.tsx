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
    // Tracks server-side "load older" requests so we can show an inline spinner instead of the
    // full-screen one and let CSS scroll anchoring hold position instead of jumping to the bottom.
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    // Ref mirror so ResizeObserver closure can read current value without stale capture.
    const isLoadingMoreRef = useRef(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messagesInnerRef = useRef<HTMLDivElement>(null);
    // Freeze display-window start when user scrolls up (WKWebView scroll anchoring fix).
    const scrollUpStartRef = useRef<number | null>(null);

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

    // Freeze the display-window start index when the user first scrolls up.
    // Prevents dumping all hidden messages into the DOM at once, which caused
    // WKWebView flex scroll anchoring to fail and jump the viewport to the top.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omit filteredMessages.length and visibleMessageCount — start index captured only once when isScrolledUp first becomes true
    useEffect(() => {
      if (isScrolledUp) {
        if (scrollUpStartRef.current === null) {
          scrollUpStartRef.current = Math.max(
            0,
            filteredMessages.length - visibleMessageCount,
          );
        }
      } else {
        scrollUpStartRef.current = null;
      }
    }, [isScrolledUp]);

    const displayedMessages = useMemo(() => {
      if (searchQuery.trim()) return filteredMessages;
      const frozenStart = scrollUpStartRef.current;
      if (isScrolledUp && frozenStart !== null) {
        return filteredMessages.slice(frozenStart);
      }
      return filteredMessages.slice(-visibleMessageCount);
    }, [filteredMessages, visibleMessageCount, searchQuery, isScrolledUp]);

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

    // Scroll to bottom after initial join history loads; trigger spinner teardown at batch end.
    // useLayoutEffect (not useEffect) fires synchronously after DOM mutations, before paint.
    const wasLoadingHistoryRef = useRef(false);
    // biome-ignore lint/correctness/useExhaustiveDependencies: scrollToBottom is stable via useCallback; refs and setters are stable
    useLayoutEffect(() => {
      if (wasLoadingHistoryRef.current && !isLoadingHistory) {
        if (isLoadingMoreRef.current) {
          // load-more batch complete — clear the loading flag so the spinner is removed.
          // CSS scroll anchoring (overflow-anchor: auto) naturally holds viewport position as
          // messages are prepended and the spinner is removed, so no JS compensation needed.
          isLoadingMoreRef.current = false;
          setIsLoadingMore(false);
        } else {
          // Initial join: scroll to bottom synchronously before paint.
          scrollToBottom();
          wasAtBottomRef.current = true;
        }
      }
      wasLoadingHistoryRef.current = isLoadingHistory;
    }, [isLoadingHistory]);

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
        // Skip auto-scroll during load-more — CSS scroll anchoring holds position.
        if (isLoadingMoreRef.current) {
          prevScrollHeight = container.scrollHeight;
          return;
        }
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
        >
          {isLoadingHistory && !isLoadingMore ? (
            <div className="flex-grow flex items-center justify-center">
              <LoadingSpinner
                size="lg"
                text="Loading chat history..."
                className="text-discord-text-muted"
              />
            </div>
          ) : (
            <div ref={messagesInnerRef} className="flex flex-col">
              {isLoadingMore && (
                <div className="flex justify-center py-2">
                  <LoadingSpinner
                    size="sm"
                    text="Loading older messages..."
                    className="text-discord-text-muted"
                  />
                </div>
              )}
              {hasMoreMessages && !searchQuery && !isLoadingMore && (
                <div className="flex justify-center py-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (locallyHidden) {
                        if (scrollUpStartRef.current !== null) {
                          scrollUpStartRef.current = Math.max(
                            0,
                            scrollUpStartRef.current - 100,
                          );
                        }
                        setVisibleMessageCount((prev) => prev + 100);
                      } else if (serverHasMore && channel && channelId) {
                        const oldest = channelMessages[0];
                        if (oldest?.timestamp) {
                          // scrollTop must be > 0 for CSS scroll anchoring to engage —
                          // it cannot adjust scrollTop below 0 when content is prepended.
                          const container = messagesContainerRef.current;
                          if (container)
                            container.scrollTop = Math.max(
                              1,
                              container.scrollTop,
                            );
                          isLoadingMoreRef.current = true;
                          setIsLoadingMore(true);
                          const ts = new Date(oldest.timestamp).toISOString();
                          ircClient.requestChathistoryBefore(
                            serverId,
                            channel.name,
                            ts,
                          );
                        }
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full text-discord-text-muted hover:text-discord-text-normal bg-discord-dark-400 hover:bg-discord-dark-300 border border-white/5 transition-all"
                  >
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
