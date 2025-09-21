import { useCallback, useRef, useState } from "react";
import type { User } from "../types";

interface TabCompletionState {
  isActive: boolean;
  matches: string[];
  currentIndex: number;
  originalText: string;
  completionStart: number;
  originalPrefix: string;
}

interface TabCompletionResult {
  isActive: boolean;
  matches: string[];
  currentIndex: number;
  originalText: string;
  completionStart: number;
  originalPrefix: string;
  handleTabCompletion: (
    currentText: string,
    cursorPosition: number,
    users: User[],
  ) => {
    newText: string;
    newCursorPosition: number;
  } | null;
  resetCompletion: () => void;
}

export function useTabCompletion(): TabCompletionResult {
  const [state, setState] = useState<TabCompletionState>({
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

  const handleTabCompletion = useCallback(
    (
      currentText: string,
      cursorPosition: number,
      users: User[],
    ): { newText: string; newCursorPosition: number } | null => {
      if (previousTextRef.current !== currentText && state.isActive) {
        const expectedText =
          state.originalText.substring(0, state.completionStart) +
          state.matches[state.currentIndex] +
          state.originalText.substring(
            state.completionStart + state.originalPrefix.length,
          );

        if (currentText !== expectedText) {
          resetCompletion();
          return null;
        }
      }

      const textBeforeCursor = currentText.substring(0, cursorPosition);
      const words = textBeforeCursor.split(/\s+/);
      const currentWord = words[words.length - 1];
      const completionStart = cursorPosition - currentWord.length;

      if (!state.isActive) {
        if (currentWord.length === 0) {
          return null;
        }

        const matches = users
          .map((user) => user.username)
          .filter(
            (username) =>
              username.toLowerCase().startsWith(currentWord.toLowerCase()) &&
              username.toLowerCase() !== currentWord.toLowerCase(),
          )
          .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        if (matches.length === 0) {
          return null;
        }

        const isAtMessageStart = textBeforeCursor.trim() === currentWord;
        const suffix = isAtMessageStart ? ": " : " ";
        const selectedMatch = matches[0] + suffix;

        const newText =
          currentText.substring(0, completionStart) +
          selectedMatch +
          currentText.substring(cursorPosition);

        const newCursorPosition = completionStart + selectedMatch.length;

        setState({
          isActive: true,
          matches: matches.map((match) => match + suffix),
          currentIndex: 0,
          originalText: currentText,
          completionStart,
          originalPrefix: currentWord,
        });

        previousTextRef.current = newText;
        return { newText, newCursorPosition };
      }

      const nextIndex = (state.currentIndex + 1) % state.matches.length;
      const selectedMatch = state.matches[nextIndex];

      const newText =
        state.originalText.substring(0, state.completionStart) +
        selectedMatch +
        state.originalText.substring(
          state.completionStart + state.originalPrefix.length,
        );

      const newCursorPosition = state.completionStart + selectedMatch.length;

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
    handleTabCompletion,
    resetCompletion,
  };
}
