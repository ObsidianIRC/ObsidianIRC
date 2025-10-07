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
    <div>
      <button
        className="px-3 text-discord-text-muted hover:text-discord-text-normal"
        onClick={onEmojiClick}
      >
        <FaGrinAlt />
      </button>
      <button
        className="px-3 text-discord-text-muted hover:text-discord-text-normal"
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
        className="px-3 text-discord-text-muted hover:text-discord-text-normal"
        onClick={onAtClick}
      >
        <FaAt />
      </button>
    </div>
  );
}
