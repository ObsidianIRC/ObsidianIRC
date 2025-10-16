/**
 * Hook for managing message reactions and reaction modal
 */
import { useCallback, useState } from "react";
import ircClient from "../lib/ircClient";
import useStore from "../store";
import type { Message, Server, User } from "../types";

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
   * Find server and target for a message (channel name or username for private)
   */
  const findServerAndTarget = useCallback(
    (message: Message): { server: Server | undefined; target: string | undefined } => {
      const server = servers.find((s) => s.id === message.serverId);
      if (!server) return { server: undefined, target: undefined };

      if (message.channelId) {
        const channel = server.channels.find((c) => c.id === message.channelId);
        return { server, target: channel?.name };
      }
        // Private message
        const privateChat = server.privateChats?.find((pc) => pc.username === message.userId.split("-")[0]);
        return { server, target: privateChat?.username };
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

      const { server, target } = findServerAndTarget(reactionModal.message);

      if (server && target) {
        // Check if user has already reacted with this emoji
        const existingReaction = reactionModal.message.reactions.find(
          (r) => r.emoji === emoji && r.userId === currentUser?.username,
        );

        if (existingReaction) {
          // Send unreact message
          const tagMsg = `@+draft/unreact=${emoji};+draft/reply=${reactionModal.message.msgid} TAGMSG ${target}`;
          ircClient.sendRaw(server.id, tagMsg);
        } else {
          // Send react message
          const tagMsg = `@+draft/react=${emoji};+draft/reply=${reactionModal.message.msgid} TAGMSG ${target}`;
          ircClient.sendRaw(server.id, tagMsg);
        }
      }

      closeReactionModal();
    },
    [
      reactionModal.message,
      currentUser,
      findServerAndTarget,
      closeReactionModal,
    ],
  );

  /**
   * Add a direct reaction to a message (without modal)
   */
  const directReaction = useCallback(
    (emoji: string, message: Message) => {
      if (!message.msgid || !selectedServerId) return;

      const { server, target } = findServerAndTarget(message);

      if (server && target) {
        const tagMsg = `@+draft/react=${emoji};+draft/reply=${message.msgid} TAGMSG ${target}`;
        ircClient.sendRaw(server.id, tagMsg);
      }
    },
    [selectedServerId, findServerAndTarget],
  );

  /**
   * Remove a reaction from a message
   */
  const unreact = useCallback(
    (emoji: string, message: Message) => {
      if (!message.msgid || !selectedServerId) return;

      const { server, target } = findServerAndTarget(message);

      if (server && target) {
        const tagMsg = `@+draft/unreact=${emoji};+draft/reply=${message.msgid} TAGMSG ${target}`;
        ircClient.sendRaw(server.id, tagMsg);
      }
    },
    [selectedServerId, findServerAndTarget],
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
