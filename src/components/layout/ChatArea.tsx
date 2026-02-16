import { platform } from "@tauri-apps/plugin-os";
import type { EmojiClickData } from "emoji-picker-react";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaGift, FaList, FaPlus, FaTimes } from "react-icons/fa";
import { v4 as uuidv4 } from "uuid";
import { useEmojiCompletion } from "../../hooks/useEmojiCompletion";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useMessageHistory } from "../../hooks/useMessageHistory";
import { useMessageSending } from "../../hooks/useMessageSending";
import { useReactions } from "../../hooks/useReactions";
import {
  isScrolledToBottom,
  useScrollToBottom,
} from "../../hooks/useScrollToBottom";
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
import { isTauri } from "../../lib/platformUtils";
import useStore from "../../store";
import type { Message as MessageType, User } from "../../types";
import { CollapsedEventMessage } from "../message/CollapsedEventMessage";
import { MessageItem } from "../message/MessageItem";
import AutocompleteDropdown from "../ui/AutocompleteDropdown";
import BlankPage from "../ui/BlankPage";
import ChannelSettingsModal from "../ui/ChannelSettingsModal";
import ColorPicker from "../ui/ColorPicker";
import EmojiAutocompleteDropdown from "../ui/EmojiAutocompleteDropdown";
import { EmojiPickerModal } from "../ui/EmojiPickerModal";
import GifSelector from "../ui/GifSelector";
import DiscoverGrid from "../ui/HomeScreen";
import { ImagePreviewModal } from "../ui/ImagePreviewModal";
import { InputToolbar } from "../ui/InputToolbar";
import InviteUserModal from "../ui/InviteUserModal";
import LoadingSpinner from "../ui/LoadingSpinner";
import ModerationModal, { type ModerationAction } from "../ui/ModerationModal";
import ReactionModal from "../ui/ReactionModal";
import { ReplyBadge } from "../ui/ReplyBadge";
import { ScrollToBottomButton } from "../ui/ScrollToBottomButton";
import { TextArea } from "../ui/TextInput";
import UserContextMenu from "../ui/UserContextMenu";
import UserProfileModal from "../ui/UserProfileModal";
import { ChatHeader } from "./ChatHeader";
import { MemberList } from "./MemberList";

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
      const isAtBottom = isScrolledToBottom(serverNoticesScrollRef.current, 30);
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
    userStatusInChannel: undefined,
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
  const [userProfileModalOpen, setUserProfileModalOpen] = useState(false);
  const [inviteUserModalOpen, setInviteUserModalOpen] = useState(false);
  const [selectedProfileUsername, setSelectedProfileUsername] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleMessageCount, setVisibleMessageCount] = useState(100);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const servers = useStore((state) => state.servers);
  const ui = useStore((state) => state.ui);
  const globalSettings = useStore((state) => state.globalSettings);
  const messages = useStore((state) => state.messages);
  const toggleMemberList = useStore((state) => state.toggleMemberList);
  const openPrivateChat = useStore((state) => state.openPrivateChat);
  const selectPrivateChat = useStore((state) => state.selectPrivateChat);
  const connect = useStore((state) => state.connect);
  const joinChannel = useStore((state) => state.joinChannel);
  const toggleAddServerModal = useStore((state) => state.toggleAddServerModal);
  const redactMessage = useStore((state) => state.redactMessage);
  const warnUser = useStore((state) => state.warnUser);
  const kickUser = useStore((state) => state.kickUser);
  const banUserByNick = useStore((state) => state.banUserByNick);
  const banUserByHostmask = useStore((state) => state.banUserByHostmask);
  const clearChatInputFocus = useStore((state) => state.clearChatInputFocus);
  const shouldFocusChatInput = useStore(
    (state) => state.ui.shouldFocusChatInput,
  );
  const channelSettingsRequest = useStore(
    (state) => state.ui.channelSettingsRequest,
  );
  const inviteUserRequest = useStore((state) => state.ui.inviteUserRequest);
  const setChannelSettingsRequest = useStore(
    (state) => state.setChannelSettingsRequest,
  );
  const setInviteUserRequest = useStore((state) => state.setInviteUserRequest);

  useEffect(() => {
    if (channelSettingsRequest) {
      setChannelSettingsModalOpen(true);
      setChannelSettingsRequest(null, null);
    }
  }, [channelSettingsRequest, setChannelSettingsRequest]);

  useEffect(() => {
    if (inviteUserRequest) {
      setInviteUserModalOpen(true);
      setInviteUserRequest(null, null);
    }
  }, [inviteUserRequest, setInviteUserRequest]);

  // Focus chat input when requested by other components (e.g., modals closing)
  useEffect(() => {
    if (shouldFocusChatInput && inputRef.current) {
      inputRef.current.focus();
      clearChatInputFocus();
    }
  }, [shouldFocusChatInput, clearChatInputFocus]);

  const selectedServerId = ui.selectedServerId;
  const currentSelection = ui.perServerSelections[selectedServerId || ""] || {
    selectedChannelId: null,
    selectedPrivateChatId: null,
  };
  const { selectedChannelId, selectedPrivateChatId } = currentSelection;
  const {
    isMemberListVisible,
    isSettingsModalOpen,
    isAddServerModalOpen,
    isChannelListModalOpen,
    isChannelRenameModalOpen,
    isServerNoticesPopupOpen,
  } = ui;

  const isMobile = useMediaQuery("(max-width: 768px)");
  const isCompactInput = useMediaQuery("(max-width: 900px)");

  const { isScrolledUp, wasAtBottomRef, scrollToBottom } = useScrollToBottom(
    messagesContainerRef,
    messagesEndRef,
    {
      channelId: `${selectedChannelId || selectedPrivateChatId}-${isMemberListVisible}`,
    },
  );

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

  // Typing notification hook
  const typingNotification = useTypingNotification({
    serverId: selectedServerId,
    enabled: globalSettings.sendTypingNotifications,
  });

  // Media query hooks
  const isNarrowView = useMediaQuery();
  const isTooNarrowForMemberList = useMediaQuery("(max-width: 1080px)");

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

  // Handle setting reply and focusing input
  const handleSetReplyTo = (message: MessageType | null) => {
    setLocalReplyTo(message);
    // Focus the input after setting reply
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  };

  // Toggle notification sound volume
  const handleToggleNotificationVolume = async () => {
    const currentVolume = globalSettings.notificationVolume;
    const newVolume = currentVolume > 0 ? 0 : 0.4; // Toggle between 0 (muted) and 0.4 (40%)

    useStore.getState().updateGlobalSettings({
      notificationVolume: newVolume,
    });

    // Play test sound when enabling (not when disabling)
    if (newVolume > 0) {
      try {
        const audio = new Audio();
        audio.volume = newVolume;
        audio.src = "/sounds/notif2.mp3";
        // Wait for the audio to be loaded before playing
        audio.load();
        await audio.play();
      } catch (error) {
        console.error("Failed to play notification sound:", error);
      }
    }
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

  // Member list overlay: show when desktop is too narrow for sidebar
  const showMemberListOverlay =
    !isNarrowView &&
    isTooNarrowForMemberList &&
    isMemberListVisible &&
    !!selectedChannel &&
    !selectedPrivateChat;

  // Track previous width state to detect transitions
  const prevIsTooNarrowRef = useRef(isTooNarrowForMemberList);

  // Auto-hide/show member list based on screen size transitions (desktop only)
  useEffect(() => {
    // Only apply auto-hide/show logic on desktop (not mobile)
    if (isNarrowView) {
      prevIsTooNarrowRef.current = isTooNarrowForMemberList;
      return;
    }

    const wasWide = !prevIsTooNarrowRef.current;
    const isNowNarrow = isTooNarrowForMemberList;
    const wasNarrow = prevIsTooNarrowRef.current;
    const isNowWide = !isTooNarrowForMemberList;

    // On transition from narrow to wide: auto-show as sidebar
    if (wasNarrow && isNowWide && !isMemberListVisible) {
      toggleMemberList(true);
    }
    // On transition from wide to narrow: auto-hide
    else if (wasWide && isNowNarrow && isMemberListVisible) {
      toggleMemberList(false);
    }

    prevIsTooNarrowRef.current = isTooNarrowForMemberList;
  }, [
    isNarrowView,
    isTooNarrowForMemberList,
    isMemberListVisible,
    toggleMemberList,
  ]);

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

  // Filter messages based on search query
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) {
      return channelMessages;
    }
    const query = searchQuery.toLowerCase();
    return channelMessages.filter(
      (msg) =>
        msg.content.toLowerCase().includes(query) ||
        msg.userId.toLowerCase().includes(query),
    );
  }, [channelMessages, searchQuery]);

  // Virtualize messages - only show the last N messages unless searching
  const displayedMessages = useMemo(() => {
    if (searchQuery.trim()) {
      // Show all filtered results when searching
      return filteredMessages;
    }
    // Show only the last visibleMessageCount messages
    return filteredMessages.slice(-visibleMessageCount);
  }, [filteredMessages, visibleMessageCount, searchQuery]);

  const hasMoreMessages = filteredMessages.length > displayedMessages.length;

  // Memoize grouped events to prevent recalculation on every render
  const eventGroups = useMemo(
    () => groupConsecutiveEvents(displayedMessages),
    [displayedMessages],
  );

  // Scroll down on channel change
  // biome-ignore lint/correctness/useExhaustiveDependencies(selectedServerId): We want to scroll down only if server or channel changes
  // biome-ignore lint/correctness/useExhaustiveDependencies(selectedChannelId): We want to scroll down only if server or channel changes
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
    wasAtBottomRef.current = true;
    setVisibleMessageCount(100);
    setSearchQuery("");
  }, [selectedServerId, selectedChannelId, wasAtBottomRef]);

  // Scroll to bottom after chat history finishes loading
  const wasLoadingHistoryRef = useRef(false);
  const isLoadingHistory = selectedChannel?.isLoadingHistory ?? false;
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

  // Auto scroll to bottom on new messages
  // biome-ignore lint/correctness/useExhaustiveDependencies: We only want to scroll when messages change, not when isScrolledUp changes
  useEffect(() => {
    const isNarrowView = window.matchMedia("(max-width: 768px)").matches;
    const isChatVisible =
      !isNarrowView || ui.mobileViewActiveColumn === "chatView";

    // Only auto-scroll if:
    // 1. User was at bottom before messages arrived
    // 2. Chat is currently visible (not on channel list in mobile)
    if (wasAtBottomRef.current && isChatVisible) {
      scrollToBottom();
    }
  }, [displayedMessages, ui.mobileViewActiveColumn, scrollToBottom]);

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

    wasAtBottomRef.current = true;
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
  };

  const handleImageUpload = async (file: File) => {
    if (!selectedServer?.filehost || !selectedServerId) return;

    const filehostUrl = selectedServer.filehost;

    // Check if we have a JWT token, request one if not
    let jwtToken = selectedServer?.jwtToken;
    if (!jwtToken) {
      // Clear any existing JWT token to ensure we get a fresh one
      useStore.setState((state) => ({
        servers: state.servers.map((server) =>
          server.id === selectedServerId
            ? { ...server, jwtToken: undefined }
            : server,
        ),
      }));

      // Request JWT token from IRC server
      console.log(
        '🔑 Requesting fresh JWT token from IRC server for service "filehost"',
      );
      ircClient.requestExtJwt(selectedServerId, "*", "filehost");

      // Wait a bit for the token to arrive (this is a simple approach)
      // In a production app, you'd want to listen for the EXTJWT event
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check again after waiting
      const updatedServer = useStore
        .getState()
        .servers.find((s) => s.id === selectedServerId);
      jwtToken = updatedServer?.jwtToken;

      console.log(
        "🔑 After waiting, JWT token:",
        jwtToken ? `${jwtToken.substring(0, 20)}...` : "still null/undefined",
      );

      if (!jwtToken) {
        console.error("Failed to obtain JWT token for image upload");
        // TODO: Show error to user
        return;
      }
    }

    const formData = new FormData();
    formData.append("image", file);

    try {
      // Upload directly to the filehost URL with JWT authentication
      const uploadUrl = `${filehostUrl}/upload`;
      console.log("🔄 Image upload: Starting upload to", uploadUrl);
      console.log("🔑 JWT token present:", !!jwtToken);
      console.log(
        "� JWT token value:",
        jwtToken ? `${jwtToken.substring(0, 20)}...` : "null/undefined",
      );
      console.log("�📦 File size:", file.size, "bytes");

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
        body: formData,
      });

      console.log("📡 Response status:", response.status);
      console.log(
        "📡 Response headers:",
        Object.fromEntries(response.headers.entries()),
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Upload failed with status:", response.status);
        console.error("❌ Error response:", errorText);
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("✅ Upload successful:", data);
      if (data.saved_url) {
        // Create the full URL by prepending the filehost
        const fullImageUrl = `${filehostUrl}${data.saved_url}`;

        // Send the link directly to the current channel/user
        const target =
          selectedChannel?.name ?? selectedPrivateChat?.username ?? "";

        if (target) {
          // Send via IRC
          if (selectedServerId) {
            ircClient.sendRaw(
              selectedServerId,
              `PRIVMSG ${target} :${fullImageUrl}`,
            );
          }

          // Add to store for immediate display (only for private chats, channels echo back)
          if (selectedPrivateChat && currentUser && selectedServerId) {
            const outgoingMessage = {
              id: uuidv4(),
              content: fullImageUrl,
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
    const maxHeight = 200;
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
      // Find and select the private chat
      const server = servers.find((s) => s.id === selectedServerId);
      const privateChat = server?.privateChats?.find(
        (pc) => pc.username === username,
      );
      if (privateChat) {
        selectPrivateChat(privateChat.id, { navigate: true });
      }
    }
  };

  const handleOpenProfile = (username: string) => {
    setSelectedProfileUsername(username);
    setUserProfileModalOpen(true);
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
    openReactionModal(message);
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

  const handleRedactMessage = (message: MessageType) => {
    if (message.msgid && selectedServerId) {
      const confirmed = window.confirm(
        "Are you sure you want to delete this message? This action cannot be undone.",
      );
      if (confirmed) {
        const server = servers.find((s) => s.id === selectedServerId);
        if (!server) return;

        let target: string | undefined;
        if (message.channelId) {
          const channel = server.channels.find(
            (c) => c.id === message.channelId,
          );
          target = channel?.name;
        } else {
          // Private message, find by userId
          const privateChat = server.privateChats?.find(
            (pc) => pc.username === message.userId.split("-")[0],
          );
          target = privateChat?.username;
        }

        if (target) {
          redactMessage(selectedServerId, target, message.msgid);
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
    if (isTauri() && ["android", "ios"].includes(platform())) return;
    // Don't steal focus if any modal is open
    if (
      isSettingsModalOpen ||
      userProfileModalOpen ||
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
    userProfileModalOpen,
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
        selectedChannelId={selectedChannelId}
        currentUser={currentUser}
        isChanListVisible={isChanListVisible}
        isMemberListVisible={isMemberListVisible}
        isNarrowView={isNarrowView}
        globalSettings={globalSettings}
        searchQuery={searchQuery}
        onToggleChanList={onToggleChanList}
        onToggleMemberList={() => toggleMemberList(!isMemberListVisible)}
        onSearchQueryChange={setSearchQuery}
        onToggleNotificationVolume={handleToggleNotificationVolume}
        onOpenChannelSettings={() => setChannelSettingsModalOpen(true)}
        onOpenInviteUser={() => setInviteUserModalOpen(true)}
      />

      {/* Member list overlay replaces messages when desktop is too narrow for sidebar */}
      {showMemberListOverlay && (
        <div className="flex-grow overflow-hidden bg-discord-dark-100">
          <MemberList />
        </div>
      )}

      {/* Messages area */}
      {!showMemberListOverlay && (
        <>
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
              className="flex-grow overflow-y-auto overflow-x-hidden flex flex-col bg-discord-dark-200 text-discord-text-normal relative"
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
                <>
                  {/* View older messages button */}
                  {hasMoreMessages && !searchQuery && (
                    <div className="flex justify-center py-4">
                      <button
                        onClick={() =>
                          setVisibleMessageCount((prev) => prev + 100)
                        }
                        className="px-4 py-2 bg-discord-dark-400 hover:bg-discord-dark-300 text-discord-text-link rounded transition-colors"
                      >
                        View older messages (
                        {filteredMessages.length - displayedMessages.length}{" "}
                        hidden)
                      </button>
                    </div>
                  )}
                  {/* Search results indicator */}
                  {searchQuery && (
                    <div className="flex justify-center items-center gap-2 py-2 bg-discord-dark-300 text-discord-text-muted text-sm">
                      <span>
                        Found {filteredMessages.length} message
                        {filteredMessages.length === 1 ? "" : "s"} matching "
                        {searchQuery}"
                      </span>
                      <button
                        onClick={() => setSearchQuery("")}
                        className="text-red-400 hover:text-red-300"
                        title="Clear search"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {eventGroups.map((group) => {
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
                        setReplyTo={handleSetReplyTo}
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
                        onReactionUnreact={unreact}
                        onOpenReactionModal={openReactionModal}
                        onDirectReaction={directReaction}
                        serverId={selectedServerId || ""}
                        channelId={selectedChannelId || undefined}
                        onRedactMessage={handleRedactMessage}
                        onOpenProfile={handleOpenProfile}
                      />
                    );
                  })}
                </>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
          {!selectedServer && <DiscoverGrid />}
          {/* Scroll to bottom button */}
          <ScrollToBottomButton
            isVisible={isScrolledUp}
            onClick={scrollToBottom}
          />

          {/* Input area */}
          {(selectedChannel || selectedPrivateChat) && (
            <div className={`${!isNarrowView && "px-4"} pb-4 relative`}>
              <TypingIndicator
                serverId={selectedServerId ?? ""}
                channelId={selectedChannelId || selectedPrivateChatId || ""}
              />
              {localReplyTo && (
                <ReplyBadge
                  replyTo={localReplyTo}
                  onClose={() => setLocalReplyTo(null)}
                  isWhisper={
                    !!(
                      localReplyTo.tags?.["draft/channel-context"] ||
                      localReplyTo.tags?.["+draft/channel-context"]
                    )
                  }
                />
              )}
              <div className="bg-discord-dark-100 rounded-lg flex items-center relative flex-nowrap">
                <button
                  className="px-2 sm:px-4 text-discord-text-muted hover:text-discord-text-normal flex-shrink-0"
                  onClick={() => setShowPlusMenu((prev) => !prev)}
                >
                  <FaPlus />
                </button>

                <TextArea
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
                          !isMobile &&
                          !isCompactInput
                            ? globalSettings.multilineOnShiftEnter
                              ? " (Shift+Enter for new line)"
                              : " (Enter for new line, Shift+Enter to send)"
                            : ""
                        }`
                      : selectedPrivateChat
                        ? `Message @${selectedPrivateChat.username}${
                            globalSettings.enableMultilineInput &&
                            !isMobile &&
                            !isCompactInput
                              ? globalSettings.multilineOnShiftEnter
                                ? " (Shift+Enter for new line)"
                                : " (Enter for new line, Shift+Enter to send)"
                              : ""
                          }`
                        : "Type a message..."
                  }
                  className="bg-transparent border-none outline-none py-3 flex-grow text-discord-text-normal resize-none min-h-[44px] max-h-[200px] overflow-y-auto placeholder:truncate"
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
                          const file = (e.target as HTMLInputElement)
                            .files?.[0];
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

              <EmojiPickerModal
                isOpen={isEmojiSelectorOpen}
                onEmojiClick={handleEmojiSelect}
                onClose={() => setIsEmojiSelectorOpen(false)}
                onBackdropClick={handleEmojiModalBackdropClick}
              />

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
        </>
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
        onOpenProfile={handleOpenProfile}
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
        onClose={closeReactionModal}
        onSelectEmoji={selectReaction}
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

      {selectedChannel && selectedServerId && (
        <InviteUserModal
          isOpen={inviteUserModalOpen}
          onClose={() => setInviteUserModalOpen(false)}
          serverId={selectedServerId}
          channelName={selectedChannel.name}
        />
      )}

      {selectedServerId && (
        <UserProfileModal
          isOpen={userProfileModalOpen}
          onClose={() => setUserProfileModalOpen(false)}
          serverId={selectedServerId}
          username={selectedProfileUsername}
        />
      )}

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
                        onReactionUnreact={unreact}
                        onOpenReactionModal={openReactionModal}
                        onDirectReaction={directReaction}
                        serverId={selectedServerId || ""}
                        channelId={undefined}
                        onRedactMessage={handleRedactMessage}
                        onOpenProfile={handleOpenProfile}
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
