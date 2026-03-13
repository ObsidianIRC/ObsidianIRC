import type { EmojiClickData } from "emoji-picker-react";
import { createPortal } from "react-dom";
import { AppEmojiPicker } from "./AppEmojiPicker";

interface EmojiPickerModalProps {
  isOpen: boolean;
  onEmojiClick: (emojiData: EmojiClickData) => void;
  onClose: () => void;
  onBackdropClick: (e: React.MouseEvent) => void;
}

export function EmojiPickerModal({
  isOpen,
  onEmojiClick,
  onClose,
  onBackdropClick,
}: EmojiPickerModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 modal-container"
      onClick={onBackdropClick}
    >
      <div className="bg-discord-dark-400 rounded-lg shadow-lg border border-discord-dark-300 max-w-sm w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="p-2">
          <AppEmojiPicker onEmojiClick={onEmojiClick} />
        </div>
        <div className="p-2 border-t border-discord-dark-300">
          <button
            onClick={onClose}
            className="text-sm text-discord-text-muted hover:text-white w-full text-center py-1"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
