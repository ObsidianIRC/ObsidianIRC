import type * as React from "react";
import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useScrollToBottom } from "../../hooks/useScrollToBottom";
import { groupConsecutiveEvents } from "../../lib/eventGrouping";
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

    const hasMoreMessages = filteredMessages.length > displayedMessages.length;

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

    // Scroll to bottom after chat history finishes loading.
    const wasLoadingHistoryRef = useRef(false);
    // biome-ignore lint/correctness/useExhaustiveDependencies: scrollToBottom is stable via useCallback
    useEffect(() => {
      if (wasLoadingHistoryRef.current && !isLoadingHistory) {
        requestAnimationFrame(() => {
          scrollToBottom();
          wasAtBottomRef.current = true;
        });
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
          {isLoadingHistory ? (
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
                <div className="flex justify-center py-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (scrollUpStartRef.current !== null) {
                        scrollUpStartRef.current = Math.max(
                          0,
                          scrollUpStartRef.current - 100,
                        );
                      }
                      setVisibleMessageCount((prev) => prev + 100);
                    }}
                    className="px-4 py-2 bg-discord-dark-400 hover:bg-discord-dark-300 text-discord-text-link rounded transition-colors"
                  >
                    View older messages (
                    {filteredMessages.length - displayedMessages.length} hidden)
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
