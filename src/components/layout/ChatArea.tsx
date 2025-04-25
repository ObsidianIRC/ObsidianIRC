import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
  FaAt,
  FaBell,
  FaGift,
  FaGrinAlt,
  FaHashtag,
  FaPenAlt,
  FaPlus,
  FaReply,
  FaSearch,
  FaTimes,
  FaUserPlus,
} from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import { IsUserTyping } from "../../lib/ircUtils";
import useStore from "../../store";
import type { Message as MessageType, User } from "../../types";
import EmojiSelector from "../ui/EmojiSelector";

const EMPTY_ARRAY: User[] = [];
let lastTypingTime = 0;

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
          <span>{message.content}</span>
          <div className="text-xs opacity-70">
            {formatTime(new Date(message.timestamp))}
          </div>
        </div>
      </div>
    );
  }

  if (message.content.substring(0, 7) === "\u0001ACTION") {
    return (
      <div className="px-4 py-1 hover:bg-discord-message-hover group">
        {showDate && (
          <div className="flex items-center text-xs text-discord-text-muted mb-2">
            <div className="flex-grow border-t border-discord-dark-400" />
            <div className="px-2">
              {formatDate(new Date(message.timestamp))}
            </div>
            <div className="flex-grow border-t border-discord-dark-400" />
          </div>
        )}
        <div className="flex">
          <div className="mr-4">
            <div className="w-10 h-10 rounded-full bg-discord-dark-400 flex items-center justify-center text-white">
              {message.userId.charAt(0).toUpperCase()}
            </div>
          </div>
          <div className={`flex-1 ${isCurrentUser ? "text-white" : ""}`}>
            <div className="flex items-center">
              <span className="ml-2 text-xs text-discord-text-muted">
                {formatTime(new Date(message.timestamp))}
              </span>
            </div>
            <span className="italic text-white">
              {message.userId === "system"
                ? "System"
                : message.userId.split("-")[0] + message.content.substring(7)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-1 hover:bg-discord-message-hover group relative">
      {showDate && (
        <div className="flex items-center text-xs text-discord-text-muted mb-2">
          <div className="flex-grow border-t border-discord-dark-400" />
          <div className="px-2">{formatDate(new Date(message.timestamp))}</div>
          <div className="flex-grow border-t border-discord-dark-400" />
        </div>
      )}
      <div className="flex">
        {showHeader && (
          <div className="mr-4">
            <div className="w-10 h-10 rounded-full bg-discord-dark-400 flex items-center justify-center text-white">
              {message.userId.charAt(0).toUpperCase()}
            </div>
          </div>
        )}
        {!showHeader && (
          <div className="mr-4">
            <div className="w-10" />
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
              <span className="ml-2 text-xs text-discord-text-muted">
                {formatTime(new Date(message.timestamp))}
              </span>
            </div>
          )}
          <div>
            {message.replyMessage && (
              <div className="bg-discord-dark-200 rounded text-sm text-discord-text-muted mb-2 pl-1 pr-2">
                ┌ Replying to{" "}
                <strong>{message.replyMessage.userId.split("-")[0]}:</strong>{" "}
                {message.replyMessage.content}
              </div>
            )}
            {/* Handle mentions in the message content */}
            {message.content.split(/(@\w+)/).map((part, i) => {
              const uniqueKey = `${message.id}-${i}-${part}`;
              if (part.startsWith("@")) {
                return (
                  <span
                    key={uniqueKey}
                    className="bg-discord-dark-500 bg-opacity-30 text-discord-text-link rounded px-0.5"
                  >
                    {part}
                  </span>
                );
              }
              return <span key={uniqueKey}>{part}</span>;
            })}
          </div>
        </div>
      </div>
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

export const ChatArea: React.FC = () => {
  const [localReplyTo, setLocalReplyTo] = useState<MessageType | null>(null);
  const [messageText, setMessageText] = useState("");
  const [isEmojiSelectorOpen, setIsEmojiSelectorOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { currentUser } = useStore();
  const {
    servers,
    ui: { selectedServerId, selectedChannelId },
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

  // Auto scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  });

  // Focus input on channel change
  useEffect(() => {
    inputRef.current?.focus();
  });

  const handleSendMessage = () => {
    if (messageText.trim() === "") return;
    if (selectedServerId && selectedChannelId) {
      if (messageText.startsWith("/")) {
        // Handle command
        // TODO: Implement proper command registry
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
          // Handle other commands
          ircClient.sendRaw(
            selectedServerId,
            `${commandName} :${args.join(" ")}`,
          );
        }
      } else {
        ircClient.sendRaw(
          selectedServerId,
          `${localReplyTo ? `@+reply=${localReplyTo.id};` : ""}PRIVMSG ${selectedChannel?.name ?? ""} :${messageText}`,
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
    } else if (
      text.length === 0 &&
      IsUserTyping(
        selectedServerId ?? "",
        selectedChannelId ?? "",
        currentUser?.username ?? "",
      )
    ) {
      ircClient.sendRaw(
        selectedServerId ?? "",
        `@+typing=done TAGMSG ${selectedChannel?.name ?? ""}`,
      );
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessageText((prev) => prev + emoji);
    setIsEmojiSelectorOpen(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Channel header */}
      <div className="h-12 px-4 border-b border-discord-dark-400 flex items-center justify-between shadow-sm">
        <div className="flex items-center">
          <FaHashtag className="text-discord-text-muted mr-2" />
          <h2 className="font-bold text-white">
            {selectedChannel
              ? selectedChannel.name.replace(/^#/, "")
              : "welcome"}
          </h2>
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
      <div className="flex-grow overflow-y-auto flex flex-col bg-discord-dark-200 text-discord-text-normal">
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
                  new Date(channelMessages[index - 1]?.timestamp).toDateString()
              }
              showHeader={showHeader}
              setReplyTo={setLocalReplyTo}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {selectedChannel && (
        <div className="px-4 pb-4 relative">
          <TypingIndicator
            serverId={selectedServerId ?? ""}
            channelId={selectedChannelId ?? ""}
          />
          <div className="bg-discord-dark-100 rounded-lg flex items-center">
            <button className="px-4 text-discord-text-muted hover:text-discord-text-normal">
              <FaPlus />
            </button>
            {localReplyTo && (
              <div className="bg-discord-dark-200 rounded text-sm text-discord-text-muted mr-3 pl-1 pr-2">
                Replying to <strong>{localReplyTo.userId}</strong>
                <button
                  className="ml-1 text-xs text-discord-text-muted hover:text-discord-text-normal"
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
            />
            <button
              className="px-3 text-discord-text-muted hover:text-discord-text-normal"
              onClick={() => setIsEmojiSelectorOpen((prev) => !prev)}
            >
              <FaGrinAlt />
            </button>
            <button className="px-3 text-discord-text-muted hover:text-discord-text-normal">
              <FaGift />
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
        </div>
      )}
    </div>
  );
};

export default ChatArea;
