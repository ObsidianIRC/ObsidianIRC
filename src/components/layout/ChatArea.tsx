import { platform } from "@tauri-apps/plugin-os";
import type { EmojiClickData } from "emoji-picker-react";
import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FaPlus } from "react-icons/fa";
import { v4 as uuidv4 } from "uuid";
import { useEmojiCompletion } from "../../hooks/useEmojiCompletion";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useMessageHistory } from "../../hooks/useMessageHistory";
import { useMessageSending } from "../../hooks/useMessageSending";
import { useReactions } from "../../hooks/useReactions";
import { useTabCompletion } from "../../hooks/useTabCompletion";
import { useTypingNotification } from "../../hooks/useTypingNotification";
import { groupConsecutiveEvents } from "../../lib/eventGrouping";
import ircClient from "../../lib/ircClient";
import { parseIrcUrl } from "../../lib/ircUrlParser";
import {
  type FormattingType,
  getPreviewStyles,
  isValidFormattingType,
} from "../../lib/messageFormatter";
import useStore from "../../store";
import type { Message as MessageType, User } from "../../types";
import { CollapsedEventMessage } from "../message/CollapsedEventMessage";
import { MessageItem } from "../message/MessageItem";
import AutocompleteDropdown from "../ui/AutocompleteDropdown";
import BlankPage from "../ui/BlankPage";
import ColorPicker from "../ui/ColorPicker";
import EmojiAutocompleteDropdown from "../ui/EmojiAutocompleteDropdown";
import { EmojiPickerModal } from "../ui/EmojiPickerModal";
import DiscoverGrid from "../ui/HomeScreen";
import { ImagePreviewModal } from "../ui/ImagePreviewModal";
import { InputToolbar } from "../ui/InputToolbar";
import LoadingSpinner from "../ui/LoadingSpinner";
import ReactionModal from "../ui/ReactionModal";
import { ReplyBadge } from "../ui/ReplyBadge";
import { ScrollToBottomButton } from "../ui/ScrollToBottomButton";
import UserContextMenu from "../ui/UserContextMenu";
import { ChatHeader } from "./ChatHeader";

const EMPTY_ARRAY: User[] = [];

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
  const [imagePreview, setImagePreview] = useState<{
    isOpen: boolean;
    file: File | null;
    previewUrl: string | null;
  }>({
    isOpen: false,
    file: null,
    previewUrl: null,
  });
  const [userContextMenu, setUserContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    username: string;
    serverId: string;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    username: "",
    serverId: "",
  });
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
    },
    toggleMemberList,
    openPrivateChat,
    messages,
    connect,
    joinChannel,
    toggleAddServerModal,
    redactMessage,
    globalSettings,
  } = useStore();

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

  // Tab completion hook
  const tabCompletion = useTabCompletion();

  // Emoji completion hook
  const emojiCompletion = useEmojiCompletion();

  // Typing notification hook
  const typingNotification = useTypingNotification({
    serverId: selectedServerId,
    enabled: globalSettings.sendTypingNotifications,
  });

  // Media query hook
  const isNarrowView = useMediaQuery();

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

  // Message sending hook
  const { sendMessage } = useMessageSending({
    selectedServerId,
    selectedChannelId,
    selectedPrivateChatId,
    selectedChannel: selectedChannel ?? null,
    selectedPrivateChat: selectedPrivateChat ?? null,
    currentUser,
    selectedColor,
    selectedFormatting,
    localReplyTo,
  });

  // Reactions hook
  const {
    reactionModal,
    openReactionModal,
    closeReactionModal,
    selectReaction,
    directReaction,
    unreact,
  } = useReactions({
    selectedServerId,
    currentUser,
  });

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

  // Message history hook (must be after channelMessages is defined)
  const messageHistory = useMessageHistory({
    messages: channelMessages,
    currentUsername: currentUser?.username || null,
    selectedChannelId,
    selectedPrivateChatId,
  });

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
    if (messageText.trim() === "") return;

    scrollDown();
    sendMessage(messageText);

    // Cleanup after sending
    setMessageText("");
    setLocalReplyTo(null);
    setShowAutocomplete(false);
    messageHistory.resetHistory();
    if (tabCompletion.isActive) {
      tabCompletion.resetCompletion();
    }

    // Reset textarea height to initial single-line state
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.style.height = "auto";
          const scrollHeight = inputRef.current.scrollHeight;
          inputRef.current.style.height = `${scrollHeight}px`;
        }
      }, 0);
    }

    // Send typing done notification
    const target = selectedChannel?.name ?? selectedPrivateChat?.username;
    if (target) {
      typingNotification.notifyTypingDone(target);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!selectedServer?.filehost || !selectedServerId) return;

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
          ircClient.sendRaw(
            selectedServerId,
            `PRIVMSG ${target} :${data.saved_url}`,
          );

          // Add to store for immediate display (only for private chats, channels echo back)
          if (selectedPrivateChat && currentUser) {
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

    // Handle message history navigation with arrow keys
    if (e.key === "ArrowUp") {
      // Only activate if input is empty or already in history mode
      if (messageText === "" || messageHistory.messageHistoryIndex >= 0) {
        e.preventDefault();

        if (messageHistory.userMessageHistory.length === 0) return;

        const previousMessage = messageHistory.navigateUp(messageText);
        if (previousMessage !== null) {
          setMessageText(previousMessage);

          // Move cursor to end of text
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.setSelectionRange(
                previousMessage.length,
                previousMessage.length,
              );
            }
          }, 0);
        }
      }
      return;
    }

    if (e.key === "ArrowDown") {
      // Only handle if we're in history mode
      if (messageHistory.messageHistoryIndex >= 0) {
        e.preventDefault();

        const nextMessage = messageHistory.navigateDown();
        if (nextMessage !== null) {
          setMessageText(nextMessage);

          // Move cursor to end
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.setSelectionRange(
                nextMessage.length,
                nextMessage.length,
              );
            }
          }, 0);
        }
      }
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

    // Exit history mode if user starts typing
    messageHistory.exitHistory();

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
    const target = selectedChannel?.name ?? selectedPrivateChat?.username;
    if (!target) return;
    typingNotification.notifyTyping(target, text);
  };

  const handleUsernameClick = (
    e: React.MouseEvent,
    username: string,
    serverId: string,
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

    setUserContextMenu({
      isOpen: true,
      x,
      y,
      username,
      serverId,
    });
  };

  const handleCloseUserContextMenu = () => {
    setUserContextMenu({
      isOpen: false,
      x: 0,
      y: 0,
      username: "",
      serverId: "",
    });
  };

  const handleOpenPM = (username: string) => {
    if (selectedServerId) {
      openPrivateChat(selectedServerId, username);
    }
  };

  const handleReactClick = (message: MessageType, buttonElement: Element) => {
    openReactionModal(message);
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
      <ChatHeader
        selectedChannel={selectedChannel ?? null}
        selectedPrivateChat={selectedPrivateChat ?? null}
        selectedServerId={selectedServerId}
        isChanListVisible={isChanListVisible}
        isMemberListVisible={isMemberListVisible}
        isNarrowView={isNarrowView}
        onToggleChanList={onToggleChanList}
        onToggleMemberList={() => toggleMemberList(!isMemberListVisible)}
      />

      {/* Messages area */}
      {selectedServer && !selectedChannel && !selectedPrivateChat && (
        <div className="flex-grow flex flex-col items-center justify-center bg-discord-dark-200">
          <BlankPage /> {/* Render the blank page */}
        </div>
      )}
      {(selectedChannel || selectedPrivateChat) && (
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
                      avatarElement,
                    ) =>
                      handleUsernameClick(e, username, serverId, avatarElement)
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
                    avatarElement,
                  ) =>
                    handleUsernameClick(e, username, serverId, avatarElement)
                  }
                  onIrcLinkClick={handleIrcLinkClick}
                  onReactClick={handleReactClick}
                  selectedServerId={selectedServerId}
                  onReactionUnreact={unreact}
                  onOpenReactionModal={openReactionModal}
                  onDirectReaction={directReaction}
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
      <ScrollToBottomButton isVisible={isScrolledUp} onClick={scrollDown} />

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
              <ReplyBadge
                replyTo={localReplyTo}
                onClose={() => setLocalReplyTo(null)}
              />
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
                      globalSettings.enableMultilineInput &&
                      !(
                        "__TAURI__" in window &&
                        ["android", "ios"].includes(platform())
                      )
                        ? globalSettings.multilineOnShiftEnter
                          ? " (Shift+Enter for new line)"
                          : " (Enter for new line, Shift+Enter to send)"
                        : ""
                    }`
                  : selectedPrivateChat
                    ? `Message @${selectedPrivateChat.username}${
                        globalSettings.enableMultilineInput &&
                        !(
                          "__TAURI__" in window &&
                          ["android", "ios"].includes(platform())
                        )
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
            <InputToolbar
              selectedColor={selectedColor}
              onEmojiClick={() => {
                setIsEmojiSelectorOpen((prev) => !prev);
                setIsColorPickerOpen(false);
                setShowMembersDropdown(false);
              }}
              onColorPickerClick={() => {
                setIsColorPickerOpen((prev) => !prev);
                setIsEmojiSelectorOpen(false);
                setShowMembersDropdown(false);
              }}
              onAtClick={handleAtButtonClick}
            />
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
              {/* Add more menu items here if needed */}
            </div>
          )}

          <EmojiPickerModal
            isOpen={isEmojiSelectorOpen}
            onEmojiClick={handleEmojiSelect}
            onClose={() => setIsEmojiSelectorOpen(false)}
            onBackdropClick={handleEmojiModalBackdropClick}
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
        onClose={handleCloseUserContextMenu}
        onOpenPM={handleOpenPM}
      />

      <ReactionModal
        isOpen={reactionModal.isOpen}
        onClose={closeReactionModal}
        onSelectEmoji={selectReaction}
      />

      {/* Image Preview Dialog */}
      <ImagePreviewModal
        isOpen={imagePreview.isOpen}
        file={imagePreview.file}
        previewUrl={imagePreview.previewUrl}
        onCancel={() => {
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
        onUpload={() => {
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
      />
    </div>
  );
};

export default ChatArea;
