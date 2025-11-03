import type React from "react";

export interface ModalBodyProps {
  /** Body content */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
  /** Whether content should be scrollable (default: true) */
  scrollable?: boolean;
  /** Whether to add padding (default: true) */
  padding?: boolean;
}

/**
 * Modal body container with optional scrolling and padding
 */
export function ModalBody({
  children,
  className,
  scrollable = true,
  padding = true,
}: ModalBodyProps) {
  const baseClass = padding ? "p-6" : "";
  const scrollClass = scrollable ? "overflow-y-auto" : "";

  return (
    <div className={`${baseClass} ${scrollClass} ${className || ""}`}>
      {children}
    </div>
  );
}
