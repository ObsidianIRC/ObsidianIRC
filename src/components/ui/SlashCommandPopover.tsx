// Slash-command suggestion popover, anchored above the chat input.
//
// Activates when the input value starts with "/" and the user is still
// typing the command name (no space yet).  Filters the server's
// cmdsAvailable set (populated by the obsidianirc/cmdslist cap) by
// prefix match.
//
// Keyboard:
//   ArrowUp / ArrowDown -- cycle highlighted suggestion
//   Tab / Enter         -- accept current suggestion
//   Escape              -- close
//
// onSelect receives the bare command name (without the leading slash).

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

interface SlashCommandPopoverProps {
  isVisible: boolean;
  inputValue: string;
  commands: string[];
  inputElement?: HTMLInputElement | HTMLTextAreaElement | null;
  onSelect: (command: string) => void;
  onClose: () => void;
}

const MAX_SUGGESTIONS = 10;

export function getActiveSlashQuery(
  inputValue: string,
  cursorPosition: number,
): string | null {
  // Only active when the input starts with a single "/" and the user
  // has not yet typed a space (still completing the command name).
  if (!inputValue.startsWith("/")) return null;
  if (inputValue.startsWith("//")) return null; // escape for literal "/"
  const beforeCursor = inputValue.slice(0, cursorPosition);
  const firstSpace = beforeCursor.indexOf(" ");
  if (firstSpace !== -1) return null;
  return beforeCursor.slice(1).toLowerCase();
}

export const SlashCommandPopover: React.FC<SlashCommandPopoverProps> = ({
  isVisible,
  inputValue,
  commands,
  inputElement,
  onSelect,
  onClose,
}) => {
  const cursorPosition = inputElement?.selectionStart ?? inputValue.length;
  const query = getActiveSlashQuery(inputValue, cursorPosition);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    if (query === null) return [] as string[];
    if (commands.length === 0) return [];
    return commands
      .filter((c) => c.startsWith(query))
      .slice(0, MAX_SUGGESTIONS);
  }, [commands, query]);

  // Reset highlight when the match set changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: matches identity changes drive the reset
  useEffect(() => {
    setSelectedIndex(0);
  }, [matches.length, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isVisible || matches.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((i) => (i + 1) % matches.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((i) => (i === 0 ? matches.length - 1 : i - 1));
          break;
        case "Tab":
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          if (matches[selectedIndex]) onSelect(matches[selectedIndex]);
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isVisible, matches, selectedIndex, onSelect, onClose]);

  if (!isVisible || query === null || matches.length === 0) return null;

  // Position above the input box, left-aligned.
  const inputRect = inputElement?.getBoundingClientRect();
  const top = inputRect
    ? inputRect.top + window.scrollY - matches.length * 32 - 32
    : 100;
  const left = inputRect ? inputRect.left + window.scrollX : 100;

  return (
    <div
      ref={ref}
      className="fixed z-[9999] bg-discord-dark-300 border border-discord-dark-500 rounded-md shadow-xl min-w-56 max-w-md"
      style={{ top, left }}
    >
      <div className="py-1 max-h-60 overflow-y-auto">
        <div className="px-3 py-1 text-xs text-discord-text-muted font-semibold uppercase tracking-wide border-b border-discord-dark-500">
          Slash commands
        </div>
        {matches.map((cmd, index) => (
          <div
            key={cmd}
            data-cmd-index={index}
            className={`px-3 py-1.5 cursor-pointer flex items-center gap-2 transition-colors duration-150 ${
              index === selectedIndex
                ? "bg-discord-text-link text-white"
                : "text-discord-text-normal hover:bg-discord-dark-200 hover:text-white"
            }`}
            onClick={() => onSelect(cmd)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span className="font-mono text-sm">/{cmd}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SlashCommandPopover;
