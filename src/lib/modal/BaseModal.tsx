import { XMarkIcon } from "@heroicons/react/24/solid";
import type React from "react";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  showCloseButton?: boolean;
  closeOnClickOutside?: boolean;
  closeOnEsc?: boolean;
  className?: string;
  overlayClassName?: string;
  contentClassName?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  animate?: boolean;
}

export const BaseModal: React.FC<BaseModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  showCloseButton = true,
  closeOnClickOutside = true,
  closeOnEsc = true,
  className = "",
  overlayClassName = "",
  contentClassName = "",
  maxWidth = "lg",
  animate = true,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Handle ESC key press
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose, closeOnEsc]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      // Focus the modal container for accessibility
      setTimeout(() => {
        modalRef.current?.focus();
      }, 50);
    } else {
      // Restore focus to previous element when modal closes
      previousActiveElement.current?.focus();
    }
  }, [isOpen]);

  // Handle mouse down outside (prevents closing when dragging from inside to outside)
  const handleOverlayMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (closeOnClickOutside && e.target === e.currentTarget) {
        onClose();
      }
    },
    [closeOnClickOutside, onClose],
  );

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    full: "max-w-full",
  };

  const modalContent = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 ${
        animate ? "animate-in fade-in" : ""
      } ${overlayClassName}`}
      onMouseDown={handleOverlayMouseDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 pointer-events-none"
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`relative w-full focus:outline-none ${maxWidthClasses[maxWidth]} ${
          animate ? "animate-in zoom-in-95 slide-in-from-bottom-2" : ""
        } ${className}`}
      >
        <div
          className={`bg-discord-dark-200 rounded-lg shadow-xl ${contentClassName}`}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between p-4">
              {title && (
                <h2
                  id="modal-title"
                  className="text-lg font-semibold text-white"
                >
                  {title}
                </h2>
              )}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg hover:bg-discord-dark-400 transition-colors text-discord-text-muted hover:text-white"
                  aria-label="Close modal"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          {/* Body */}
          <div className="modal-body">{children}</div>
        </div>
      </div>
    </div>
  );

  // Portal render to body
  return createPortal(modalContent, document.body);
};

export default BaseModal;
