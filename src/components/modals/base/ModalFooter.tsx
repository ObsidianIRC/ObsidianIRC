import type React from "react";

export interface ModalFooterProps {
  /** Footer content (typically action buttons) */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
  /** Content justification */
  justify?: "start" | "end" | "center" | "between";
}

/**
 * Modal footer container for action buttons
 */
export function ModalFooter({
  children,
  className,
  justify = "end",
}: ModalFooterProps) {
  const justifyClass = {
    start: "justify-start",
    end: "justify-end",
    center: "justify-center",
    between: "justify-between",
  }[justify];

  return (
    <div
      className={
        className ||
        `flex gap-3 ${justifyClass} p-4 border-t border-discord-dark-500`
      }
    >
      {children}
    </div>
  );
}
