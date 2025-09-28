import type React from "react";

interface ReactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  position?: { x: number; y: number };
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
  position,
}) => {
  if (!isOpen) return null;

  const handleEmojiSelect = (emoji: string) => {
    onSelectEmoji(emoji);
    onClose();
  };

  const modalStyle = position
    ? {
        position: "fixed" as const,
        left: position.x,
        top: position.y,
        zIndex: 1000,
      }
    : {};

  return (
    <div
      className="bg-discord-dark-400 p-4 rounded-lg shadow-lg border border-discord-dark-300"
      style={modalStyle}
    >
      <div className="grid grid-cols-10 gap-2 max-w-xs">
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
  );
};

export default ReactionModal;
