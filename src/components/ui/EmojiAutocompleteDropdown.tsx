import type React from "react";
import { useEffect, useRef, useState } from "react";

interface EmojiItem {
  unified: string;
  short_names: string[];
  category: string;
  emoji: string;
}

interface EmojiAutocompleteDropdownProps {
  isVisible: boolean;
  inputValue: string;
  cursorPosition: number;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  inputElement?: HTMLInputElement | HTMLTextAreaElement | null;
  emojiMatches?: EmojiItem[];
  currentMatchIndex?: number;
  onNavigate?: (emoji: string) => void;
}

export const EmojiAutocompleteDropdown: React.FC<
  EmojiAutocompleteDropdownProps
> = ({
  isVisible,
  inputValue,
  cursorPosition,
  onSelect,
  onClose,
  inputElement,
  emojiMatches = [],
  currentMatchIndex = 0,
  onNavigate,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayEmojis = emojiMatches.slice(0, 10); // Limit to 10 emojis

  useEffect(() => {
    setSelectedIndex(emojiMatches.length > 0 ? currentMatchIndex : 0);
  }, [currentMatchIndex, emojiMatches.length]);

  useEffect(() => {
    if (isVisible && displayEmojis.length > 0) {
      const selectedElement = document.querySelector(
        `[data-emoji-index="${selectedIndex}"]`,
      );
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }, [selectedIndex, isVisible, displayEmojis.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible || displayEmojis.length === 0) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          e.stopPropagation();
          const nextIndex = (selectedIndex + 1) % displayEmojis.length;
          setSelectedIndex(nextIndex);
          if (onNavigate && displayEmojis[nextIndex]) {
            onNavigate(displayEmojis[nextIndex].emoji);
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          e.stopPropagation();
          const prevIndex =
            selectedIndex === 0 ? displayEmojis.length - 1 : selectedIndex - 1;
          setSelectedIndex(prevIndex);
          if (onNavigate && displayEmojis[prevIndex]) {
            onNavigate(displayEmojis[prevIndex].emoji);
          }
          break;
        }
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          if (displayEmojis[selectedIndex]) {
            onSelect(displayEmojis[selectedIndex].emoji);
          }
          break;
        case "Escape":
        case " ": // Space should also close the dropdown
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isVisible, displayEmojis, selectedIndex, onClose, onNavigate, onSelect]);

  if (!isVisible || displayEmojis.length === 0) {
    return null;
  }

  const getPosition = () => {
    if (!inputElement) {
      return { top: 100, left: 100 };
    }

    const inputRect = inputElement.getBoundingClientRect();
    const dropdownHeight = Math.min(displayEmojis.length * 48 + 32, 240);

    return {
      top: inputRect.top + window.scrollY - dropdownHeight - 8,
      left: inputRect.left + window.scrollX,
    };
  };

  const position = getPosition();

  return (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] bg-discord-dark-300 border border-discord-dark-500 rounded-md shadow-xl max-w-xs min-w-48"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="py-1 max-h-60 overflow-y-auto">
        <div className="px-3 py-1 text-xs text-discord-text-muted font-semibold uppercase tracking-wide border-b border-discord-dark-500">
          Emojis
        </div>
        {displayEmojis.map((emojiItem, index) => (
          <div
            key={`${emojiItem.unified}-${index}`}
            data-emoji-index={index}
            className={`px-3 py-2 cursor-pointer flex items-center gap-2 transition-colors duration-150 ${
              index === selectedIndex
                ? "bg-discord-text-link text-white"
                : "text-discord-text-normal hover:bg-discord-dark-200 hover:text-white"
            }`}
            onClick={() => onSelect(emojiItem.emoji)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div className="text-xl flex-shrink-0 w-6 h-6 flex items-center justify-center">
              {emojiItem.emoji}
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="truncate font-medium text-sm">
                :{emojiItem.short_names[0]}:
              </span>
              {emojiItem.short_names.length > 1 && (
                <span className="truncate text-xs text-discord-text-muted">
                  :{emojiItem.short_names.slice(1, 3).join(": :")}:
                </span>
              )}
            </div>
            <span className="text-xs text-discord-text-muted capitalize flex-shrink-0">
              {emojiItem.category}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmojiAutocompleteDropdown;
