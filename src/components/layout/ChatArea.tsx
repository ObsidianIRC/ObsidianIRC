import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { FaHashtag, FaBell, FaPenAlt, FaSearch, FaUserPlus, FaGift, FaGrinAlt, FaPlus, FaAt } from 'react-icons/fa';
import useStore from '../../store';
import type { Message as MessageType } from '../../types';
import EmojiSelector from '../ui/EmojiSelector';

const MessageItem: React.FC<{ message: MessageType; showDate: boolean }> = ({ message, showDate }) => {
  const { currentUser } = useStore();
  const isCurrentUser = currentUser?.id === message.userId;
  const isSystem = message.type === 'system';

  // Format timestamp
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // Format date for message groups
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  if (isSystem) {
    return (
      <div className="px-4 py-1 text-discord-text-muted text-sm opacity-80">
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 rounded-full bg-discord-text-muted" />
          <span>{message.content}</span>
          <div className="text-xs opacity-70">{formatTime(new Date(message.timestamp))}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-1 hover:bg-discord-message-hover group">
      {showDate && (
        <div className="flex items-center text-xs text-discord-text-muted mb-2">
          <div className="flex-grow border-t border-discord-dark-400" />
          <div className="px-2">{formatDate(new Date(message.timestamp))}</div>
          <div className="flex-grow border-t border-discord-dark-400" />
        </div>
      )}
      <div className="flex">
        <div className="mr-4">
          <div className="w-10 h-10 rounded-full bg-discord-dark-400 flex items-center justify-center text-white">
            {message.userId.charAt(0).toUpperCase()}
          </div>
        </div>
        <div className={`flex-1 ${isCurrentUser ? 'text-white' : ''}`}>
          <div className="flex items-center">
            <span className="font-medium text-white">{message.userId === 'system' ? 'System' : message.userId.split('-')[0]}</span>
            <span className="ml-2 text-xs text-discord-text-muted">{formatTime(new Date(message.timestamp))}</span>
          </div>
          <div>
            {/* Handle mentions in the message content */}
            {message.content.split(/(@\w+)/).map((part, i) => {
              const uniqueKey = `${message.id}-${i}-${part}`;
              if (part.startsWith('@')) {
                return (
                  <span key={uniqueKey} className="bg-discord-dark-500 bg-opacity-30 text-discord-text-link rounded px-0.5">
                    {part}
                  </span>
                );
              }
              return <span key={uniqueKey}>{part}</span>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ChatArea: React.FC = () => {
  const [messageText, setMessageText] = useState('');
  const [isEmojiSelectorOpen, setIsEmojiSelectorOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    servers,
    ui: { selectedServerId, selectedChannelId },
    sendMessage,
    messages,
  } = useStore();

  // Get selected server and channel
  const selectedServer = servers.find(s => s.id === selectedServerId);
  const selectedChannel = selectedServer?.channels.find(c => c.id === selectedChannelId);

  // Get messages for current channel
  const channelKey = selectedServerId && selectedChannelId ? `${selectedServerId}-${selectedChannelId}` : '';
  const channelMessages = channelKey ? messages[channelKey] || [] : [];

  // Auto scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  });

  // Focus input on channel change
  useEffect(() => {
    inputRef.current?.focus();
  });

  const handleSendMessage = () => {
    if (messageText.trim() === '') return;
    if (selectedServerId && selectedChannelId) {
      sendMessage(selectedServerId, selectedChannelId, messageText);
      setMessageText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
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
            {selectedChannel ? selectedChannel.name.replace(/^#/, '') : 'welcome'}
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
        {channelMessages.map((item, index) => {
          const previousMessage = channelMessages[index - 1];
          const showDate =
            index === 0 || // First message in the channel
            new Date(item.timestamp).getTime() - new Date(previousMessage?.timestamp).getTime() > 5 * 60 * 1000; // 5 minutes gap
          return <MessageItem key={item.id} message={item} showDate={showDate} />;
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {selectedChannel && (
        <div className="px-4 py-4 relative">
          <div className="bg-discord-dark-100 rounded-lg flex items-center">
            <button className="px-4 text-discord-text-muted hover:text-discord-text-normal">
              <FaPlus />
            </button>
            <input
              ref={inputRef}
              type="text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message #${selectedChannel.name.replace(/^#/, '')}`}
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
