import { forwardRef, type ReactNode } from "react";

interface ModalBodyProps {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
}

export const ModalBody = forwardRef<HTMLDivElement, ModalBodyProps>(
  ({ children, className = "", scrollable = false }, ref) => (
    <div
      ref={ref}
      className={`p-6 ${scrollable ? "overflow-y-auto" : ""} ${className}`}
    >
      {children}
    </div>
  ),
);
