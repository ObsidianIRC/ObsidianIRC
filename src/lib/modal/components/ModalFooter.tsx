import type { ReactNode } from "react";

interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export const ModalFooter: React.FC<ModalFooterProps> = ({
  children,
  className = "",
}) => (
  <div
    className={`flex items-center justify-end gap-3 p-4 border-t border-discord-dark-400 ${className}`}
  >
    {children}
  </div>
);
