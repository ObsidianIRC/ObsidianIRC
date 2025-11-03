import type React from "react";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "../base";

export interface SimpleModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Modal title */
  title: string | React.ReactNode;
  /** Modal content */
  children: React.ReactNode;
  /** Optional footer content */
  footer?: React.ReactNode;
  /** Maximum width (default: 'md') */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
  /** Whether to show close button (default: true) */
  showClose?: boolean;
  /** Whether ESC closes modal (default: true) */
  closeOnEscape?: boolean;
  /** Whether clicking backdrop closes modal (default: true) */
  closeOnBackdrop?: boolean;
  /** Prevent closing (for warnings) */
  preventClose?: boolean;
  /** Optional icon for header */
  icon?: React.ReactNode;
  /** Custom footer justification */
  footerJustify?: "start" | "end" | "center" | "between";
}

/**
 * Simple centered modal layout - most common modal pattern
 */
export function SimpleModal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = "md",
  showClose = true,
  closeOnEscape = true,
  closeOnBackdrop = true,
  preventClose = false,
  icon,
  footerJustify = "end",
}: SimpleModalProps) {
  const widthClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
  }[maxWidth];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnEscape={closeOnEscape}
      closeOnBackdrop={closeOnBackdrop}
      preventClose={preventClose}
      className={`bg-discord-dark-200 rounded-lg w-full ${widthClass} mx-4 max-h-[90vh] flex flex-col overflow-hidden`}
    >
      <ModalHeader
        title={title}
        onClose={onClose}
        showClose={showClose}
        icon={icon}
      />
      <ModalBody className="flex-1">{children}</ModalBody>
      {footer && <ModalFooter justify={footerJustify}>{footer}</ModalFooter>}
    </Modal>
  );
}
