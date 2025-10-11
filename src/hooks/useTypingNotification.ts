/**
 * Hook for managing typing notifications
 * Consolidates typing notification logic and throttling
 */
import { useCallback, useRef } from "react";
import ircClient from "../lib/ircClient";

interface UseTypingNotificationOptions {
  serverId: string | null;
  enabled: boolean;
}

interface UseTypingNotificationReturn {
  notifyTyping: (target: string, text: string) => void;
  notifyTypingDone: (target: string) => void;
  resetTypingState: () => void;
}

/**
 * Manages typing notifications with throttling
 */
export function useTypingNotification({
  serverId,
  enabled,
}: UseTypingNotificationOptions): UseTypingNotificationReturn {
  const lastTypingTimeRef = useRef(0);

  /**
   * Send typing notification based on text input
   * Throttles active notifications to once per 3 seconds
   */
  const notifyTyping = useCallback(
    (target: string, text: string) => {
      if (!enabled || !serverId || !target) return;

      // Don't send typing for commands
      if (text.length > 0 && text[0] === "/") return;

      const currentTime = Date.now();

      if (text.length > 0) {
        // Only send typing active if 3 seconds have passed
        if (currentTime - lastTypingTimeRef.current < 3000) return;

        lastTypingTimeRef.current = currentTime;
        ircClient.sendTyping(serverId, target, true);
      } else {
        // Text is empty, send typing done
        ircClient.sendTyping(serverId, target, false);
        lastTypingTimeRef.current = 0;
      }
    },
    [serverId, enabled],
  );

  /**
   * Send typing done notification
   */
  const notifyTypingDone = useCallback(
    (target: string) => {
      if (!enabled || !serverId || !target) return;
      ircClient.sendTyping(serverId, target, false);
      lastTypingTimeRef.current = 0;
    },
    [serverId, enabled],
  );

  /**
   * Reset typing state (called on channel change)
   */
  const resetTypingState = useCallback(() => {
    lastTypingTimeRef.current = 0;
  }, []);

  return {
    notifyTyping,
    notifyTypingDone,
    resetTypingState,
  };
}
