import emojiData from "emoji-datasource";
import { useCallback, useRef, useState } from "react";

interface EmojiItem {
  unified: string;
  short_names: string[];
  category: string;
  emoji: string;
}

interface RawEmojiData {
  unified: string;
  short_names: string[];
  category: string;
}

interface EmojiCompletionState {
  isActive: boolean;
  matches: EmojiItem[];
  currentIndex: number;
  originalText: string;
  completionStart: number;
  originalPrefix: string;
}

interface EmojiCompletionResult {
  isActive: boolean;
  matches: EmojiItem[];
  currentIndex: number;
  originalText: string;
  completionStart: number;
  originalPrefix: string;
  handleEmojiCompletion: (
    currentText: string,
    cursorPosition: number,
  ) => {
    newText: string;
    newCursorPosition: number;
  } | null;
  resetCompletion: () => void;
  setCurrentIndex: (index: number) => void;
  updatePreviousText: (text: string) => void;
}

// Convert emoji data to include rendered emoji
const processedEmojiData: EmojiItem[] = (emojiData as RawEmojiData[]).map(
  (emoji) => ({
    unified: emoji.unified,
    short_names: emoji.short_names,
    category: emoji.category,
    emoji: String.fromCodePoint(
      ...emoji.unified
        .split("-")
        .map((hex: string) => Number.parseInt(hex, 16)),
    ),
  }),
);

export function useEmojiCompletion(): EmojiCompletionResult {
  const [state, setState] = useState<EmojiCompletionState>({
    isActive: false,
    matches: [],
    currentIndex: 0,
    originalText: "",
    completionStart: 0,
    originalPrefix: "",
  });

  const previousTextRef = useRef<string>("");

  const resetCompletion = useCallback(() => {
    setState({
      isActive: false,
      matches: [],
      currentIndex: 0,
      originalText: "",
      completionStart: 0,
      originalPrefix: "",
    });
  }, []);

  const setCurrentIndex = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      currentIndex: index,
    }));
  }, []);

  const updatePreviousText = useCallback((text: string) => {
    previousTextRef.current = text;
  }, []);

  const handleEmojiCompletion = useCallback(
    (
      currentText: string,
      cursorPosition: number,
    ): { newText: string; newCursorPosition: number } | null => {
      // Check if text was manually modified during active completion
      if (previousTextRef.current !== currentText && state.isActive) {
        const expectedText =
          state.originalText.substring(0, state.completionStart) +
          state.matches[state.currentIndex].emoji +
          state.originalText.substring(
            state.completionStart + state.originalPrefix.length,
          );

        if (currentText !== expectedText) {
          resetCompletion();
          return null;
        }
      }

      if (!state.isActive) {
        // Only activate on first tab when we find a `:word` pattern
        const textBeforeCursor = currentText.substring(0, cursorPosition);
        const emojiMatch = textBeforeCursor.match(/:([a-zA-Z_]+)$/);

        if (!emojiMatch) {
          return null;
        }

        const [fullMatch, emojiQuery] = emojiMatch;
        const completionStart = cursorPosition - fullMatch.length;

        if (emojiQuery.length === 0) {
          return null;
        }

        // Find matching emojis
        const matches = processedEmojiData
          .filter((emoji) =>
            emoji.short_names.some((name) =>
              name.toLowerCase().includes(emojiQuery.toLowerCase()),
            ),
          )
          .slice(0, 10); // Limit to 10 matches

        if (matches.length === 0) {
          return null;
        }

        const selectedEmoji = matches[0].emoji;

        const newText =
          currentText.substring(0, completionStart) +
          selectedEmoji +
          currentText.substring(cursorPosition);

        const newCursorPosition = completionStart + selectedEmoji.length;

        setState({
          isActive: true,
          matches,
          currentIndex: 0,
          originalText: currentText,
          completionStart,
          originalPrefix: fullMatch,
        });

        previousTextRef.current = newText;
        return { newText, newCursorPosition };
      }

      // Already active - cycle through matches on subsequent tabs
      const nextIndex = (state.currentIndex + 1) % state.matches.length;
      const selectedEmoji = state.matches[nextIndex].emoji;

      const newText =
        state.originalText.substring(0, state.completionStart) +
        selectedEmoji +
        state.originalText.substring(
          state.completionStart + state.originalPrefix.length,
        );

      const newCursorPosition = state.completionStart + selectedEmoji.length;

      setState((prev) => ({
        ...prev,
        currentIndex: nextIndex,
      }));

      previousTextRef.current = newText;
      return { newText, newCursorPosition };
    },
    [state, resetCompletion],
  );

  return {
    isActive: state.isActive,
    matches: state.matches,
    currentIndex: state.currentIndex,
    originalText: state.originalText,
    completionStart: state.completionStart,
    originalPrefix: state.originalPrefix,
    handleEmojiCompletion,
    resetCompletion,
    setCurrentIndex,
    updatePreviousText,
  };
}
