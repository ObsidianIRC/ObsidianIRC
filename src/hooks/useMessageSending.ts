/**
 * Hook for handling message sending logic including IRC commands,
 * multiline messages, and protocol formatting
 */
import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import ircClient from "../lib/ircClient";
import {
  type FormattingType,
  formatMessageForIrc,
} from "../lib/messageFormatter";
import { createBatchId, splitLongMessage } from "../lib/messageProtocol";
import useStore, { serverSupportsMultiline } from "../store";
import type { Channel, Message, PrivateChat, User } from "../types";

interface UseMessageSendingOptions {
  selectedServerId: string | null;
  selectedChannelId: string | null;
  selectedPrivateChatId: string | null;
  selectedChannel: Channel | null;
  selectedPrivateChat: PrivateChat | null;
  currentUser: User | null;
  selectedColor: string | null;
  selectedFormatting: FormattingType[];
  localReplyTo: Message | null;
}

interface UseMessageSendingReturn {
  sendMessage: (text: string) => void;
}

/**
 * Handles all message sending logic including commands and multiline
 */
export function useMessageSending({
  selectedServerId,
  selectedChannelId,
  selectedPrivateChatId,
  selectedChannel,
  selectedPrivateChat,
  currentUser,
  selectedColor,
  selectedFormatting,
  localReplyTo,
}: UseMessageSendingOptions): UseMessageSendingReturn {
  const { globalSettings } = useStore();

  /**
   * Handle IRC commands like /join, /part, /nick, etc.
   */
  const handleCommand = useCallback(
    (cleanedText: string) => {
      if (!selectedServerId) return;

      const command = cleanedText.substring(1).trim();
      const [commandName, ...args] = command.split(" ");

      if (commandName === "nick") {
        ircClient.sendRaw(selectedServerId, `NICK ${args[0]}`);
      } else if (commandName === "join") {
        if (args[0]) {
          ircClient.joinChannel(selectedServerId, args[0]);
          ircClient.triggerEvent("JOIN", {
            serverId: selectedServerId,
            username: currentUser?.username || "",
            channelName: args[0],
          });
        } else {
          console.error("No channel specified for /join command");
        }
      } else if (commandName === "part") {
        ircClient.leaveChannel(selectedServerId, args[0]);
        ircClient.triggerEvent("PART", {
          serverId: selectedServerId,
          username: currentUser?.username || "",
          channelName: args[0],
        });
      } else if (commandName === "msg") {
        const [target, ...messageParts] = args;
        const message = messageParts.join(" ");
        ircClient.sendRaw(selectedServerId, `PRIVMSG ${target} :${message}`);
      } else if (commandName === "me") {
        const actionMessage = cleanedText.substring(4).trim();
        ircClient.sendRaw(
          selectedServerId,
          `PRIVMSG ${selectedChannel?.name || ""} :\u0001ACTION ${actionMessage}\u0001`,
        );
      } else {
        const fullCommand =
          args.length > 0 ? `${commandName} ${args.join(" ")}` : commandName;
        ircClient.sendRaw(selectedServerId, fullCommand);
      }
    },
    [selectedServerId, selectedChannel, currentUser],
  );

  /**
   * Send a multiline message using BATCH protocol
   */
  const sendMultilineMessage = useCallback(
    (cleanedText: string, target: string, lines: string[]) => {
      if (!selectedServerId) return;

      const batchId = createBatchId();
      const replyPrefix = localReplyTo
        ? `@+draft/reply=${localReplyTo.msgid};`
        : "";

      ircClient.sendRaw(
        selectedServerId,
        `${replyPrefix}BATCH +${batchId} draft/multiline ${target}`,
      );

      const hasMultipleLines = lines.length > 1;

      if (hasMultipleLines) {
        // Multi-line message (preserve line breaks)
        lines.forEach((line) => {
          const formattedLine = formatMessageForIrc(line, {
            color: selectedColor || "inherit",
            formatting: selectedFormatting,
          });

          const maxLineLengthForTarget =
            512 -
            (1 + 20 + 1 + 20 + 1 + 63 + 1 + 7 + 1 + target.length + 2 + 2) -
            10;

          if (formattedLine.length > maxLineLengthForTarget) {
            const splitLines = splitLongMessage(formattedLine, target);
            splitLines.forEach((splitLine: string, index: number) => {
              if (index === 0) {
                ircClient.sendRaw(
                  selectedServerId,
                  `@batch=${batchId} PRIVMSG ${target} :${splitLine}`,
                );
              } else {
                ircClient.sendRaw(
                  selectedServerId,
                  `@batch=${batchId};draft/multiline-concat PRIVMSG ${target} :${splitLine}`,
                );
              }
            });
          } else {
            ircClient.sendRaw(
              selectedServerId,
              `@batch=${batchId} PRIVMSG ${target} :${formattedLine}`,
            );
          }
        });
      } else {
        // Single very long line (split and concat)
        const formattedText = formatMessageForIrc(cleanedText, {
          color: selectedColor || "inherit",
          formatting: selectedFormatting,
        });

        const splitLines = splitLongMessage(formattedText, target);
        splitLines.forEach((splitLine: string, index: number) => {
          if (index === 0) {
            ircClient.sendRaw(
              selectedServerId,
              `@batch=${batchId} PRIVMSG ${target} :${splitLine}`,
            );
          } else {
            ircClient.sendRaw(
              selectedServerId,
              `@batch=${batchId};draft/multiline-concat PRIVMSG ${target} :${splitLine}`,
            );
          }
        });
      }

      ircClient.sendRaw(selectedServerId, `BATCH -${batchId}`);
    },
    [selectedServerId, selectedColor, selectedFormatting, localReplyTo],
  );

  /**
   * Send multiline fallback when server doesn't support BATCH
   */
  const sendMultilineFallback = useCallback(
    (lines: string[], target: string) => {
      if (!selectedServerId) return;

      if (globalSettings.autoFallbackToSingleLine) {
        // Concatenate with spaces and send as single message
        const combinedText = lines.join(" ");
        const formattedText = formatMessageForIrc(combinedText, {
          color: selectedColor || "inherit",
          formatting: selectedFormatting,
        });

        const splitLines = splitLongMessage(formattedText, target);
        splitLines.forEach((line: string) => {
          ircClient.sendRaw(
            selectedServerId,
            `${localReplyTo ? `@+draft/reply=${localReplyTo.msgid};` : ""} PRIVMSG ${target} :${line}`,
          );
        });
      } else {
        // Send as separate messages
        lines.forEach((line) => {
          const formattedLine = formatMessageForIrc(line, {
            color: selectedColor || "inherit",
            formatting: selectedFormatting,
          });

          const splitLines = splitLongMessage(formattedLine, target);
          splitLines.forEach((splitLine: string) => {
            ircClient.sendRaw(
              selectedServerId,
              `${localReplyTo ? `@+draft/reply=${localReplyTo.msgid};` : ""} PRIVMSG ${target} :${splitLine}`,
            );
          });
        });
      }
    },
    [
      selectedServerId,
      selectedColor,
      selectedFormatting,
      localReplyTo,
      globalSettings,
    ],
  );

  /**
   * Send a regular single message
   */
  const sendRegularMessage = useCallback(
    (cleanedText: string, target: string) => {
      if (!selectedServerId) return;

      const formattedText = formatMessageForIrc(cleanedText, {
        color: selectedColor || "inherit",
        formatting: selectedFormatting,
      });

      const splitLines = splitLongMessage(formattedText, target);
      splitLines.forEach((line: string) => {
        ircClient.sendRaw(
          selectedServerId,
          `${localReplyTo ? `@+draft/reply=${localReplyTo.msgid};` : ""} PRIVMSG ${target} :${line}`,
        );
      });
    },
    [selectedServerId, selectedColor, selectedFormatting, localReplyTo],
  );

  /**
   * Main send message function
   */
  const sendMessage = useCallback(
    (text: string) => {
      const cleanedText = text.replace(/\n+$/, "");

      if (cleanedText.trim() === "") return;
      if (!selectedServerId || (!selectedChannelId && !selectedPrivateChatId))
        return;

      // Handle commands
      if (cleanedText.startsWith("/")) {
        handleCommand(cleanedText);
        return;
      }

      // Handle regular messages
      const target =
        selectedChannel?.name ?? selectedPrivateChat?.username ?? "";
      if (!target) return;

      const lines = cleanedText.split("\n");
      const supportsMultiline = serverSupportsMultiline(selectedServerId);
      const hasMultipleLines = lines.length > 1;

      // Calculate message length limits
      const maxMessageLength =
        512 -
        (1 + 20 + 1 + 20 + 1 + 63 + 1 + 7 + 1 + target.length + 2 + 2) -
        10;
      const isSingleLongLine =
        lines.length === 1 && cleanedText.length > maxMessageLength;

      // Determine sending strategy
      if (supportsMultiline && (hasMultipleLines || isSingleLongLine)) {
        sendMultilineMessage(cleanedText, target, lines);
      } else if (hasMultipleLines && !supportsMultiline) {
        sendMultilineFallback(lines, target);
      } else {
        sendRegularMessage(cleanedText, target);
      }

      // For private messages, manually add our own message to the chat
      // since the server doesn't echo private messages back to us
      if (selectedPrivateChat && currentUser) {
        const outgoingMessage: Message = {
          id: uuidv4(),
          content: cleanedText,
          timestamp: new Date(),
          userId: currentUser.username || currentUser.id,
          channelId: selectedPrivateChat.id,
          serverId: selectedServerId,
          type: "message" as const,
          reactions: [],
          replyMessage: localReplyTo,
          mentioned: [],
        };

        const { addMessage } = useStore.getState();
        addMessage(outgoingMessage);
      }
    },
    [
      selectedServerId,
      selectedChannelId,
      selectedPrivateChatId,
      selectedChannel,
      selectedPrivateChat,
      currentUser,
      localReplyTo,
      handleCommand,
      sendMultilineMessage,
      sendMultilineFallback,
      sendRegularMessage,
    ],
  );

  return {
    sendMessage,
  };
}
