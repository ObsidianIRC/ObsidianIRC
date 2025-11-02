import { useEffect } from "react";

/**
 * Hook to handle ESC key press for closing modals
 * @param isOpen - Whether the modal is currently open
 * @param onClose - Callback to close the modal
 * @param enabled - Whether ESC handling is enabled (default: true)
 * @param canClose - Whether this modal can close (from modal stack)
 */
export function useModalEscape(
  isOpen: boolean,
  onClose: () => void,
  enabled = true,
  canClose = true,
) {
  useEffect(() => {
    if (!isOpen || !enabled || !canClose) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    // Use capture phase to ensure we get the event before input fields
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [isOpen, onClose, enabled, canClose]);
}
