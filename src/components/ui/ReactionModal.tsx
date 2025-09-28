import type React from "react";

interface ReactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
}

const emojis = [
  "😀",
  "😂",
  "😍",
  "👍",
  "🎉",
  "❤️",
  "🔥",
  "😎",
  "💯",
  "🎶",
  "😢",
  "😡",
  "🤔",
  "🙄",
  "😴",
  "🤗",
  "🤩",
  "🥳",
  "🤯",
  "😱",
  "👏",
  "🙌",
  "🤝",
  "👌",
  "✌️",
  "🤞",
  "🤙",
  "👊",
  "🤛",
  "🤜",
  "💪",
  "🦾",
  "🦿",
  "🦵",
  "🦶",
  "👂",
  "🦻",
  "👃",
  "👶",
  "👧",
  "🧑",
  "👨",
  "👩",
  "🧓",
  "👴",
  "👵",
  "🙍",
  "🙎",
  "🙅",
  "🙆",
];

const ReactionModal: React.FC<ReactionModalProps> = ({
  isOpen,
  onClose,
  onSelectEmoji,
}) => {
  if (!isOpen) return null;

  const handleEmojiSelect = (emoji: string) => {
    onSelectEmoji(emoji);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-dark-400 p-4 rounded-lg shadow-lg border border-discord-dark-300 max-w-sm w-full mx-4">
        <div className="grid grid-cols-10 gap-2">
          {emojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleEmojiSelect(emoji)}
              className="text-2xl hover:bg-discord-dark-300 p-1 rounded transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-2 text-sm text-discord-text-muted hover:text-white w-full text-center"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default ReactionModal;
