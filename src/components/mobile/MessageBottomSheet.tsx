import type React from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FaGrinAlt, FaReply, FaTimes } from "react-icons/fa";

interface MessageBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onReply?: () => void;
  onReact?: (buttonElement: Element) => void;
  onDelete?: () => void;
  canReply: boolean;
  canReact: boolean;
  canDelete: boolean;
}

const MessageBottomSheet: React.FC<MessageBottomSheetProps> = ({
  isOpen,
  onClose,
  onReply,
  onReact,
  onDelete,
  canReply,
  canReact,
  canDelete,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions: {
    label: string;
    icon: React.ReactNode;
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
    className?: string;
  }[] = [];

  if (canReply && onReply) {
    actions.push({
      label: "Reply",
      icon: <FaReply />,
      onClick: () => {
        onReply();
        onClose();
      },
    });
  }

  if (canReact && onReact) {
    actions.push({
      label: "React",
      icon: <FaGrinAlt />,
      onClick: (e) => {
        onReact(e.currentTarget);
        onClose();
      },
    });
  }

  if (canDelete && onDelete) {
    actions.push({
      label: "Delete",
      icon: <FaTimes />,
      onClick: () => {
        onDelete();
        onClose();
      },
      className: "text-red-400",
    });
  }

  if (actions.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9998]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-discord-dark-500 rounded-t-2xl"
        style={{
          animation: "bottom-sheet-slide-up 200ms ease-out",
          paddingBottom: "calc(0.5rem + var(--safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-discord-dark-300" />
        </div>
        {/* Actions */}
        <div className="px-2 pb-2">
          {actions.map((action) => (
            <button
              key={action.label}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg active:bg-discord-dark-400 text-left ${action.className || "text-white"}`}
              style={{ minHeight: "48px" }}
              onClick={action.onClick}
            >
              <span className="text-lg">{action.icon}</span>
              <span className="text-sm font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MessageBottomSheet;
