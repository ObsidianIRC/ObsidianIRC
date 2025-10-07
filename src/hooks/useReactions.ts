/**
 * Hook for managing message reactions and reaction modal
 */
import { useCallback, useState } from "react";
import ircClient from "../lib/ircClient";
import useStore from "../store";
import type { Channel, Message, Server, User } from "../types";

interface ReactionModalState {
  isOpen: boolean;
  message: Message | null;
}

interface UseReactionsOptions {
  selectedServerId: string | null;
  currentUser: User | null;
}

interface UseReactionsReturn {
  reactionModal: ReactionModalState;
  openReactionModal: (message: Message) => void;
  closeReactionModal: () => void;
  selectReaction: (emoji: string) => void;
  directReaction: (emoji: string, message: Message) => void;
  unreact: (emoji: string, message: Message) => void;
}

/**
 * Manages message reactions and reaction modal state
 */
export function useReactions({
  selectedServerId,
  currentUser,
}: UseReactionsOptions): UseReactionsReturn {
  const { servers } = useStore();

  const [reactionModal, setReactionModal] = useState<ReactionModalState>({
    isOpen: false,
    message: null,
  });

  /**
   * Open reaction modal for a message
   */
  const openReactionModal = useCallback((message: Message) => {
    setReactionModal({
      isOpen: true,
      message,
    });
  }, []);

  /**
   * Close reaction modal
   */
  const closeReactionModal = useCallback(() => {
    setReactionModal({
      isOpen: false,
      message: null,
    });
  }, []);

  /**
   * Find server and channel for a message
   */
  const findServerAndChannel = useCallback(
    (
      message: Message,
    ): { server: Server | undefined; channel: Channel | undefined } => {
      const server = servers.find((s) => s.id === message.serverId);
      const channel = server?.channels.find((c) => c.id === message.channelId);
      return { server, channel };
    },
    [servers],
  );

  /**
   * Select reaction from modal (toggle if already reacted)
   */
  const selectReaction = useCallback(
    (emoji: string) => {
      if (!reactionModal.message?.msgid) {
        closeReactionModal();
        return;
      }

      const { server, channel } = findServerAndChannel(reactionModal.message);

      if (server && channel) {
        // Check if user has already reacted with this emoji
        const existingReaction = reactionModal.message.reactions.find(
          (r) => r.emoji === emoji && r.userId === currentUser?.username,
        );

        if (existingReaction) {
          // Send unreact message
          const tagMsg = `@+draft/unreact=${emoji};+draft/reply=${reactionModal.message.msgid} TAGMSG ${channel.name}`;
          ircClient.sendRaw(server.id, tagMsg);
        } else {
          // Send react message
          const tagMsg = `@+draft/react=${emoji};+draft/reply=${reactionModal.message.msgid} TAGMSG ${channel.name}`;
          ircClient.sendRaw(server.id, tagMsg);
        }
      }

      closeReactionModal();
    },
    [
      reactionModal.message,
      currentUser,
      findServerAndChannel,
      closeReactionModal,
    ],
  );

  /**
   * Add a direct reaction to a message (without modal)
   */
  const directReaction = useCallback(
    (emoji: string, message: Message) => {
      if (!message.msgid || !selectedServerId) return;

      const { server, channel } = findServerAndChannel(message);

      if (server && channel) {
        const tagMsg = `@+draft/react=${emoji};+draft/reply=${message.msgid} TAGMSG ${channel.name}`;
        ircClient.sendRaw(server.id, tagMsg);
      }
    },
    [selectedServerId, findServerAndChannel],
  );

  /**
   * Remove a reaction from a message
   */
  const unreact = useCallback(
    (emoji: string, message: Message) => {
      if (!message.msgid || !selectedServerId) return;

      const { server, channel } = findServerAndChannel(message);

      if (server && channel) {
        const tagMsg = `@+draft/unreact=${emoji};+draft/reply=${message.msgid} TAGMSG ${channel.name}`;
        ircClient.sendRaw(server.id, tagMsg);
      }
    },
    [selectedServerId, findServerAndChannel],
  );

  return {
    reactionModal,
    openReactionModal,
    closeReactionModal,
    selectReaction,
    directReaction,
    unreact,
  };
}
