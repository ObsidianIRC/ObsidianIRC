import type React from "react";
import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useModalStackContext } from "../context/ModalStackContext";
import { useClickOutside, useModalEscape, useScrollLock } from "../hooks";

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Modal content */
  children: React.ReactNode;
  /** Whether ESC key closes the modal (default: true) */
  closeOnEscape?: boolean;
  /** Whether clicking backdrop closes the modal (default: true) */
  closeOnBackdrop?: boolean;
  /** Prevent closing (for security warnings) */
  preventClose?: boolean;
  /** Additional className for the content container */
  className?: string;
  /** Additional className for the overlay */
  overlayClassName?: string;
  /** Z-index for the modal (default: auto from stack) */
  zIndex?: number;
}

/**
 * Base Modal component with overlay, portal, ESC, and click-outside handling
 */
export function Modal({
  isOpen,
  onClose,
  children,
  closeOnEscape = true,
  closeOnBackdrop = true,
  preventClose = false,
  className = "",
  overlayClassName = "",
  zIndex,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const modalId = useId();
  const modalStack = useModalStackContext();

  // Register/unregister with stack
  useEffect(() => {
    if (isOpen) {
      modalStack.registerModal(modalId, preventClose);
      return () => {
        modalStack.unregisterModal(modalId);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    modalId,
    preventClose,
    modalStack.registerModal,
    modalStack.unregisterModal,
  ]);

  // Check if this modal is topmost (for pointer events and interaction)
  const isTopmost = isOpen ? modalStack.isTopmost(modalId) : true;
  const effectiveZIndex =
    zIndex ?? (isOpen ? modalStack.getModalZIndex(modalId) : 50);

  // Wrap onClose to check if topmost at call time
  const handleClose = useCallback(() => {
    // Only close if we're topmost in the stack
    if (modalStack.isTopmost(modalId)) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalId, onClose, modalStack.isTopmost]);

  // Apply hooks - always attach listeners, handleClose will check if topmost
  useModalEscape(isOpen, handleClose, closeOnEscape && !preventClose);
  useClickOutside(contentRef, handleClose, closeOnBackdrop && !preventClose);
  useScrollLock(isOpen);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // If this modal is not topmost, ignore clicks
    if (!isTopmost) {
      return;
    }

    // If preventClose is set, ignore clicks even if topmost
    if (preventClose) {
      return;
    }

    // Only close if clicking backdrop directly
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  // When this modal is blocked by a child modal, disable all pointer events
  const overlayStyle: React.CSSProperties = {
    zIndex: effectiveZIndex,
    pointerEvents: isTopmost ? "auto" : "none",
  };

  return createPortal(
    <div
      className={`fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center ${overlayClassName}`}
      style={overlayStyle}
      onClick={handleBackdropClick}
    >
      <div
        ref={contentRef}
        className={className}
        style={{ pointerEvents: "auto" }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
