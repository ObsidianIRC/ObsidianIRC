import { useEffect, useRef } from "react";

// Global modal stack to track open modals
let modalStack: number[] = [];
let nextModalId = 0;

/**
 * Hook to manage modal stacking with proper z-index and close prevention
 * @param isOpen - Whether the modal is currently open
 * @param preventClose - Whether this modal blocks closing (default: false)
 * @returns Object with modalId, zIndex, and isTopmost flag
 */
export function useModalStack(isOpen: boolean, preventClose = false) {
  const modalIdRef = useRef<number | null>(null);
  const preventCloseRef = useRef(preventClose);

  // Update preventClose ref when it changes
  preventCloseRef.current = preventClose;

  useEffect(() => {
    if (isOpen) {
      // Assign modal ID on open if not already assigned
      if (modalIdRef.current === null) {
        modalIdRef.current = nextModalId++;
        modalStack.push(modalIdRef.current);
      }
    } else {
      // Remove from stack on close
      if (modalIdRef.current !== null) {
        modalStack = modalStack.filter((id) => id !== modalIdRef.current);
        modalIdRef.current = null;
      }
    }

    return () => {
      // Cleanup on unmount
      if (modalIdRef.current !== null) {
        modalStack = modalStack.filter((id) => id !== modalIdRef.current);
      }
    };
  }, [isOpen]);

  // Calculate z-index based on position in stack
  const modalId = modalIdRef.current;
  const stackIndex = modalId !== null ? modalStack.indexOf(modalId) : -1;
  const zIndex = stackIndex >= 0 ? 50 + stackIndex * 10 : 50;
  const isTopmost =
    modalId !== null && modalStack[modalStack.length - 1] === modalId;

  // Check if any modal above this one is blocking
  const isBlockedByParent = () => {
    if (modalId === null || stackIndex === -1) return false;

    // If there are any modals higher in the stack, we're blocked
    return stackIndex < modalStack.length - 1;
  };

  return {
    modalId,
    zIndex,
    isTopmost,
    isBlocked: isBlockedByParent(),
    canClose: isTopmost && !isBlockedByParent(),
  };
}

/**
 * Check if there are any blocking modals open
 */
export function hasBlockingModal(): boolean {
  return modalStack.length > 0;
}

/**
 * Get the current modal stack for debugging
 */
export function getModalStack(): number[] {
  return [...modalStack];
}
