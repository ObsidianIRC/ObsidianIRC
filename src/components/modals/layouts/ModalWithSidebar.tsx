import type React from "react";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "../base";

export interface ModalWithSidebarProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Modal title */
  title: string | React.ReactNode;
  /** Sidebar content */
  sidebar: React.ReactNode;
  /** Main content */
  children: React.ReactNode;
  /** Optional footer content */
  footer?: React.ReactNode;
  /** Maximum width (default: '4xl') */
  maxWidth?: "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl";
  /** Sidebar width (default: '250px') */
  sidebarWidth?: string;
  /** Whether to show close button (default: true) */
  showClose?: boolean;
  /** Whether ESC closes modal (default: true) */
  closeOnEscape?: boolean;
  /** Whether clicking backdrop closes modal (default: true) */
  closeOnBackdrop?: boolean;
  /** Custom footer justification */
  footerJustify?: "start" | "end" | "center" | "between";
}

/**
 * Modal with sidebar navigation - used for complex settings modals
 */
export function ModalWithSidebar({
  isOpen,
  onClose,
  title,
  sidebar,
  children,
  footer,
  maxWidth = "4xl",
  sidebarWidth = "250px",
  showClose = true,
  closeOnEscape = true,
  closeOnBackdrop = true,
  footerJustify = "end",
}: ModalWithSidebarProps) {
  const widthClass = {
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
  }[maxWidth];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnEscape={closeOnEscape}
      closeOnBackdrop={closeOnBackdrop}
      className={`bg-discord-dark-200 rounded-lg w-full ${widthClass} h-[80vh] flex overflow-hidden`}
    >
      {/* Sidebar */}
      <div
        className="bg-discord-dark-300 flex flex-col flex-shrink-0"
        style={{ width: sidebarWidth }}
      >
        {sidebar}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <ModalHeader title={title} onClose={onClose} showClose={showClose} />
        <ModalBody className="flex-1">{children}</ModalBody>
        {footer && <ModalFooter justify={footerJustify}>{footer}</ModalFooter>}
      </div>
    </Modal>
  );
}
