import type React from "react";
import { useRef } from "react";
import { createPortal } from "react-dom";
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
  /** Z-index for the modal (default: 50) */
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
  zIndex = 50,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Apply hooks
  useModalEscape(isOpen, onClose, closeOnEscape && !preventClose);
  useClickOutside(contentRef, onClose, closeOnBackdrop && !preventClose);
  useScrollLock(isOpen);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && !preventClose && e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center ${overlayClassName}`}
      style={{ zIndex }}
      onClick={handleBackdropClick}
    >
      <div ref={contentRef} className={className}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
