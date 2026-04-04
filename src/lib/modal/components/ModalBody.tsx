import type * as React from "react";
import type { ReactNode } from "react";

interface ModalBodyProps {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
  ref?: React.Ref<HTMLDivElement>;
}

export const ModalBody = ({
  children,
  className = "",
  scrollable = false,
  ref,
}: ModalBodyProps) => (
  <div
    ref={ref}
    className={`p-6 flex-1 min-h-0 flex flex-col ${scrollable ? "overflow-y-auto" : ""} ${className}`}
  >
    {children}
  </div>
);
