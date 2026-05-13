import { t } from "@lingui/core/macro";
import { FaArrowUp, FaAt, FaGrinAlt } from "react-icons/fa";

interface InputToolbarProps {
  selectedColor: string | null;
  onEmojiClick: () => void;
  onColorPickerClick: () => void;
  onAtClick: () => void;
  onSendClick?: () => void;
  showSendButton?: boolean;
  hideEmoji?: boolean;
  hasText?: boolean;
}

/**
 * Displays formatting toolbar buttons (emoji, color, mentions)
 */
export function InputToolbar({
  selectedColor,
  onEmojiClick,
  onColorPickerClick,
  onAtClick,
  onSendClick,
  showSendButton = false,
  hideEmoji = false,
  hasText = false,
}: InputToolbarProps) {
  return (
    <div className="flex items-center flex-shrink-0">
      {!hideEmoji && (
        <button
          aria-label={t`Insert emoji`}
          className="px-1.5 sm:px-2 text-discord-text-muted hover:text-discord-text-normal flex-shrink-0"
          onClick={onEmojiClick}
        >
          <FaGrinAlt />
        </button>
      )}
      <button
        className="px-1.5 sm:px-2 text-discord-text-muted hover:text-discord-text-normal flex-shrink-0"
        onClick={onColorPickerClick}
      >
        <div
          className="w-4 h-4 rounded-full border-2 border-white-700"
          style={{
            backgroundColor:
              selectedColor === "inherit"
                ? "transparent"
                : (selectedColor ?? undefined),
          }}
        />
      </button>
      <button
        className="px-1.5 sm:px-2 text-discord-text-muted hover:text-discord-text-normal flex-shrink-0"
        onClick={onAtClick}
      >
        <FaAt />
      </button>
      {showSendButton && (
        <button
          className={`mx-1.5 w-9 h-9 rounded-full text-white flex items-center justify-center flex-shrink-0
            transition-[transform,opacity,box-shadow] duration-200 ease-out active:scale-90 ${
              hasText
                ? "bg-discord-primary shadow-lg shadow-discord-primary/40 scale-100 opacity-100"
                : "bg-discord-primary/40 scale-90 opacity-60"
            }`}
          onClick={onSendClick}
          // Prevent the button from stealing focus from the textarea on iOS —
          // without this the keyboard hides every time the send button is tapped.
          onMouseDown={(e) => e.preventDefault()}
        >
          <FaArrowUp size={14} />
        </button>
      )}
    </div>
  );
}
