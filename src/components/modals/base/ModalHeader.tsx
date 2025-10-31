import type React from "react";
import { FaTimes } from "react-icons/fa";

export interface ModalHeaderProps {
  /** Header title (string or React node) */
  title: string | React.ReactNode;
  /** Callback when close button is clicked */
  onClose?: () => void;
  /** Whether to show close button (default: true) */
  showClose?: boolean;
  /** Optional icon before title */
  icon?: React.ReactNode;
  /** Additional className */
  className?: string;
}

/**
 * Standard modal header with title and optional close button
 */
export function ModalHeader({
  title,
  onClose,
  showClose = true,
  icon,
  className,
}: ModalHeaderProps) {
  return (
    <div
      className={
        className ||
        "flex justify-between items-center p-4 border-b border-discord-dark-500"
      }
    >
      <div className="flex items-center gap-2">
        {icon}
        {typeof title === "string" ? (
          <h2 className="text-white text-xl font-bold">{title}</h2>
        ) : (
          title
        )}
      </div>
      {showClose && onClose && (
        <button
          onClick={onClose}
          className="text-discord-text-muted hover:text-white transition-colors"
          aria-label="Close modal"
        >
          <FaTimes />
        </button>
      )}
    </div>
  );
}
