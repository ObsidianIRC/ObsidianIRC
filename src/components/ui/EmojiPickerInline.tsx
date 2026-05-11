import type { EmojiClickData } from "emoji-picker-react";
import { useEffect, useRef } from "react";
import type { PickerCustomEmoji } from "../../lib/customEmojiPicker";
import { AppEmojiPicker } from "./AppEmojiPicker";

interface EmojiPickerInlineProps {
  isOpen: boolean;
  onEmojiClick: (emojiData: EmojiClickData) => void;
  onClose: () => void;
  customEmojis?: PickerCustomEmoji[];
}

export function EmojiPickerInline({
  isOpen,
  onEmojiClick,
  onClose,
  customEmojis,
}: EmojiPickerInlineProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 z-30 mb-2 bg-discord-dark-300 rounded-lg shadow-lg border border-discord-dark-200 overflow-hidden"
    >
      <AppEmojiPicker onEmojiClick={onEmojiClick} customEmojis={customEmojis} />
    </div>
  );
}
