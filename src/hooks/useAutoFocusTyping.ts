import { type RefObject, useEffect, useRef } from "react";

const TYPING_RE = /^[a-zA-Z0-9]$/;

export function useAutoFocusTyping(
  inputRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
  isBlocked: () => boolean,
) {
  // Stable ref so the effect never needs to re-subscribe when isBlocked identity changes
  const isBlockedRef = useRef(isBlocked);
  isBlockedRef.current = isBlocked;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only plain alphanumeric — skip Ctrl/Cmd/Alt shortcuts
      if (!TYPING_RE.test(e.key)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Don't steal focus from an already-focused editable element
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          (active as HTMLElement).isContentEditable
        )
          return;
      }

      // Caller says this context shouldn't capture right now
      if (isBlockedRef.current()) return;

      const input = inputRef.current;
      if (!input || document.activeElement === input) return;

      input.focus();
      // The browser fires keypress/beforeinput on the newly-focused element,
      // so the triggering character appears in the field automatically.
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [inputRef]); // inputRef is stable; isBlocked is accessed via ref
}
