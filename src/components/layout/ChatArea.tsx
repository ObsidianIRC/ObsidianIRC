import { UsersIcon } from "@heroicons/react/24/solid";
import { platform } from "@tauri-apps/plugin-os";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import {
  FaArrowDown,
  FaAt,
  FaBell,
  FaChevronLeft,
  FaChevronRight,
  FaGrinAlt,
  FaHashtag,
  FaPenAlt, // Added
  FaPlus,
  FaReply,
  FaSearch,
  FaTimes,
  FaUserPlus, // Added
} from "react-icons/fa";

import { useMediaQuery } from "../../hooks/useMediaQuery";
import ircClient from "../../lib/ircClient";
import { mircToHtml } from "../../lib/ircUtils";
import useStore from "../../store";
import type { Message as MessageType, User } from "../../types";
import BlankPage from "../ui/BlankPage";
import EmojiSelector from "../ui/EmojiSelector";
import DiscoverGrid from "../ui/HomeScreen";

const EMPTY_ARRAY: User[] = [];
let lastTypingTime = 0;

export const OptionsDropdown: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="absolute right-0 mt-2 w-48 bg-discord-dark-300 rounded-md shadow-xl z-10 border border-discord-dark-500">
      <div className="py-1">
        <button
          className="block px-4 py-2 text-sm text-discord-text-muted hover:bg-discord-dark-200 hover:text-white w-full text-left transition-colors duration-150"
          onClick={onClose}
        >
          Option 1
        </button>
        <button
          className="block px-4 py-2 text-sm text-discord-text-muted hover:bg-discord-dark-200 hover:text-white w-full text-left transition-colors duration-150"
          onClick={onClose}
        >
          Option 2
        </button>
      </div>
    </div>
  );
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

const MessageItem: React.FC<{
  message: MessageType;
  showDate: boolean;
  showHeader: boolean;
  setReplyTo: (msg: MessageType) => void;
}> = ({ message, showDate, showHeader, setReplyTo }) => {
  const { currentUser } = useStore();
  const isCurrentUser = currentUser?.id === message.userId;
  const isSystem = message.type === "system";

  // Convert message content to React elements
  const htmlContent = mircToHtml(message.content);

  // Format timestamp
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // Format date for message groups
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  if (isSystem) {
    return (
      <div className="px-4 py-1 text-discord-text-muted text-sm opacity-80">
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 rounded-full bg-discord-text-muted" />
          <div>{htmlContent}</div>
          <div className="text-xs opacity-70">
            {formatTime(new Date(message.timestamp))}
          </div>
        </div>
      </div>
    );
  }

  const theme = localStorage.getItem("theme") || "discord";

  return (
    <div className={`px-4 py-1 hover:bg-${theme}-message-hover group relative`}>
      {showDate && (
        <div
          className={`flex items-center text-xs text-${theme}-text-muted mb-2`}
        >
          <div className={`flex-grow border-t border-${theme}-dark-400`} />
          <div className="px-2">{formatDate(new Date(message.timestamp))}</div>
          <div className={`flex-grow border-t border-${theme}-dark-400`} />
        </div>
      )}
      <div className="flex">
        {showHeader && (
          <div className="mr-4">
            <div
              className={`w-8 h-8 rounded-full bg-${theme}-dark-400 flex items-center justify-center text-white`}
            >
              {message.userId.charAt(0).toUpperCase()}
            </div>
          </div>
        )}
        {!showHeader && (
          <div className="mr-4">
            <div className="w-8" />
          </div>
        )}
        <div className={`flex-1 ${isCurrentUser ? "text-white" : ""}`}>
          {showHeader && (
            <div className="flex items-center">
              <span className="font-bold text-white">
                {message.userId === "system"
                  ? "System"
                  : message.userId.split("-")[0]}
              </span>
              <span className={`ml-2 text-xs text-${theme}-text-muted`}>
                {formatTime(new Date(message.timestamp))}
              </span>
            </div>
          )}
          <div>
            {message.replyMessage && (
              <div
                className={`bg-${theme}-dark-200 rounded text-sm text-${theme}-text-muted mb-2 pl-1 pr-2`}
              >
                ┌ Replying to{" "}
                <strong>{message.replyMessage.userId.split("-")[0]}:</strong>{" "}
                {message.replyMessage.content}
              </div>
            )}
            <div>{htmlContent}</div>
          </div>
        </div>
      </div>
      {/* Hover buttons */}
      <div className="absolute bottom-1 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
        <button
          className="bg-discord-dark-300 hover:bg-discord-dark-200 text-white px-2 py-1 rounded text-xs"
          onClick={() => setReplyTo(message)}
        >
          <FaReply />
        </button>
        <button
          className="bg-discord-dark-300 hover:bg-discord-dark-200 text-white px-2 py-1 rounded text-xs"
          onClick={() => console.log("React to", message.id)}
        >
          <FaGrinAlt />
        </button>
      </div>
    </div>
  );
};

export const ChatArea: React.FC<{
  onToggleChanList: () => void;
  isChanListVisible: boolean;
}> = ({ onToggleChanList, isChanListVisible }) => {
  const [localReplyTo, setLocalReplyTo] = useState<MessageType | null>(null);
  const [messageText, setMessageText] = useState("");
  const [isEmojiSelectorOpen, setIsEmojiSelectorOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#ffffff");
  const [selectedFormatting, setSelectedFormatting] = useState<string[]>([]);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { currentUser } = useStore();
  const {
    servers,
    ui: { selectedServerId, selectedChannelId, isMemberListVisible },
    toggleMemberList,
    sendMessage,
    messages,
  } = useStore();

  // Get selected server and channel
  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const selectedChannel = selectedServer?.channels.find(
    (c) => c.id === selectedChannelId,
  );

  // Get messages for current channel
  const channelKey =
    selectedServerId && selectedChannelId
      ? `${selectedServerId}-${selectedChannelId}`
      : "";
  const channelMessages = channelKey ? messages[channelKey] || [] : [];

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

  const getColorCode = (color: string): string => {
    const index = IRC_COLORS.indexOf(color);
    return index !== -1 ? `\x03${index}` : ""; // Return \x03 followed by the index, or an empty string if not found
  };

  const handleSendMessage = () => {
    if (messageText.trim() === "") return;
    scrollDown();
    if (selectedServerId && selectedChannelId) {
      if (messageText.startsWith("/")) {
        // Handle command
        const command = messageText.substring(1).trim();
        const [commandName, ...args] = command.split(" ");
        if (commandName === "nick") {
          ircClient.sendRaw(selectedServerId, `NICK ${args[0]}`);
        } else if (commandName === "join") {
          ircClient.joinChannel(selectedServerId, args[0]);
          ircClient.triggerEvent("JOIN", {
            serverId: selectedServerId,
            username: currentUser?.username ? currentUser.username : "",
            channelName: args[0],
          });
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
        } else if (commandName === "me") {
          const actionMessage = messageText.substring(4).trim();
          ircClient.sendRaw(
            selectedServerId,
            `PRIVMSG ${selectedChannel ? selectedChannel.name : ""} :\u0001ACTION ${actionMessage}\u0001`,
          );
        } else {
          ircClient.sendRaw(
            selectedServerId,
            `${commandName} :${args.join(" ")}`,
          );
        }
      } else {
        const colorCode = getColorCode(selectedColor); // Get the IRC color code

        // Apply formatting codes
        let formattedText = messageText;
        if (selectedFormatting.includes("bold")) {
          formattedText = `\x02${formattedText}\x02`;
        }
        if (selectedFormatting.includes("italic")) {
          formattedText = `\x1D${formattedText}\x1D`;
        }
        if (selectedFormatting.includes("underline")) {
          formattedText = `\x1F${formattedText}\x1F`;
        }

        // Prepend the color code
        formattedText = `${colorCode}${formattedText}`;

        ircClient.sendRaw(
          selectedServerId,
          `${localReplyTo ? `@+reply=${localReplyTo.id};` : ""} PRIVMSG ${selectedChannel?.name ?? ""} :${formattedText}`,
        );
      }
      setMessageText("");
      setLocalReplyTo(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
      ircClient.sendRaw(
        selectedServerId ?? "",
        `@+typing=done TAGMSG ${selectedChannel?.name ?? ""}`,
      );
      lastTypingTime = 0;
    }
  };

  const handleUpdatedText = (text: string) => {
    if (text.length > 0 && text[0] !== "/") {
      const server = useStore
        .getState()
        .servers.find((s) => s.id === selectedServerId);
      if (!server) return;
      const channel = server.channels.find((c) => c.id === selectedChannelId);
      if (!channel) return;

      const currentTime = Date.now();
      if (currentTime - lastTypingTime < 5000) return;

      lastTypingTime = currentTime;
      ircClient.sendRaw(
        selectedServerId ?? "",
        `@+typing=active TAGMSG ${channel.name}`,
      );
    } else if (text.length === 0) {
      ircClient.sendRaw(
        selectedServerId ?? "",
        `@+typing=done TAGMSG ${selectedChannel?.name ?? ""}`,
      );
      lastTypingTime = 0;
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessageText((prev) => prev + emoji);
    setIsEmojiSelectorOpen(false);
  };

  const handleColorSelect = (color: string, formatting: string[]) => {
    setSelectedColor(color);
    setSelectedFormatting(formatting);
    setIsColorPickerOpen(false);
  };

  const toggleFormatting = (format: string) => {
    setSelectedFormatting((prev) =>
      prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format],
    );
  };

  const isNarrowView = useMediaQuery();

  // Focus input on channel change
  useEffect(() => {
    if ("__TAURI__" in window && ["android", "ios"].includes(platform()))
      return;
    inputRef.current?.focus();
  });

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
              <FaHashtag className="text-discord-text-muted mr-2" />
              <h2 className="font-bold text-white mr-4">
                {selectedChannel.name.replace(/^#/, "")}
              </h2>
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
        <div className="flex items-center gap-4 text-discord-text-muted">
          <button className="hover:text-discord-text-normal">
            <FaBell />
          </button>
          <button className="hover:text-discord-text-normal">
            <FaPenAlt />
          </button>
          <button className="hover:text-discord-text-normal">
            <FaUserPlus />
          </button>
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
          <div className="relative">
            <input
              type="text"
              placeholder="Search"
              className="bg-discord-dark-400 text-discord-text-muted text-sm rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-discord-text-link"
            />
            <FaSearch className="absolute right-2 top-1.5 text-xs" />
          </div>
        </div>
      </div>

      {/* Messages area */}
      {selectedServer && !selectedChannel && (
        <div className="flex-grow flex flex-col items-center justify-center bg-discord-dark-200">
          <BlankPage /> {/* Render the blank page */}
        </div>
      )}
      {selectedChannel && (
        <div
          ref={messagesContainerRef}
          className="flex-grow overflow-y-auto flex flex-col bg-discord-dark-200 text-discord-text-normal relative"
        >
          {channelMessages.map((message, index) => {
            const previousMessage = channelMessages[index - 1];
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
                    new Date(
                      channelMessages[index - 1]?.timestamp,
                    ).toDateString()
                }
                showHeader={showHeader}
                setReplyTo={setLocalReplyTo}
              />
            );
          })}
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
      {selectedChannel && (
        <div className={`${!isNarrowView && "px-4"} pb-4 relative`}>
          <OptionsDropdown
            isOpen={isEmojiSelectorOpen}
            onClose={() => setIsEmojiSelectorOpen(false)}
          />
          <TypingIndicator
            serverId={selectedServerId ?? ""}
            channelId={selectedChannelId ?? ""}
          />
          <div className="bg-discord-dark-100 rounded-lg flex items-center">
            <button className="px-4 text-discord-text-muted hover:text-discord-text-normal">
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
            <input
              ref={inputRef}
              type="text"
              value={messageText}
              onChange={(e) => {
                setMessageText(e.target.value);
                handleUpdatedText(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder={`Message #${selectedChannel.name.replace(/^#/, "")}`}
              className="bg-transparent border-none outline-none py-3 flex-grow text-discord-text-normal"
              style={{
                color: selectedColor,
                fontWeight: selectedFormatting.includes("bold")
                  ? "bold"
                  : "normal",
                fontStyle: selectedFormatting.includes("italic")
                  ? "italic"
                  : "normal",
                textDecoration: selectedFormatting.includes("underline")
                  ? "underline"
                  : "none",
              }}
            />
            <button
              className="px-3 text-discord-text-muted hover:text-discord-text-normal"
              onClick={() => setIsEmojiSelectorOpen((prev) => !prev)}
            >
              <FaGrinAlt />
            </button>
            <button
              className="px-3 text-discord-text-muted hover:text-discord-text-normal"
              onClick={() => setIsColorPickerOpen((prev) => !prev)}
            >
              <div
                className="w-4 h-4 rounded-full border-dark-2 -500"
                style={{
                  backgroundColor:
                    selectedColor === "inherit" ? "transparent" : selectedColor,
                }}
              />
            </button>
            <button className="px-3 text-discord-text-muted hover:text-discord-text-normal">
              <FaAt />
            </button>
          </div>

          {isEmojiSelectorOpen && (
            <EmojiSelector
              onSelect={handleEmojiSelect}
              onClose={() => setIsEmojiSelectorOpen(false)}
            />
          )}

          {isColorPickerOpen && (
            <ColorPicker
              onSelect={(color) => setSelectedColor(color)}
              onClose={() => setIsColorPickerOpen(false)}
              selectedFormatting={selectedFormatting}
              toggleFormatting={toggleFormatting}
            />
          )}
        </div>
      )}
    </div>
  );
};

const IRC_COLORS = [
  "#FFFFFF",
  "#000000",
  "#00009D",
  "#009300",
  "#FF0000",
  "#7F0000",
  "#9C009C",
  "#FC7F00",
  "#FFFF00",
  "#00FC00",
  "#009393",
  "#00FFFF",
  "#0000FC",
  "#FF00FF",
  "#7F7F7F",
  "#D2D2D2",
  "#470000",
  "#472100",
  "#474700",
  "#324700",
  "#004700",
  "#00472C",
  "#004747",
  "#002747",
  "#000047",
  "#2E0047",
  "#470047",
  "#47002A",
  "#740000",
  "#743A00",
  "#747400",
  "#517400",
  "#007400",
  "#007449",
  "#007474",
  "#004074",
  "#000074",
  "#4B0074",
  "#740074",
  "#740045",
  "#B50000",
  "#B56300",
  "#B5B500",
  "#7DB500",
  "#00B500",
  "#00B571",
  "#00B5B5",
  "#0063B5",
  "#0000B5",
  "#7500B5",
  "#B500B5",
  "#B5006B",
  "#FF000B",
  "#FF8C00",
  "#FFFF0B",
  "#B2FF00",
  "#00FF00",
  "#00FFA0",
  "#00FFFB",
  "#008CFF",
  "#0000FF",
  "#A500FF",
  "#FF00FB",
  "#FF0098",
  "#FF5959",
  "#FFB459",
  "#FFFF71",
  "#CFFF60",
  "#6FFF6F",
  "#65FFC9",
  "#6DFFFF",
  "#59B4FF",
  "#5959FF",
  "#C459FF",
  "#FF66FF",
  "#FF59BC",
  "#FF9C9C",
  "#FFD39C",
  "#FFFF9C",
  "#E2FF9C",
  "#9CFF9C",
  "#9CFFDB",
  "#9CFFFF",
  "#9CD3FF",
  "#9C9CFF",
  "#DC9CFF",
  "#FF9CFF",
  "#FF94D3",
  "#00000A",
  "#131313",
  "#282828",
  "#363636",
  "#4D4D4D",
  "#656565",
  "#818181",
  "#9F9F9F",
  "#BCBCBC",
  "#E2E2E2",
  "#FFFFF0",
  "inherit",
];

const ColorPicker: React.FC<{
  onSelect: (color: string, formatting: string[]) => void;
  onClose: () => void;
  selectedFormatting: string[];
  toggleFormatting: (format: string) => void;
}> = ({ onSelect, onClose, selectedFormatting, toggleFormatting }) => {
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  return (
    <div className="absolute bottom-16 right-4 z-50 bg-discord-dark-300 p-4 rounded shadow-lg">
      <div className="grid grid-cols-8 gap-2 mb-4">
        {IRC_COLORS.map((color, index) => {
          const uniqueKey = `obsidian-${color}-${index}`; // Copy the index to another variable
          const isSelected = selectedColor === color;

          return (
            <button
              key={uniqueKey} // Use the new variable for the key
              className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                isSelected
                  ? "border-dark-500 shadow-md shadow-black-500"
                  : "border-dark-500"
              }`}
              style={{
                backgroundColor: color === "inherit" ? "transparent" : color,
              }}
              onClick={() => {
                setSelectedColor(color);
                onSelect(color, selectedFormatting);
              }}
            >
              {color === "inherit" && (
                <span className="text-xs text-purple-500 font-bold">
                  <FaTimes />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between mb-4">
        <button
          className={`px-2 py-1 rounded ${
            selectedFormatting.includes("bold")
              ? "bg-discord-dark-200"
              : "bg-discord-dark-400"
          }`}
          onClick={() => toggleFormatting("bold")}
        >
          Bold
        </button>
        <button
          className={`px-2 py-1 rounded ${
            selectedFormatting.includes("italic")
              ? "bg-discord-dark-200"
              : "bg-discord-dark-400"
          }`}
          onClick={() => toggleFormatting("italic")}
        >
          Italic
        </button>
        <button
          className={`px-2 py-1 rounded ${
            selectedFormatting.includes("underline")
              ? "bg-discord-dark-200"
              : "bg-discord-dark-400"
          }`}
          onClick={() => toggleFormatting("underline")}
        >
          Underline
        </button>
      </div>
      <button
        onClick={onClose}
        className="w-full bg-discord-dark-400 hover:bg-discord-dark-200 text-white py-1 rounded"
      >
        Close
      </button>
    </div>
  );
};

export default ChatArea;
