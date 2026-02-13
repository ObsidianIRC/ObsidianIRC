/**
 * Toolbar component for input formatting controls
 */
import { FaAt, FaGrinAlt } from "react-icons/fa";

interface InputToolbarProps {
  selectedColor: string | null;
  onEmojiClick: () => void;
  onColorPickerClick: () => void;
  onAtClick: () => void;
}

/**
 * Displays formatting toolbar buttons (emoji, color, mentions)
 */
export function InputToolbar({
  selectedColor,
  onEmojiClick,
  onColorPickerClick,
  onAtClick,
}: InputToolbarProps) {
  return (
    <div className="flex items-center flex-shrink-0">
      <button
        className="px-1.5 sm:px-2 text-discord-text-muted hover:text-discord-text-normal flex-shrink-0"
        onClick={onEmojiClick}
      >
        <FaGrinAlt />
      </button>
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
        className="px-1.5 sm:px-2 mr-2 text-discord-text-muted hover:text-discord-text-normal flex-shrink-0"
        onClick={onAtClick}
      >
        <FaAt />
      </button>
    </div>
  );
}
