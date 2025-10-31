import { type RefObject, useEffect } from "react";

/**
 * Hook to handle clicks outside of a ref element
 * @param ref - Ref to the element to detect clicks outside of
 * @param onClickOutside - Callback when clicking outside
 * @param enabled - Whether click-outside handling is enabled (default: true)
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T>,
  onClickOutside: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClickOutside();
      }
    };

    // Use mousedown instead of click to catch events before they bubble
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [ref, onClickOutside, enabled]);
}
