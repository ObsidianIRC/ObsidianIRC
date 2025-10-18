/**
 * Modal for selecting emojis with backdrop and cancel button
 */
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import { createPortal } from "react-dom";

interface EmojiPickerModalProps {
  isOpen: boolean;
  onEmojiClick: (emojiData: EmojiClickData) => void;
  onClose: () => void;
  onBackdropClick: (e: React.MouseEvent) => void;
}

/**
 * Displays a modal with emoji picker and cancel button
 */
export function EmojiPickerModal({
  isOpen,
  onEmojiClick,
  onClose,
  onBackdropClick,
}: EmojiPickerModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onBackdropClick}
    >
      <div className="bg-discord-dark-400 rounded-lg shadow-lg border border-discord-dark-300 max-w-sm w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="p-2">
          <EmojiPicker
            onEmojiClick={onEmojiClick}
            theme={Theme.DARK}
            width="100%"
            height={400}
            searchPlaceholder="Search emojis..."
            previewConfig={{
              showPreview: false,
            }}
            skinTonesDisabled={false}
            lazyLoadEmojis={true}
          />
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
