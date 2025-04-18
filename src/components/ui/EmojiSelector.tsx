import React from 'react';

interface EmojiSelectorProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const emojis = ['😀', '😂', '😍', '👍', '🎉', '❤️', '🔥', '😎', '💯', '🎶'];

const EmojiSelector: React.FC<EmojiSelectorProps> = ({ onSelect, onClose }) => {
  return (
    <div className="absolute bottom-16 right-4 bg-discord-dark-400 p-4 rounded-lg shadow-lg z-50">
      <div className="flex flex-wrap gap-2">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            className="text-2xl hover:bg-discord-dark-300 p-1 rounded"
          >
            {emoji}
          </button>
        ))}
      </div>
      <button
        onClick={onClose}
        className="mt-2 text-sm text-discord-text-muted hover:text-white"
      >
        Close
      </button>
    </div>
  );
};

export default EmojiSelector;