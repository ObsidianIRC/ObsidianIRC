import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { User } from "../../types";

interface AutocompleteDropdownProps {
  users: User[];
  isVisible: boolean;
  inputValue: string;
  cursorPosition: number;
  onSelect: (username: string) => void;
  onClose: () => void;
  inputElement?: HTMLInputElement | null;
  tabCompletionMatches?: string[];
  currentMatchIndex?: number;
  onNavigate?: (username: string) => void;
}

export const AutocompleteDropdown: React.FC<AutocompleteDropdownProps> = ({
  users,
  isVisible,
  inputValue,
  cursorPosition,
  onSelect,
  onClose,
  inputElement,
  tabCompletionMatches = [],
  currentMatchIndex = 0,
  onNavigate,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getCompletionWord = () => {
    const textBeforeCursor = inputValue.substring(0, cursorPosition);
    const words = textBeforeCursor.split(/\s+/);
    return words[words.length - 1] || "";
  };

  const getDisplayUsers = () => {
    if (tabCompletionMatches.length > 0) {
      return tabCompletionMatches
        .map((match) => {
          const username = match.replace(/:\s*$/, "").replace(/\s+$/, "");
          return users.find((user) => user.username === username);
        })
        .filter(Boolean) as User[];
    }

    const currentWord = getCompletionWord();
    if (!currentWord) return [];

    return users
      .filter(
        (user) =>
          user.username.toLowerCase().startsWith(currentWord.toLowerCase()) &&
          user.username.toLowerCase() !== currentWord.toLowerCase(),
      )
      .sort((a, b) => a.username.localeCompare(b.username))
      .slice(0, 10);
  };

  const displayUsers = getDisplayUsers();

  useEffect(() => {
    setSelectedIndex(tabCompletionMatches.length > 0 ? currentMatchIndex : 0);
  }, [currentMatchIndex, tabCompletionMatches.length]);

  useEffect(() => {
    if (isVisible && displayUsers.length > 0) {
      const selectedElement = document.querySelector(
        `[data-user-index="${selectedIndex}"]`,
      );
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }, [selectedIndex, isVisible, displayUsers.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible || displayUsers.length === 0) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          e.stopPropagation();
          const nextIndex = (selectedIndex + 1) % displayUsers.length;
          setSelectedIndex(nextIndex);
          if (onNavigate && displayUsers[nextIndex]) {
            onNavigate(displayUsers[nextIndex].username);
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          e.stopPropagation();
          const prevIndex =
            selectedIndex === 0 ? displayUsers.length - 1 : selectedIndex - 1;
          setSelectedIndex(prevIndex);
          if (onNavigate && displayUsers[prevIndex]) {
            onNavigate(displayUsers[prevIndex].username);
          }
          break;
        }
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          if (displayUsers[selectedIndex]) {
            onSelect(displayUsers[selectedIndex].username);
          }
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isVisible, displayUsers, selectedIndex, onClose, onNavigate, onSelect]);

  if (!isVisible || displayUsers.length === 0) {
    return null;
  }

  const getPosition = () => {
    if (!inputElement) {
      return { top: 100, left: 100 };
    }

    const inputRect = inputElement.getBoundingClientRect();
    const dropdownHeight = Math.min(displayUsers.length * 48 + 32, 240);

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
          Members
        </div>
        {displayUsers.map((user, index) => (
          <div
            key={user.id}
            data-user-index={index}
            className={`px-3 py-2 cursor-pointer flex items-center gap-2 transition-colors duration-150 ${
              index === selectedIndex
                ? "bg-discord-text-link text-white"
                : "text-discord-text-normal hover:bg-discord-dark-200 hover:text-white"
            }`}
            onClick={() => onSelect(user.username)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div className="w-6 h-6 rounded-full bg-discord-dark-400 flex items-center justify-center text-xs text-white flex-shrink-0">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <span className="truncate font-medium">{user.username}</span>
            {user.isOnline && (
              <div className="w-2 h-2 rounded-full bg-discord-green flex-shrink-0 ml-auto" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AutocompleteDropdown;
