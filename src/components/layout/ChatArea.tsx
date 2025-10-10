import { UsersIcon } from "@heroicons/react/24/solid";
import { platform } from "@tauri-apps/plugin-os";
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaArrowDown,
  FaAt,
  FaBell,
  FaChevronLeft,
  FaChevronRight,
  FaEdit,
  FaGift,
  FaGrinAlt,
  FaHashtag,
  FaList,
  FaPenAlt,
  FaPlus,
  FaSearch,
  FaTimes,
  FaUserPlus,
} from "react-icons/fa";
import { v4 as uuidv4 } from "uuid";
import { useEmojiCompletion } from "../../hooks/useEmojiCompletion";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useTabCompletion } from "../../hooks/useTabCompletion";
import { groupConsecutiveEvents } from "../../lib/eventGrouping";
import ircClient from "../../lib/ircClient";
import { parseIrcUrl } from "../../lib/ircUrlParser";
import { getChannelAvatarUrl, getChannelDisplayName } from "../../lib/ircUtils";
import {
  type FormattingType,
  formatMessageForIrc,
  getPreviewStyles,
  isValidFormattingType,
} from "../../lib/messageFormatter";
import useStore, { serverSupportsMultiline } from "../../store";
import type { Message as MessageType, User } from "../../types";
import { CollapsedEventMessage } from "../message/CollapsedEventMessage";
import { MessageItem } from "../message/MessageItem";
import AutocompleteDropdown from "../ui/AutocompleteDropdown";
import BlankPage from "../ui/BlankPage";
import ChannelSettingsModal from "../ui/ChannelSettingsModal";
import ColorPicker from "../ui/ColorPicker";
import EmojiAutocompleteDropdown from "../ui/EmojiAutocompleteDropdown";
import GifSelector from "../ui/GifSelector";
import DiscoverGrid from "../ui/HomeScreen";
import LoadingSpinner from "../ui/LoadingSpinner";
import ModerationModal, { type ModerationAction } from "../ui/ModerationModal";
import ReactionModal from "../ui/ReactionModal";
import UserContextMenu from "../ui/UserContextMenu";

const EMPTY_ARRAY: User[] = [];
let lastTypingTime = 0;

// Helper function to split long messages while respecting IRC protocol limits
const splitLongMessage = (message: string, target = "#channel"): string[] => {
  // Calculate IRC protocol overhead for a PRIVMSG (excluding message tags)
  // Format: :nick!user@host PRIVMSG #target :message\r\n
  // Message tags don't count toward the 512-byte limit

  // Conservative estimates for variable parts (as per IRC spec recommendations)
  const maxNickLength = 20;
  const maxUserLength = 20;
  const maxHostLength = 63;
  const targetLength = target.length;

  // Fixed protocol parts (excluding tags)
  const protocolOverhead =
    1 + // ':'
    maxNickLength +
    1 + // '!'
    maxUserLength +
    1 + // '@'
    maxHostLength +
    1 + // ' '
    7 + // 'PRIVMSG'
    1 + // ' '
    targetLength +
    2 + // ' :'
    2; // '\r\n'

  const safetyBuffer = 10; // Small safety margin

  // Available space for the actual message content
  const maxMessageLength = 512 - protocolOverhead - safetyBuffer;

  if (message.length <= maxMessageLength) {
    return [message];
  }

  const lines: string[] = [];
  let currentLine = "";
  const words = message.split(" ");

  for (const word of words) {
    if (word.length > maxMessageLength) {
      // If a single word is too long, we have to break it
      if (currentLine) {
        lines.push(currentLine.trim());
        currentLine = "";
      }

      // Split the long word
      for (let i = 0; i < word.length; i += maxMessageLength) {
        lines.push(word.slice(i, i + maxMessageLength));
      }
    } else if (`${currentLine} ${word}`.length > maxMessageLength) {
      // Adding this word would exceed the limit
      if (currentLine) {
        lines.push(currentLine.trim());
      }
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }

  if (currentLine) {
    lines.push(currentLine.trim());
  }

  return lines.filter((line) => line.length > 0);
};

export const TypingIndicator: React.FC<{
  serverId: string;
  channelId: string;
}> = ({ serverId, channelId }) => {
  const key = `${serverId}-${channelId}`;

  const typingUsers = useStore(
    (state) => state.typingUsers[key] ?? EMPTY_ARRAY,
  );

  let message = "";
  if (typingUsers.length === 1) {
    message = `${typingUsers[0].username} is typing...`;
  } else if (typingUsers.length === 2) {
    message = `${typingUsers[0].username} and ${typingUsers[1].username} are typing...`;
  } else if (typingUsers.length === 3) {
    message = `${typingUsers[0].username}, ${typingUsers[1].username} and ${typingUsers[2].username} are typing...`;
  } else if (typingUsers.length > 3) {
    message = `${typingUsers[0].username}, ${typingUsers[1].username}, ${typingUsers[2].username} and ${typingUsers.length - 3} others are typing...`;
  }

  return <div className="h-5 ml-5 text-sm italic">{message}</div>;
};

export const ChatArea: React.FC<{
  onToggleChanList: () => void;
  isChanListVisible: boolean;
}> = ({ onToggleChanList, isChanListVisible }) => {
  const [localReplyTo, setLocalReplyTo] = useState<MessageType | null>(null);
  const [messageText, setMessageText] = useState("");
  const [isEmojiSelectorOpen, setIsEmojiSelectorOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedFormatting, setSelectedFormatting] = useState<
    FormattingType[]
  >([]);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [isFormattingInitialized, setIsFormattingInitialized] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [showEmojiAutocomplete, setShowEmojiAutocomplete] = useState(false);
  const [showMembersDropdown, setShowMembersDropdown] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [isGifSelectorOpen, setIsGifSelectorOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<{
    isOpen: boolean;
    file: File | null;
    previewUrl: string | null;
  }>({
    isOpen: false,
    file: null,
    previewUrl: null,
  });
  const [isServerNoticesPoppedOut, setIsServerNoticesPoppedOut] =
    useState(false);
  const [serverNoticesPopupPosition, setServerNoticesPopupPosition] = useState({
    x: 16,
    y: 16,
  }); // 1rem = 16px
  const serverNoticesScrollRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScrollServerNotices, setShouldAutoScrollServerNotices] =
    useState(true);

  const handleServerNoticesScroll = () => {
    if (serverNoticesScrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        serverNoticesScrollRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10; // 10px tolerance
      setShouldAutoScrollServerNotices(isAtBottom);
    }
  };
  const [isDraggingServerNotices, setIsDraggingServerNotices] = useState(false);
  const [serverNoticesDragStart, setServerNoticesDragStart] = useState({
    x: 0,
    y: 0,
  });
  const [userContextMenu, setUserContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    username: string;
    serverId: string;
    channelId: string;
    userStatusInChannel?: string;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    username: "",
    serverId: "",
    channelId: "",
  });
  const [reactionModal, setReactionModal] = useState<{
    isOpen: boolean;
    message: MessageType | null;
  }>({
    isOpen: false,
    message: null,
  });
  const [moderationModal, setModerationModal] = useState<{
    isOpen: boolean;
    action: ModerationAction;
    username: string;
  }>({
    isOpen: false,
    action: "warn",
    username: "",
  });
  const [channelSettingsModalOpen, setChannelSettingsModalOpen] =
    useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    servers,
    ui: {
      selectedServerId,
      selectedChannelId,
      selectedPrivateChatId,
      isMemberListVisible,
      isSettingsModalOpen,
      isUserProfileModalOpen,
      isAddServerModalOpen,
      isChannelListModalOpen,
      isChannelRenameModalOpen,
      isServerNoticesPopupOpen,
    },
    toggleMemberList,
    openPrivateChat,
    messages,
    connect,
    joinChannel,
    toggleAddServerModal,
    redactMessage,
    globalSettings,
    warnUser,
    kickUser,
    banUserByNick,
    banUserByHostmask,
  } = useStore();

  const isMobile = useMediaQuery("(max-width: 768px)");

  // Get the current user for the selected server with metadata from store
  const currentUser = useMemo(() => {
    if (!selectedServerId) return null;

    // Get the current user's username from IRCClient
    const ircCurrentUser = ircClient.getCurrentUser(selectedServerId);
    if (!ircCurrentUser) return null;

    // Find the current user in the server's channel data to get metadata
    const selectedServer = servers.find((s) => s.id === selectedServerId);
    if (!selectedServer) return ircCurrentUser;

    // Look for the user in any channel to get their metadata
    for (const channel of selectedServer.channels) {
      const userWithMetadata = channel.users.find(
        (u) => u.username === ircCurrentUser.username,
      );
      if (userWithMetadata) {
        return userWithMetadata;
      }
    }

    // If not found in channels, return the basic IRC user
    return ircCurrentUser;
  }, [selectedServerId, servers]);

  // Auto-scroll server notices popup when new messages arrive
  useEffect(() => {
    if (shouldAutoScrollServerNotices && serverNoticesScrollRef.current) {
      serverNoticesScrollRef.current.scrollTop =
        serverNoticesScrollRef.current.scrollHeight;
    }
  }, [shouldAutoScrollServerNotices]);

  // Scroll to bottom when popup is first opened
  useEffect(() => {
    if (isServerNoticesPoppedOut && serverNoticesScrollRef.current) {
      serverNoticesScrollRef.current.scrollTop =
        serverNoticesScrollRef.current.scrollHeight;
      setShouldAutoScrollServerNotices(true); // Enable auto-scroll for future messages
    }
  }, [isServerNoticesPoppedOut]);

  // Get current user's status in the selected channel
  const currentUserStatus = useMemo(() => {
    if (!selectedServerId || !selectedChannelId) return undefined;

    const selectedServer = servers.find((s) => s.id === selectedServerId);
    const selectedChannel = selectedServer?.channels.find(
      (c) => c.id === selectedChannelId,
    );

    if (!selectedChannel || !currentUser) return undefined;

    const userInChannel = selectedChannel.users.find(
      (u) => u.username === currentUser.username,
    );

    return userInChannel?.status;
  }, [selectedServerId, selectedChannelId, servers, currentUser]);

  // Tab completion hook
  const tabCompletion = useTabCompletion();

  // Emoji completion hook
  const emojiCompletion = useEmojiCompletion();

  const handleIrcLinkClick = (rawUrl: string) => {
    const parsed = parseIrcUrl(rawUrl, currentUser?.username || "user");

    // Open the connect modal with pre-filled server details
    toggleAddServerModal(true, {
      name: parsed.host,
      host: parsed.host,
      port: parsed.port.toString(),
      nickname: parsed.nick || "user",
    });
  };

  // Load saved settings from local storage on mount
  useEffect(() => {
    const savedColor = localStorage.getItem("selectedColor");
    const savedFormatting = localStorage.getItem("selectedFormatting");

    if (savedColor) {
      setSelectedColor(savedColor); // Apply the saved color
    }

    if (savedFormatting) {
      try {
        const parsedFormatting = JSON.parse(savedFormatting);
        if (Array.isArray(parsedFormatting)) {
          // Validate that all items are valid formatting types
          const validFormatting = parsedFormatting.filter(
            isValidFormattingType,
          );
          setSelectedFormatting(validFormatting); // Apply the saved formatting
          setIsFormattingInitialized(true); // Mark formatting as initialized
        }
      } catch (error) {
        console.error("Failed to parse saved formatting:", error);
        setSelectedFormatting([]); // Fallback to an empty array
        setIsFormattingInitialized(true); // Mark formatting as initialized
      }
    } else {
      setIsFormattingInitialized(true); // Mark formatting as initialized even if nothing is saved
    }
  }, []);

  // Save selectedColor to local storage whenever it changes
  useEffect(() => {
    if (selectedColor) {
      localStorage.setItem("selectedColor", selectedColor);
    }
  }, [selectedColor]);

  // Save selectedFormatting to local storage whenever it changes
  useEffect(() => {
    if (isFormattingInitialized) {
      localStorage.setItem(
        "selectedFormatting",
        JSON.stringify(selectedFormatting),
      );
    }
  }, [selectedFormatting, isFormattingInitialized]);

  // Get selected server and channel/private chat - memoized to prevent re-renders
  const selectedServer = useMemo(
    () => servers.find((s) => s.id === selectedServerId),
    [servers, selectedServerId],
  );

  const selectedChannel = useMemo(
    () => selectedServer?.channels.find((c) => c.id === selectedChannelId),
    [selectedServer, selectedChannelId],
  );

  const selectedPrivateChat = useMemo(
    () =>
      selectedServer?.privateChats?.find(
        (pc) => pc.id === selectedPrivateChatId,
      ),
    [selectedServer, selectedPrivateChatId],
  );

  // Get messages for current channel or private chat - memoized
  const channelKey = useMemo(
    () =>
      selectedServerId && (selectedChannelId || selectedPrivateChatId)
        ? `${selectedServerId}-${selectedChannelId || selectedPrivateChatId}`
        : "",
    [selectedServerId, selectedChannelId, selectedPrivateChatId],
  );

  const channelMessages = useMemo(
    () => (channelKey ? messages[channelKey] || [] : []),
    [messages, channelKey],
  );

  // Memoize grouped events to prevent recalculation on every render
  const eventGroups = useMemo(
    () => groupConsecutiveEvents(channelMessages),
    [channelMessages],
  );

  const scrollDown = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    // Force complete scroll after animation
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, 500);
  };

  // Scroll down on channel change
  // biome-ignore lint/correctness/useExhaustiveDependencies(selectedServerId): We want to scroll down only if server or channel changes
  // biome-ignore lint/correctness/useExhaustiveDependencies(selectedChannelId): We want to scroll down only if server or channel changes
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [selectedServerId, selectedChannelId]);

  // Auto scroll to bottom on new messages
  useEffect(() => {
    if (isScrolledUp) return;
    scrollDown();
  });

  // Check if scrolled away from bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const checkIfScrolledToBottom = () => {
      const atBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        30;
      setIsScrolledUp(!atBottom);
    };

    container.addEventListener("scroll", checkIfScrolledToBottom);
    return () =>
      container.removeEventListener("scroll", checkIfScrolledToBottom);
  }, []);

  // Close plus menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showPlusMenu && !(event.target as Element).closest(".plus-menu")) {
        setShowPlusMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPlusMenu]);

  const handleSendMessage = () => {
    // Clean the message text of any trailing newlines that might have been added
    const cleanedText = messageText.replace(/\n+$/, "");

    if (cleanedText.trim() === "") return;
    scrollDown();
    if (selectedServerId && (selectedChannelId || selectedPrivateChatId)) {
      if (cleanedText.startsWith("/")) {
        // Handle command
        const command = cleanedText.substring(1).trim();
        const [commandName, ...args] = command.split(" ");
        if (commandName === "nick") {
          ircClient.sendRaw(selectedServerId, `NICK ${args[0]}`);
        } else if (commandName === "join") {
          if (args[0]) {
            ircClient.joinChannel(selectedServerId, args[0]);
            ircClient.triggerEvent("JOIN", {
              serverId: selectedServerId,
              username: currentUser?.username ? currentUser.username : "",
              channelName: args[0],
            });
          } else {
            // Handle error: no channel specified
            console.error("No channel specified for /join command");
          }
        } else if (commandName === "part") {
          ircClient.leaveChannel(selectedServerId, args[0]);
          ircClient.triggerEvent("PART", {
            serverId: selectedServerId,
            username: currentUser?.username ? currentUser.username : "",
            channelName: args[0],
          });
        } else if (commandName === "msg") {
          const [target, ...messageParts] = args;
          const message = messageParts.join(" ");
          ircClient.sendRaw(selectedServerId, `PRIVMSG ${target} :${message}`);
        } else if (commandName === "whisper") {
          // /whisper <username> <message>
          // Sends a private message visible only to the user but in the current channel context
          if (!selectedChannel) {
            console.error("Whispers can only be sent in channels");
            return;
          }
          const [targetUser, ...messageParts] = args;
          if (!targetUser || messageParts.length === 0) {
            console.error("Usage: /whisper <username> <message>");
            return;
          }
          const message = messageParts.join(" ");
          ircClient.sendWhisper(
            selectedServerId,
            targetUser,
            selectedChannel.name,
            message,
          );
        } else if (commandName === "me") {
          const actionMessage = cleanedText.substring(4).trim();
          ircClient.sendRaw(
            selectedServerId,
            `PRIVMSG ${selectedChannel ? selectedChannel.name : ""} :\u0001ACTION ${actionMessage}\u0001`,
          );
        } else {
          const fullCommand =
            args.length > 0 ? `${commandName} ${args.join(" ")}` : commandName;
          ircClient.sendRaw(selectedServerId, fullCommand);
        }
      } else {
        // Determine target: channel name or username for private messages
        const target =
          selectedChannel?.name ?? selectedPrivateChat?.username ?? "";

        // Check if message contains newlines or is very long
        const lines = cleanedText.split("\n");
        const supportsMultiline = serverSupportsMultiline(selectedServerId);
        const hasMultipleLines = lines.length > 1;

        // Calculate the same limit as splitLongMessage for consistency
        const maxNickLength = 20;
        const maxUserLength = 20;
        const maxHostLength = 63;
        const protocolOverhead =
          1 +
          maxNickLength +
          1 +
          maxUserLength +
          1 +
          maxHostLength +
          1 +
          7 +
          1 +
          target.length +
          2 +
          2;
        const maxMessageLength = 512 - protocolOverhead - 10; // 10 byte safety buffer
        const isSingleLongLine =
          lines.length === 1 && cleanedText.length > maxMessageLength;

        if (supportsMultiline && (hasMultipleLines || isSingleLongLine)) {
          // Send as multiline message using BATCH
          const batchId = `ml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const replyPrefix = localReplyTo
            ? `@+draft/reply=${localReplyTo.msgid};`
            : "";
          ircClient.sendRaw(
            selectedServerId,
            `${replyPrefix}BATCH +${batchId} draft/multiline ${target}`,
          );

          if (hasMultipleLines) {
            // Case 1: Multi-line message (preserve line breaks)
            lines.forEach((line) => {
              const formattedLine = formatMessageForIrc(line, {
                color: selectedColor || "inherit",
                formatting: selectedFormatting,
              });

              // Check if this individual line is too long and needs splitting
              const maxLineLengthForTarget =
                512 -
                (1 + 20 + 1 + 20 + 1 + 63 + 1 + 7 + 1 + target.length + 2 + 2) -
                10;
              if (formattedLine.length > maxLineLengthForTarget) {
                const splitLines = splitLongMessage(formattedLine, target);
                splitLines.forEach((splitLine: string, index: number) => {
                  if (index === 0) {
                    // First part goes normally
                    ircClient.sendRaw(
                      selectedServerId,
                      `@batch=${batchId} PRIVMSG ${target} :${splitLine}`,
                    );
                  } else {
                    // Subsequent parts use multiline-concat to join without line break
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
            // Case 2: Single very long line (split and concat)
            const formattedText = formatMessageForIrc(cleanedText, {
              color: selectedColor || "inherit",
              formatting: selectedFormatting,
            });

            const splitLines = splitLongMessage(formattedText, target);
            splitLines.forEach((splitLine: string, index: number) => {
              if (index === 0) {
                // First part goes normally
                ircClient.sendRaw(
                  selectedServerId,
                  `@batch=${batchId} PRIVMSG ${target} :${splitLine}`,
                );
              } else {
                // Subsequent parts use multiline-concat to join without separation
                ircClient.sendRaw(
                  selectedServerId,
                  `@batch=${batchId};draft/multiline-concat PRIVMSG ${target} :${splitLine}`,
                );
              }
            });
          }

          ircClient.sendRaw(selectedServerId, `BATCH -${batchId}`);
        } else if (hasMultipleLines && !supportsMultiline) {
          // Handle fallback based on user preference
          if (globalSettings.autoFallbackToSingleLine) {
            // Concatenate with spaces and send as single message
            const combinedText = lines.join(" ");
            const formattedText = formatMessageForIrc(combinedText, {
              color: selectedColor || "inherit",
              formatting: selectedFormatting,
            });

            // Split if too long
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

              // Split long lines
              const splitLines = splitLongMessage(formattedLine, target);
              splitLines.forEach((splitLine: string) => {
                ircClient.sendRaw(
                  selectedServerId,
                  `${localReplyTo ? `@+draft/reply=${localReplyTo.msgid};` : ""} PRIVMSG ${target} :${splitLine}`,
                );
              });
            });
          }
        } else {
          // Send as regular single message
          const formattedText = formatMessageForIrc(cleanedText, {
            color: selectedColor || "inherit",
            formatting: selectedFormatting,
          });

          // Split if too long
          const splitLines = splitLongMessage(formattedText, target);
          splitLines.forEach((line: string) => {
            ircClient.sendRaw(
              selectedServerId,
              `${localReplyTo ? `@+draft/reply=${localReplyTo.msgid};` : ""} PRIVMSG ${target} :${line}`,
            );
          });
        }

        // For private messages, manually add our own message to the chat
        // since the server doesn't echo private messages back to us
        if (selectedPrivateChat && currentUser) {
          const outgoingMessage = {
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

          // Add the message to the store
          const { addMessage } = useStore.getState();
          addMessage(outgoingMessage);
        }
      }
      setMessageText("");
      setLocalReplyTo(null);
      setShowAutocomplete(false);
      if (tabCompletion.isActive) {
        tabCompletion.resetCompletion();
      }

      // Reset textarea height to initial single-line state
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
        // Use setTimeout to ensure the DOM has updated with empty value
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.style.height = "auto";
            // Calculate the proper height for empty input
            const scrollHeight = inputRef.current.scrollHeight;
            inputRef.current.style.height = `${scrollHeight}px`;
          }
        }, 0);
      }

      // Send typing done notification
      const storeState = useStore.getState();
      if (
        storeState.globalSettings.sendTypingNotifications &&
        (selectedChannel?.name || selectedPrivateChat?.username)
      ) {
        const target = selectedChannel?.name ?? selectedPrivateChat?.username;
        ircClient.sendTyping(
          selectedServerId as string,
          target as string,
          false,
        );
      }
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!selectedServer?.filehost) return;

    const formData = new FormData();
    formData.append("image", file);
    formData.append("filehost", selectedServer.filehost);

    try {
      // Use proxy for development to avoid CORS issues
      const uploadUrl = "/upload";

      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const data = await response.json();
      if (data.saved_url) {
        // Send the link directly to the current channel/user
        const target =
          selectedChannel?.name ?? selectedPrivateChat?.username ?? "";

        if (target) {
          // Send via IRC
          if (selectedServerId) {
            ircClient.sendRaw(
              selectedServerId,
              `PRIVMSG ${target} :${data.saved_url}`,
            );
          }

          // Add to store for immediate display (only for private chats, channels echo back)
          if (selectedPrivateChat && currentUser && selectedServerId) {
            const outgoingMessage = {
              id: uuidv4(),
              content: data.saved_url,
              timestamp: new Date(),
              userId: currentUser.username || currentUser.id,
              channelId: selectedPrivateChat.id,
              serverId: selectedServerId,
              type: "message" as const,
              reactions: [],
              replyMessage: null,
              mentioned: [],
            };

            const { addMessage } = useStore.getState();
            addMessage(outgoingMessage);
          }
        }
      }
    } catch (error) {
      console.error("Image upload failed:", error);
      // TODO: Show error to user
    }
  };

  const handleGifSend = (gifUrl: string) => {
    // Send the GIF URL directly to the current channel/user
    const target = selectedChannel?.name ?? selectedPrivateChat?.username ?? "";

    if (target && selectedServerId) {
      // Send via IRC
      ircClient.sendRaw(selectedServerId, `PRIVMSG ${target} :${gifUrl}`);

      // Add to store for immediate display (only for private chats, channels echo back)
      if (selectedPrivateChat && currentUser) {
        const outgoingMessage = {
          id: uuidv4(),
          content: gifUrl,
          timestamp: new Date(),
          userId: currentUser.username || currentUser.id,
          channelId: selectedPrivateChat.id,
          serverId: selectedServerId,
          type: "message" as const,
          reactions: [],
          replyMessage: null,
          mentioned: [],
        };

        const { addMessage } = useStore.getState();
        addMessage(outgoingMessage);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();

      // If emoji completion is already active, continue with emoji completion
      if (emojiCompletion.isActive) {
        handleEmojiCompletion();
      } else {
        // Check if we're starting emoji completion context
        const textBeforeCursor = messageText.substring(0, cursorPosition);
        const emojiMatch = textBeforeCursor.match(/:([a-zA-Z_]*)$/);

        if (emojiMatch) {
          handleEmojiCompletion();
        } else {
          handleTabCompletion();
        }
      }
      return;
    }

    // Handle keys when autocomplete dropdown is visible
    if (
      (showAutocomplete || showEmojiAutocomplete) &&
      (e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "Escape" ||
        e.key === "Enter" ||
        e.key === " ")
    ) {
      // Let the dropdown handle these keys, don't interfere
      return;
    }

    // Handle Enter key behavior based on settings
    if (e.key === "Enter") {
      const shouldCreateNewline =
        globalSettings.enableMultilineInput &&
        (globalSettings.multilineOnShiftEnter ? e.shiftKey : !e.shiftKey);

      if (shouldCreateNewline) {
        // Allow the default behavior (add newline)
        return;
      }

      // Prevent newline from being added before sending message
      e.preventDefault();

      // Force clear any newlines that might have been added to the textarea
      if (inputRef.current) {
        inputRef.current.value = messageText.trim();
      }

      handleSendMessage();
      // Send typing done notification
      const storeState = useStore.getState();
      if (storeState.globalSettings.sendTypingNotifications) {
        if (selectedChannel?.name) {
          ircClient.sendTyping(
            selectedServerId ?? "",
            selectedChannel.name,
            false,
          );
        } else if (selectedPrivateChat?.username) {
          ircClient.sendTyping(
            selectedServerId ?? "",
            selectedPrivateChat.username,
            false,
          );
        }
      }
      lastTypingTime = 0;
      return;
    }

    // Reset tab completion on any other key
    if (tabCompletion.isActive) {
      tabCompletion.resetCompletion();
    }
    setShowAutocomplete(false);
  };

  const handleTabCompletion = () => {
    if ((!selectedChannel && !selectedPrivateChat) || !inputRef.current) return;

    // For channels, use channel users; for private chats, use both participants
    const users =
      selectedChannel?.users ||
      (selectedPrivateChat
        ? [
            ...(currentUser ? [currentUser] : []),
            {
              id: `${selectedPrivateChat.serverId}-${selectedPrivateChat.username}`,
              username: selectedPrivateChat.username,
              isOnline: true,
            },
          ]
        : []);
    const result = tabCompletion.handleTabCompletion(
      messageText,
      cursorPosition,
      users,
    );

    if (result) {
      setMessageText(result.newText);
      setCursorPosition(result.newCursorPosition);

      // Show dropdown when there are any matches available
      const shouldShow = tabCompletion.matches.length > 0;
      setShowAutocomplete(shouldShow);

      // Update input cursor position
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(
            result.newCursorPosition,
            result.newCursorPosition,
          );
        }
      }, 0);
    } else {
      // No completion result, hide dropdown
      setShowAutocomplete(false);
    }
  };

  const handleEmojiCompletion = () => {
    if (!inputRef.current) return;

    const result = emojiCompletion.handleEmojiCompletion(
      messageText,
      cursorPosition,
    );

    if (result) {
      setMessageText(result.newText);
      setCursorPosition(result.newCursorPosition);

      // Show dropdown when there are any matches available
      const shouldShow = emojiCompletion.matches.length > 0;
      setShowEmojiAutocomplete(shouldShow);

      // Update input cursor position
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(
            result.newCursorPosition,
            result.newCursorPosition,
          );
        }
      }, 0);
    } else {
      // No completion result, hide dropdown
      setShowEmojiAutocomplete(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const newCursorPosition = e.target.selectionStart || 0;

    setMessageText(newText);
    setCursorPosition(newCursorPosition);
    handleUpdatedText(newText);

    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 128; // 8 lines (16px line height * 8)
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;

    // Reset tab completion if text changed from non-tab input
    if (tabCompletion.isActive) {
      tabCompletion.resetCompletion();
    }

    // Reset emoji completion if text changed from non-tab input
    if (emojiCompletion.isActive) {
      emojiCompletion.resetCompletion();
    }

    // Hide autocomplete when typing (only show on Tab completion)
    setShowAutocomplete(false);
    setShowEmojiAutocomplete(false);
  };

  const handleInputClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    const newCursorPos = target.selectionStart || 0;
    setCursorPosition(newCursorPos);
  };

  const handleUsernameSelect = (username: string) => {
    if (tabCompletion.isActive) {
      // Use tab completion state for accurate replacement
      const isAtMessageStart =
        tabCompletion.originalText
          .substring(0, tabCompletion.completionStart)
          .trim() === tabCompletion.originalPrefix;
      const suffix = isAtMessageStart ? ": " : " ";
      const newText =
        tabCompletion.originalText.substring(0, tabCompletion.completionStart) +
        username +
        suffix +
        tabCompletion.originalText.substring(
          tabCompletion.completionStart + tabCompletion.originalPrefix.length,
        );

      setMessageText(newText);
      const newCursorPosition =
        tabCompletion.completionStart + username.length + suffix.length;
      setCursorPosition(newCursorPosition);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(
            newCursorPosition,
            newCursorPosition,
          );
          inputRef.current.focus();
        }
      }, 0);
    } else {
      // Fallback to current logic when tab completion is not active
      const textBeforeCursor = messageText.substring(0, cursorPosition);
      const words = textBeforeCursor.split(/\s+/);
      const currentWord = words[words.length - 1];
      const completionStart = cursorPosition - currentWord.length;

      const isAtMessageStart = textBeforeCursor.trim() === currentWord;
      const suffix = isAtMessageStart ? ": " : " ";
      const newText =
        messageText.substring(0, completionStart) +
        username +
        suffix +
        messageText.substring(cursorPosition);

      setMessageText(newText);
      const newCursorPosition =
        completionStart + username.length + suffix.length;
      setCursorPosition(newCursorPosition);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(
            newCursorPosition,
            newCursorPosition,
          );
          inputRef.current.focus();
        }
      }, 0);
    }

    setShowAutocomplete(false);
    tabCompletion.resetCompletion();
  };

  const handleEmojiAutocompleteSelect = (emoji: string) => {
    if (emojiCompletion.isActive) {
      // Use emoji completion state for accurate replacement
      const newText =
        emojiCompletion.originalText.substring(
          0,
          emojiCompletion.completionStart,
        ) +
        emoji +
        emojiCompletion.originalText.substring(
          emojiCompletion.completionStart +
            emojiCompletion.originalPrefix.length,
        );

      setMessageText(newText);
      const newCursorPosition = emojiCompletion.completionStart + emoji.length;
      setCursorPosition(newCursorPosition);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(
            newCursorPosition,
            newCursorPosition,
          );
          inputRef.current.focus();
        }
      }, 0);
    }

    setShowEmojiAutocomplete(false);
    emojiCompletion.resetCompletion();
  };

  const handleEmojiAutocompleteClose = () => {
    setShowEmojiAutocomplete(false);
    emojiCompletion.resetCompletion();
  };

  const handleEmojiAutocompleteNavigate = (emoji: string) => {
    if (emojiCompletion.isActive) {
      // Find the index of the selected emoji to sync state
      const selectedIndex = emojiCompletion.matches.findIndex(
        (match) => match.emoji === emoji,
      );
      if (selectedIndex !== -1) {
        emojiCompletion.setCurrentIndex(selectedIndex);
      }

      // Update text in real-time like Tab completion does
      const newText =
        emojiCompletion.originalText.substring(
          0,
          emojiCompletion.completionStart,
        ) +
        emoji +
        emojiCompletion.originalText.substring(
          emojiCompletion.completionStart +
            emojiCompletion.originalPrefix.length,
        );

      setMessageText(newText);
      const newCursorPosition = emojiCompletion.completionStart + emoji.length;
      setCursorPosition(newCursorPosition);

      // Update the hook's internal previousTextRef to prevent reset on next tab
      emojiCompletion.updatePreviousText(newText);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(
            newCursorPosition,
            newCursorPosition,
          );
          inputRef.current.focus();
        }
      }, 0);
    }
  };

  const handleAutocompleteClose = () => {
    setShowAutocomplete(false);
    tabCompletion.resetCompletion();
  };

  const handleAutocompleteNavigate = (username: string) => {
    if (tabCompletion.isActive) {
      // Update text in real-time like Tab completion does
      const isAtMessageStart =
        tabCompletion.originalText
          .substring(0, tabCompletion.completionStart)
          .trim() === tabCompletion.originalPrefix;
      const suffix = isAtMessageStart ? ": " : " ";
      const newText =
        tabCompletion.originalText.substring(0, tabCompletion.completionStart) +
        username +
        suffix +
        tabCompletion.originalText.substring(
          tabCompletion.completionStart + tabCompletion.originalPrefix.length,
        );

      setMessageText(newText);
      const newCursorPosition =
        tabCompletion.completionStart + username.length + suffix.length;
      setCursorPosition(newCursorPosition);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(
            newCursorPosition,
            newCursorPosition,
          );
          inputRef.current.focus();
        }
      }, 0);
    }
  };

  const handleInputKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Skip if it was Tab key (handled by keyDown)
    if (e.key === "Tab") return;

    const target = e.target as HTMLTextAreaElement;
    const newCursorPos = target.selectionStart || 0;
    setCursorPosition(newCursorPos);
  };

  const handleUpdatedText = (text: string) => {
    // Check if typing notifications are enabled
    const { globalSettings } = useStore.getState();
    if (!globalSettings.sendTypingNotifications) return;

    if (text.length > 0 && text[0] !== "/") {
      const server = useStore
        .getState()
        .servers.find((s) => s.id === selectedServerId);
      if (!server) return;

      // Handle both channels and private chats
      const channel = server.channels.find((c) => c.id === selectedChannelId);
      const privateChat = server.privateChats?.find(
        (pc) => pc.id === selectedPrivateChatId,
      );
      const target = channel?.name ?? privateChat?.username;

      if (!target) return;

      const currentTime = Date.now();
      if (currentTime - lastTypingTime < 5000) return;

      lastTypingTime = currentTime;
      // Send typing active notification
      if (target) {
        ircClient.sendTyping(selectedServerId ?? "", target, true);
      }
    } else if (text.length === 0) {
      // Send typing done notification
      if (selectedChannel?.name || selectedPrivateChat?.username) {
        const target = selectedChannel?.name || selectedPrivateChat?.username;
        ircClient.sendTyping(
          selectedServerId as string,
          target as string,
          false,
        );
      }
      lastTypingTime = 0;
    }
  };

  const handleUsernameClick = (
    e: React.MouseEvent,
    username: string,
    serverId: string,
    channelId: string,
    avatarElement?: Element | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    // Don't show context menu for own username
    if (currentUser?.username === username) {
      return;
    }

    let x = e.clientX;
    let y = e.clientY;

    // If avatar element is provided, position menu relative to it
    if (avatarElement) {
      const rect = avatarElement.getBoundingClientRect();
      x = rect.left;
      y = rect.top - 5; // Position above the avatar with small gap
    }

    // Calculate user's status in the specific channel
    let userStatusInChannel: string | undefined;
    if (channelId && channelId !== "server-notices") {
      const selectedServer = servers.find((s) => s.id === serverId);
      const channel = selectedServer?.channels.find((c) => c.id === channelId);
      if (channel && currentUser) {
        const serverCurrentUser = ircClient.getCurrentUser(serverId);
        const userInChannel =
          channel.users.find(
            (u) =>
              u.username.toLowerCase() ===
              serverCurrentUser?.username.toLowerCase(),
          ) ||
          selectedServer?.users.find(
            (u) =>
              u.username.toLowerCase() ===
              serverCurrentUser?.username.toLowerCase(),
          );
        userStatusInChannel = userInChannel?.status;
      }
    }

    setUserContextMenu({
      isOpen: true,
      x,
      y,
      username,
      serverId,
      channelId,
      userStatusInChannel,
    });
  };

  const handleCloseUserContextMenu = () => {
    setUserContextMenu({
      isOpen: false,
      x: 0,
      y: 0,
      username: "",
      serverId: "",
      channelId: "",
    });
  };

  const handleOpenPM = (username: string) => {
    if (selectedServerId) {
      openPrivateChat(selectedServerId, username);
    }
  };

  // Server notices popup drag handlers
  const handleServerNoticesMouseDown = (e: React.MouseEvent) => {
    setIsDraggingServerNotices(true);
    setServerNoticesDragStart({
      x: e.clientX - serverNoticesPopupPosition.x,
      y: e.clientY - serverNoticesPopupPosition.y,
    });
  };

  const handleServerNoticesMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingServerNotices) return;

      const newX = e.clientX - serverNoticesDragStart.x;
      const newY = e.clientY - serverNoticesDragStart.y;

      // Constrain to viewport bounds (with some margin)
      const maxX = window.innerWidth - 620; // 600px width + 20px margin
      const maxY = window.innerHeight - 520; // 500px height + 20px margin

      setServerNoticesPopupPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    },
    [isDraggingServerNotices, serverNoticesDragStart],
  );

  const handleServerNoticesMouseUp = useCallback(() => {
    setIsDraggingServerNotices(false);
  }, []);

  // Server notices popup drag effect
  useEffect(() => {
    if (isDraggingServerNotices) {
      document.addEventListener("mousemove", handleServerNoticesMouseMove);
      document.addEventListener("mouseup", handleServerNoticesMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleServerNoticesMouseMove);
      document.removeEventListener("mouseup", handleServerNoticesMouseUp);
    };
  }, [
    isDraggingServerNotices,
    handleServerNoticesMouseMove,
    handleServerNoticesMouseUp,
  ]);

  const handleReactClick = (message: MessageType, buttonElement: Element) => {
    setReactionModal({
      isOpen: true,
      message,
    });
  };

  const handleCloseReactionModal = () => {
    setReactionModal({
      isOpen: false,
      message: null,
    });
  };

  const handleCloseModerationModal = () => {
    setModerationModal({
      isOpen: false,
      action: "warn",
      username: "",
    });
  };

  const handleModerationConfirm = (
    action: ModerationAction,
    reason: string,
  ) => {
    const { username } = moderationModal;
    switch (action) {
      case "warn":
        if (selectedServerId && selectedChannel?.name) {
          warnUser(selectedServerId, selectedChannel.name, username, reason);
        }
        break;
      case "kick":
        if (selectedServerId && selectedChannel?.name) {
          kickUser(selectedServerId, selectedChannel.name, username, reason);
        }
        break;
      case "ban-nick":
        if (selectedServerId && selectedChannel?.name) {
          banUserByNick(
            selectedServerId,
            selectedChannel.name,
            username,
            reason,
          );
        }
        break;
      case "ban-hostmask":
        if (selectedServerId && selectedChannel?.name) {
          banUserByHostmask(
            selectedServerId,
            selectedChannel.name,
            username,
            reason,
          );
        }
        break;
    }
    handleCloseModerationModal();
  };

  const handleReactionSelect = (emoji: string) => {
    if (reactionModal.message?.msgid) {
      const server = servers.find(
        (s) => s.id === reactionModal.message?.serverId,
      );
      const channel = server?.channels.find(
        (c) => c.id === reactionModal.message?.channelId,
      );
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
    }
    handleCloseReactionModal();
  };

  const handleDirectReaction = (emoji: string, message: MessageType) => {
    if (message.msgid && selectedServerId) {
      const server = servers.find((s) => s.id === selectedServerId);
      const channel = server?.channels.find((c) => c.id === message.channelId);
      if (server && channel) {
        // Send react message directly
        const tagMsg = `@+draft/react=${emoji};+draft/reply=${message.msgid} TAGMSG ${channel.name}`;
        ircClient.sendRaw(server.id, tagMsg);
      }
    }
  };

  const handleReactionUnreact = (emoji: string, message: MessageType) => {
    if (message.msgid && selectedServerId) {
      const server = servers.find((s) => s.id === selectedServerId);
      const channel = server?.channels.find((c) => c.id === message.channelId);
      if (server && channel) {
        const tagMsg = `@+draft/unreact=${emoji};+draft/reply=${message.msgid} TAGMSG ${channel.name}`;
        ircClient.sendRaw(server.id, tagMsg);
      }
    }
  };

  const handleRedactMessage = (message: MessageType) => {
    if (message.msgid && selectedServerId) {
      const confirmed = window.confirm(
        "Are you sure you want to delete this message? This action cannot be undone.",
      );
      if (confirmed) {
        const server = servers.find((s) => s.id === selectedServerId);
        const channel = server?.channels.find(
          (c) => c.id === message.channelId,
        );
        if (server && channel) {
          redactMessage(selectedServerId, channel.name, message.msgid);
        }
      }
    }
  };

  const handleOpenReactionModal = (
    message: MessageType,
    position: { x: number; y: number },
  ) => {
    setReactionModal({
      isOpen: true,
      message,
    });
  };

  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    setMessageText((prev) => prev + emojiData.emoji);
    setIsEmojiSelectorOpen(false);
  };

  const handleEmojiModalBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsEmojiSelectorOpen(false);
    }
  };

  const handleAtButtonClick = () => {
    setShowMembersDropdown((prev) => {
      const newValue = !prev;
      // Close other dropdowns when opening members dropdown
      if (newValue) {
        setShowAutocomplete(false);
        setShowEmojiAutocomplete(false);
        setIsEmojiSelectorOpen(false);
        setIsColorPickerOpen(false);
        emojiCompletion.resetCompletion();
        tabCompletion.resetCompletion();
      }
      return newValue;
    });
  };

  const toggleFormatting = (format: FormattingType) => {
    setSelectedFormatting((prev) =>
      prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format],
    );
  };

  const isNarrowView = useMediaQuery();

  // Focus input on channel change
  // biome-ignore lint/correctness/useExhaustiveDependencies(selectedChannelId): Only focus when channel changes
  // biome-ignore lint/correctness/useExhaustiveDependencies(selectedPrivateChatId): Only focus when private chat changes
  useEffect(() => {
    if ("__TAURI__" in window && ["android", "ios"].includes(platform()))
      return;
    // Don't steal focus if any modal is open
    if (
      isSettingsModalOpen ||
      isUserProfileModalOpen ||
      isAddServerModalOpen ||
      isChannelListModalOpen ||
      isChannelRenameModalOpen
    )
      return;
    inputRef.current?.focus();
  }, [
    selectedChannelId,
    selectedPrivateChatId,
    isSettingsModalOpen,
    isUserProfileModalOpen,
    isAddServerModalOpen,
    isChannelListModalOpen,
    isChannelRenameModalOpen,
  ]);

  return (
    <div className="flex flex-col h-full">
      {/* Channel header */}
      <div className="h-12 min-h-[48px] px-4 border-b border-discord-dark-400 flex items-center justify-between shadow-sm">
        <div className="flex items-center">
          {!isChanListVisible && (
            <button
              onClick={onToggleChanList}
              className="text-discord-channels-default hover:text-white mr-4"
              aria-label="Expand channel list"
            >
              {isNarrowView ? <FaChevronLeft /> : <FaChevronRight />}
            </button>
          )}
          {selectedChannel && (
            <>
              {getChannelAvatarUrl(selectedChannel.metadata, 20) ? (
                <img
                  src={getChannelAvatarUrl(selectedChannel.metadata, 20)}
                  alt={selectedChannel.name}
                  className="w-5 h-5 rounded-full object-cover mr-2"
                  onError={(e) => {
                    // Fallback to # icon on error
                    e.currentTarget.style.display = "none";
                    const parent = e.currentTarget.parentElement;
                    const fallbackIcon = parent?.querySelector(
                      ".fallback-hash-icon",
                    );
                    if (fallbackIcon) {
                      (fallbackIcon as HTMLElement).style.display =
                        "inline-block";
                    }
                  }}
                />
              ) : null}
              <FaHashtag
                className="text-discord-text-muted mr-2 fallback-hash-icon"
                style={{
                  display: getChannelAvatarUrl(selectedChannel.metadata, 20)
                    ? "none"
                    : "inline-block",
                }}
              />
              <h2 className="font-bold text-white mr-4">
                {getChannelDisplayName(
                  selectedChannel.name,
                  selectedChannel.metadata,
                )}
              </h2>
            </>
          )}
          {selectedPrivateChat && (
            <>
              <FaAt className="text-discord-text-muted mr-2" />
              <h2 className="font-bold text-white mr-4">
                {selectedPrivateChat.username}
              </h2>
            </>
          )}
          {selectedChannelId === "server-notices" && (
            <>
              <FaList className="text-discord-text-muted mr-2" />
              <h2 className="font-bold text-white mr-4">Server Notices</h2>
            </>
          )}
          {selectedChannel?.topic && (
            <>
              <div className="mx-2 text-discord-text-muted">|</div>
              <div className="text-discord-text-muted text-sm truncate max-w-xs">
                {selectedChannel.topic}
              </div>
            </>
          )}
        </div>
        {!!selectedServerId && selectedChannelId !== "server-notices" && (
          <div className="flex items-center gap-4 text-discord-text-muted">
            <button className="hover:text-discord-text-normal">
              <FaBell />
            </button>
            {selectedChannel && (
              <button
                className="hover:text-discord-text-normal"
                onClick={() => setChannelSettingsModalOpen(true)}
                title="Channel Settings"
              >
                <FaPenAlt />
              </button>
            )}
            <button className="hover:text-discord-text-normal">
              <FaUserPlus />
            </button>
            <button
              className="hover:text-discord-text-normal"
              onClick={() => useStore.getState().toggleChannelListModal(true)}
              title="List Channels"
            >
              <FaList />
            </button>
            {selectedChannel &&
              (() => {
                const serverCurrentUser = selectedServerId
                  ? ircClient.getCurrentUser(selectedServerId)
                  : null;
                const channelUser = selectedChannel.users.find(
                  (u) => u.username === serverCurrentUser?.username,
                );
                const isOperator =
                  channelUser?.status?.includes("@") ||
                  channelUser?.status?.includes("~");
                return isOperator ? (
                  <button
                    className="hover:text-discord-text-normal"
                    onClick={() =>
                      useStore.getState().toggleChannelRenameModal(true)
                    }
                    title="Rename Channel"
                  >
                    <FaEdit />
                  </button>
                ) : null;
              })()}
            {/* Only show member list toggle for channels, not private chats */}
            {selectedChannel && (
              <button
                className="hover:text-discord-text-normal"
                onClick={() => toggleMemberList(!isMemberListVisible)}
                aria-label={
                  isMemberListVisible
                    ? "Collapse member list"
                    : "Expand member list"
                }
                data-testid="toggle-member-list"
              >
                {isMemberListVisible ? (
                  <UsersIcon className="w-4 h-4 text-white" />
                ) : (
                  <UsersIcon className="w-4 h-4 text-gray" />
                )}
              </button>
            )}
            <div className="relative">
              <input
                type="text"
                placeholder="Search"
                className="bg-discord-dark-400 text-discord-text-muted text-sm rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-discord-text-link"
              />
              <FaSearch className="absolute right-2 top-1.5 text-xs" />
            </div>
          </div>
        )}
        {selectedChannelId === "server-notices" && (
          <div className="flex items-center gap-4 text-discord-text-muted">
            {/* TODO: Re-enable pop out button for server notices
            <button
              className="hover:text-discord-text-normal"
              onClick={() =>
                setIsServerNoticesPoppedOut(!isServerNoticesPoppedOut)
              }
              title={
                isServerNoticesPoppedOut
                  ? "Pop in server notices"
                  : "Pop out server notices"
              }
            >
              <FaExternalLinkAlt />
            </button>
            */}
          </div>
        )}
      </div>

      {/* Messages area */}
      {selectedServer &&
        !selectedChannel &&
        !selectedPrivateChat &&
        selectedChannelId !== "server-notices" && (
          <div className="flex-grow flex flex-col items-center justify-center bg-discord-dark-200">
            <BlankPage /> {/* Render the blank page */}
          </div>
        )}
      {(selectedChannel ||
        selectedPrivateChat ||
        selectedChannelId === "server-notices") && (
        <div
          ref={messagesContainerRef}
          className="flex-grow overflow-y-auto flex flex-col bg-discord-dark-200 text-discord-text-normal relative"
        >
          {selectedChannel?.isLoadingHistory ? (
            // Show loading spinner when channel is loading history
            <div className="flex-grow flex items-center justify-center">
              <LoadingSpinner
                size="lg"
                text="Loading chat history..."
                className="text-discord-text-muted"
              />
            </div>
          ) : (
            // Show messages when not loading
            eventGroups.map((group) => {
              if (group.type === "eventGroup") {
                // Create a stable key from the first and last message IDs in the group
                const firstId = group.messages[0]?.id || "";
                const lastId =
                  group.messages[group.messages.length - 1]?.id || "";
                const groupKey = `group-${firstId}-${lastId}`;

                return (
                  <CollapsedEventMessage
                    key={groupKey}
                    eventGroup={group}
                    users={selectedChannel?.users || []}
                    onUsernameContextMenu={(
                      e,
                      username,
                      serverId,
                      channelId,
                      avatarElement,
                    ) =>
                      handleUsernameClick(
                        e,
                        username,
                        serverId,
                        channelId,
                        avatarElement,
                      )
                    }
                  />
                );
              }
              // Single message - find its original index for date/header logic
              const message = group.messages[0];
              const originalIndex = channelMessages.findIndex(
                (m) => m.id === message.id,
              );
              const previousMessage = channelMessages[originalIndex - 1];
              const showHeader =
                !previousMessage ||
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
                  setReplyTo={setLocalReplyTo}
                  onUsernameContextMenu={(
                    e,
                    username,
                    serverId,
                    channelId,
                    avatarElement,
                  ) =>
                    handleUsernameClick(
                      e,
                      username,
                      serverId,
                      channelId,
                      avatarElement,
                    )
                  }
                  onIrcLinkClick={handleIrcLinkClick}
                  onReactClick={handleReactClick}
                  joinChannel={joinChannel}
                  onReactionUnreact={handleReactionUnreact}
                  onOpenReactionModal={handleOpenReactionModal}
                  onDirectReaction={handleDirectReaction}
                  users={selectedChannel?.users || []}
                  onRedactMessage={handleRedactMessage}
                />
              );
            })
          )}

          <div ref={messagesEndRef} />
        </div>
      )}
      {!selectedServer && <DiscoverGrid />}
      {/* Scroll to bottom button */}
      {isScrolledUp && (
        <div className="relative bottom-10 z-50">
          <div className="absolute right-4">
            <button
              onClick={scrollDown}
              className="bg-discord-dark-400 hover:bg-discord-dark-300 text-white rounded-full p-2 shadow-lg transition-all"
              aria-label="Scroll to bottom"
            >
              <FaArrowDown className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      {(selectedChannel || selectedPrivateChat) && (
        <div className={`${!isNarrowView && "px-4"} pb-4 relative`}>
          <TypingIndicator
            serverId={selectedServerId ?? ""}
            channelId={selectedChannelId || selectedPrivateChatId || ""}
          />
          <div className="bg-discord-dark-100 rounded-lg flex items-center relative">
            <button
              className="px-4 text-discord-text-muted hover:text-discord-text-normal"
              onClick={() => setShowPlusMenu((prev) => !prev)}
            >
              <FaPlus />
            </button>

            {localReplyTo && (
              <div className="bg-discord-dark-200 rounded text-sm text-discord-text-muted mr-3 flex items-center h-8 px-2">
                <span className="flex-grow text-center">
                  Replying to <strong>{localReplyTo.userId}</strong>
                </span>
                <button
                  className="ml-2 text-xs text-discord-text-muted hover:text-discord-text-normal"
                  onClick={() => setLocalReplyTo(null)}
                >
                  <FaTimes />
                </button>
              </div>
            )}
            <textarea
              ref={inputRef}
              value={messageText}
              onChange={handleInputChange}
              onClick={handleInputClick}
              onKeyUp={handleInputKeyUp}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedChannel
                  ? `Message #${selectedChannel.name.replace(/^#/, "")}${
                      globalSettings.enableMultilineInput && !isMobile
                        ? globalSettings.multilineOnShiftEnter
                          ? " (Shift+Enter for new line)"
                          : " (Enter for new line, Shift+Enter to send)"
                        : ""
                    }`
                  : selectedPrivateChat
                    ? `Message @${selectedPrivateChat.username}${
                        globalSettings.enableMultilineInput && !isMobile
                          ? globalSettings.multilineOnShiftEnter
                            ? " (Shift+Enter for new line)"
                            : " (Enter for new line, Shift+Enter to send)"
                          : ""
                      }`
                    : "Type a message..."
              }
              className="bg-transparent border-none outline-none py-3 flex-grow text-discord-text-normal resize-none min-h-[44px] max-h-32 overflow-y-auto"
              style={getPreviewStyles({
                color: selectedColor || "inherit",
                formatting: selectedFormatting,
              })}
              rows={1}
            />
            <button
              className="px-3 text-discord-text-muted hover:text-discord-text-normal"
              onClick={() => {
                setIsEmojiSelectorOpen((prev) => !prev);
                setIsColorPickerOpen(false);
                setShowMembersDropdown(false);
              }}
            >
              <FaGrinAlt />
            </button>
            <button
              className="px-3 text-discord-text-muted hover:text-discord-text-normal"
              onClick={() => {
                setIsColorPickerOpen((prev) => !prev);
                setIsEmojiSelectorOpen(false);
                setShowMembersDropdown(false);
              }}
            >
              <div
                className="w-4 h-4 rounded-full border-2 border-white-700"
                style={{
                  backgroundColor:
                    selectedColor === "inherit"
                      ? "transparent"
                      : (selectedColor ?? undefined),
                }}
              />
            </button>
            <button
              className="px-3 text-discord-text-muted hover:text-discord-text-normal"
              onClick={handleAtButtonClick}
            >
              <FaAt />
            </button>
          </div>

          {/* Plus menu */}
          {showPlusMenu && (
            <div
              className="plus-menu absolute bg-discord-dark-200 rounded-lg shadow-lg border border-discord-dark-300 min-w-48 z-50"
              style={{
                bottom: "calc(100% + 8px)",
                left: "16px",
              }}
            >
              {selectedServer?.filehost && (
                <button
                  className="w-full text-left px-4 py-2 text-discord-text-normal hover:bg-discord-dark-300 rounded-lg flex items-center"
                  onClick={() => {
                    // Handle image selection for preview
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) {
                        // Create preview URL
                        const previewUrl = URL.createObjectURL(file);
                        setImagePreview({
                          isOpen: true,
                          file,
                          previewUrl,
                        });
                      }
                    };
                    input.click();
                    setShowPlusMenu(false);
                  }}
                >
                  <FaPlus className="mr-2" />
                  Upload Image
                </button>
              )}
              <button
                className="w-full text-left px-4 py-2 text-discord-text-normal hover:bg-discord-dark-300 rounded-lg flex items-center"
                onClick={() => {
                  setIsGifSelectorOpen(true);
                  setShowPlusMenu(false);
                }}
              >
                <FaGift className="mr-2" />
                Send a GIF
              </button>
              {/* Add more menu items here if needed */}
            </div>
          )}

          {isEmojiSelectorOpen &&
            createPortal(
              <div
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                onClick={handleEmojiModalBackdropClick}
              >
                <div className="bg-discord-dark-400 rounded-lg shadow-lg border border-discord-dark-300 max-w-sm w-full mx-4 max-h-[90vh] overflow-hidden">
                  <div className="p-2">
                    <EmojiPicker
                      onEmojiClick={handleEmojiSelect}
                      theme={Theme.DARK}
                      width="100%"
                      height={400}
                      searchPlaceholder="Search emojis..."
                      previewConfig={{
                        showPreview: false,
                      }}
                      skinTonesDisabled={false}
                      lazyLoadEmojis={true}
                    />
                  </div>
                  <div className="p-2 border-t border-discord-dark-300">
                    <button
                      onClick={() => setIsEmojiSelectorOpen(false)}
                      className="text-sm text-discord-text-muted hover:text-white w-full text-center py-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}

          <GifSelector
            isOpen={isGifSelectorOpen}
            onClose={() => setIsGifSelectorOpen(false)}
            onSelectGif={(gifUrl) => {
              // Send the GIF URL directly to the channel
              handleGifSend(gifUrl);
              setIsGifSelectorOpen(false);
            }}
          />

          {isColorPickerOpen && (
            <ColorPicker
              onSelect={(color) => setSelectedColor(color)}
              onClose={() => setIsColorPickerOpen(false)}
              selectedColor={selectedColor} // Pass the selected color
              selectedFormatting={selectedFormatting}
              toggleFormatting={toggleFormatting}
            />
          )}

          <AutocompleteDropdown
            users={
              selectedChannel?.users ||
              (selectedPrivateChat
                ? [
                    ...(currentUser ? [currentUser] : []),
                    {
                      id: `${selectedPrivateChat.serverId}-${selectedPrivateChat.username}`,
                      username: selectedPrivateChat.username,
                      isOnline: true,
                    },
                  ]
                : [])
            }
            isVisible={showAutocomplete}
            inputValue={messageText}
            cursorPosition={cursorPosition}
            tabCompletionMatches={tabCompletion.matches}
            currentMatchIndex={tabCompletion.currentIndex}
            onSelect={handleUsernameSelect}
            onClose={handleAutocompleteClose}
            onNavigate={handleAutocompleteNavigate}
            inputElement={inputRef.current}
          />

          <EmojiAutocompleteDropdown
            isVisible={showEmojiAutocomplete || emojiCompletion.isActive}
            inputValue={messageText}
            cursorPosition={cursorPosition}
            emojiMatches={emojiCompletion.matches}
            currentMatchIndex={emojiCompletion.currentIndex}
            onSelect={handleEmojiAutocompleteSelect}
            onClose={handleEmojiAutocompleteClose}
            onNavigate={handleEmojiAutocompleteNavigate}
            inputElement={inputRef.current}
          />

          {/* Members dropdown triggered by @ button */}
          <AutocompleteDropdown
            users={
              selectedChannel?.users ||
              (selectedPrivateChat
                ? [
                    ...(currentUser ? [currentUser] : []),
                    {
                      id: `${selectedPrivateChat.serverId}-${selectedPrivateChat.username}`,
                      username: selectedPrivateChat.username,
                      isOnline: true,
                    },
                  ]
                : [])
            }
            isVisible={showMembersDropdown}
            inputValue={messageText}
            cursorPosition={cursorPosition}
            tabCompletionMatches={[]}
            currentMatchIndex={-1}
            onSelect={(username) => {
              const isAtMessageStart = messageText.trim() === "";
              const suffix = isAtMessageStart ? ": " : " ";
              setMessageText((prev) => prev + username + suffix);
              setShowMembersDropdown(false);
            }}
            onClose={() => setShowMembersDropdown(false)}
            onNavigate={() => {}}
            inputElement={inputRef.current}
            isAtButtonTriggered={true}
          />
        </div>
      )}

      <UserContextMenu
        isOpen={userContextMenu.isOpen}
        x={userContextMenu.x}
        y={userContextMenu.y}
        username={userContextMenu.username}
        serverId={userContextMenu.serverId}
        channelId={userContextMenu.channelId}
        onClose={handleCloseUserContextMenu}
        onOpenPM={handleOpenPM}
        currentUserStatus={userContextMenu.userStatusInChannel}
        currentUsername={
          ircClient.getCurrentUser(userContextMenu.serverId)?.username
        }
        onOpenModerationModal={(action) => {
          setModerationModal({
            isOpen: true,
            action,
            username: userContextMenu.username,
          });
        }}
      />

      <ReactionModal
        isOpen={reactionModal.isOpen}
        onClose={handleCloseReactionModal}
        onSelectEmoji={handleReactionSelect}
      />

      <ModerationModal
        isOpen={moderationModal.isOpen}
        onClose={handleCloseModerationModal}
        onConfirm={handleModerationConfirm}
        username={moderationModal.username}
        action={moderationModal.action}
      />

      {selectedChannel && (
        <ChannelSettingsModal
          isOpen={channelSettingsModalOpen}
          onClose={() => setChannelSettingsModalOpen(false)}
          serverId={selectedServerId || ""}
          channelName={selectedChannel.name}
        />
      )}

      {/* Image Preview Dialog */}
      {imagePreview.isOpen && imagePreview.previewUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-discord-dark-400 rounded-lg shadow-lg border border-discord-dark-300 max-w-md w-full mx-4">
            <div className="p-4">
              <h3 className="text-lg font-semibold text-white mb-4">
                Upload Image
              </h3>
              <div className="flex justify-center mb-4">
                <img
                  src={imagePreview.previewUrl}
                  alt="Preview"
                  className="max-w-full max-h-96 rounded-lg"
                />
              </div>
              <p className="text-sm text-discord-text-muted mb-4">
                File: {imagePreview.file?.name} (
                {(imagePreview.file?.size || 0) / 1024} KB)
              </p>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-discord-dark-300">
              <button
                onClick={() => {
                  // Clean up preview URL
                  if (imagePreview.previewUrl) {
                    URL.revokeObjectURL(imagePreview.previewUrl);
                  }
                  setImagePreview({
                    isOpen: false,
                    file: null,
                    previewUrl: null,
                  });
                }}
                className="px-4 py-2 text-discord-text-muted hover:text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (imagePreview.file) {
                    handleImageUpload(imagePreview.file);
                  }
                  // Clean up preview URL
                  if (imagePreview.previewUrl) {
                    URL.revokeObjectURL(imagePreview.previewUrl);
                  }
                  setImagePreview({
                    isOpen: false,
                    file: null,
                    previewUrl: null,
                  });
                }}
                className="px-4 py-2 bg-discord-accent text-white rounded hover:bg-discord-accent-hover"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popped out server notices window */}
      {isServerNoticesPoppedOut &&
        createPortal(
          <div
            className="fixed w-[600px] h-[500px] bg-discord-dark-200 border border-discord-dark-400 rounded-lg shadow-xl z-[10002] flex flex-col"
            style={{
              left: serverNoticesPopupPosition.x,
              top: serverNoticesPopupPosition.y,
            }}
          >
            <div
              className="h-12 min-h-[48px] px-4 border-b border-discord-dark-400 flex items-center justify-between shadow-sm bg-discord-dark-400 cursor-move"
              onMouseDown={handleServerNoticesMouseDown}
            >
              <div className="flex items-center">
                <FaList className="text-discord-text-muted mr-2" />
                <h2 className="font-bold text-white">Server Notices</h2>
              </div>
              <button
                className="text-discord-text-muted hover:text-discord-text-normal"
                onClick={() => setIsServerNoticesPoppedOut(false)}
                title="Close popped out server notices"
              >
                <FaTimes />
              </button>
            </div>
            <div
              ref={serverNoticesScrollRef}
              onScroll={handleServerNoticesScroll}
              className="flex-grow overflow-y-auto p-4 space-y-2"
            >
              {(
                messages[
                  selectedServerId ? `${selectedServerId}-server-notices` : ""
                ] || []
              )
                .filter((msg: MessageType) => msg.type === "notice")
                .slice(-50) // Show last 50 messages
                .map(
                  (message: MessageType, index: number, arr: MessageType[]) => {
                    const previousMessage = arr[index - 1];
                    const showHeader =
                      !previousMessage ||
                      previousMessage.userId !== message.userId ||
                      new Date(message.timestamp).getTime() -
                        new Date(previousMessage.timestamp).getTime() >
                        5 * 60 * 1000;

                    return (
                      <MessageItem
                        key={message.id}
                        message={message}
                        showDate={
                          index === 0 ||
                          new Date(message.timestamp).toDateString() !==
                            new Date(previousMessage?.timestamp).toDateString()
                        }
                        showHeader={showHeader}
                        setReplyTo={setLocalReplyTo}
                        onUsernameContextMenu={(
                          e,
                          username,
                          serverId,
                          channelId,
                          avatarElement,
                        ) =>
                          handleUsernameClick(
                            e,
                            username,
                            serverId,
                            channelId,
                            avatarElement,
                          )
                        }
                        onIrcLinkClick={handleIrcLinkClick}
                        onReactClick={handleReactClick}
                        joinChannel={joinChannel}
                        onReactionUnreact={handleReactionUnreact}
                        onOpenReactionModal={handleOpenReactionModal}
                        onDirectReaction={handleDirectReaction}
                        users={selectedServer?.users || []}
                        onRedactMessage={handleRedactMessage}
                      />
                    );
                  },
                )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default ChatArea;
