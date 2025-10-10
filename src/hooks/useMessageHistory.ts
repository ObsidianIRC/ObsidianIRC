/**
 * Hook for managing message history navigation with arrow keys
 */
import { useEffect, useMemo, useState } from "react";
import { stripIrcFormatting } from "../lib/messageFormatter";
import type { Message } from "../types";

interface UseMessageHistoryOptions {
  messages: Message[];
  currentUsername: string | null;
  selectedChannelId: string | null;
  selectedPrivateChatId: string | null;
}

interface UseMessageHistoryReturn {
  messageHistoryIndex: number;
  draftText: string;
  navigateUp: (currentText: string) => string | null;
  navigateDown: () => string | null;
  resetHistory: () => void;
  exitHistory: () => void;
  userMessageHistory: Message[];
}

/**
 * Manages message history navigation for arrow key recall
 */
export function useMessageHistory({
  messages,
  currentUsername,
  selectedChannelId,
  selectedPrivateChatId,
}: UseMessageHistoryOptions): UseMessageHistoryReturn {
  const [messageHistoryIndex, setMessageHistoryIndex] = useState(-1);
  const [draftText, setDraftText] = useState("");

  // Memoize user's message history (filtered and reversed)
  const userMessageHistory = useMemo(() => {
    if (!currentUsername) return [];
    return messages
      .filter((msg) => msg.type === "message" && msg.userId === currentUsername)
      .reverse(); // Most recent first
  }, [messages, currentUsername]);

  // Reset history when channel/chat changes
  useEffect(() => {
    setMessageHistoryIndex(-1);
    setDraftText("");
  }, []);

  /**
   * Navigate to previous (older) message
   */
  const navigateUp = (currentText: string): string | null => {
    if (userMessageHistory.length === 0) return null;

    // Save draft text on first entry to history mode
    if (messageHistoryIndex === -1 && currentText !== "") {
      setDraftText(currentText);
    }

    // Navigate to previous message (or stay at oldest)
    const newIndex = Math.min(
      messageHistoryIndex + 1,
      userMessageHistory.length - 1,
    );

    if (newIndex >= 0 && newIndex < userMessageHistory.length) {
      setMessageHistoryIndex(newIndex);
      return stripIrcFormatting(userMessageHistory[newIndex].content);
    }

    return null;
  };

  /**
   * Navigate to next (newer) message or exit history mode
   */
  const navigateDown = (): string | null => {
    if (messageHistoryIndex < 0) return null;

    const newIndex = messageHistoryIndex - 1;

    if (newIndex === -1) {
      // Exit history mode, restore draft
      setMessageHistoryIndex(-1);
      const savedDraft = draftText;
      setDraftText("");
      return savedDraft;
    }

    // Navigate to next message
    setMessageHistoryIndex(newIndex);
    return stripIrcFormatting(userMessageHistory[newIndex].content);
  };

  /**
   * Reset history state (called after sending message)
   */
  const resetHistory = (): void => {
    setMessageHistoryIndex(-1);
    setDraftText("");
  };

  /**
   * Exit history mode (called when user starts typing)
   */
  const exitHistory = (): void => {
    if (messageHistoryIndex >= 0) {
      setMessageHistoryIndex(-1);
      setDraftText("");
    }
  };

  return {
    messageHistoryIndex,
    draftText,
    navigateUp,
    navigateDown,
    resetHistory,
    exitHistory,
    userMessageHistory,
  };
}
