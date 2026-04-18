import { t } from "@lingui/core/macro";
import type React from "react";
import { FaExpand, FaGrinAlt, FaReply, FaTimes } from "react-icons/fa";
import BottomSheet from "./BottomSheet";

interface MessageBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onReply?: () => void;
  onReact?: (buttonElement: Element) => void;
  onDelete?: () => void;
  onOpenMedia?: () => void;
  canReply: boolean;
  canReact: boolean;
  canDelete: boolean;
  canOpenMedia?: boolean;
}

const MessageBottomSheet: React.FC<MessageBottomSheetProps> = ({
  isOpen,
  onClose,
  onReply,
  onReact,
  onDelete,
  onOpenMedia,
  canReply,
  canReact,
  canDelete,
  canOpenMedia = false,
}) => {
  const actions: {
    label: string;
    icon: React.ReactNode;
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
    className?: string;
  }[] = [];

  if (canReply && onReply) {
    actions.push({
      label: t`Reply`,
      icon: <FaReply />,
      onClick: () => {
        onReply();
        onClose();
      },
    });
  }

  if (canReact && onReact) {
    actions.push({
      label: t`React`,
      icon: <FaGrinAlt />,
      onClick: (e) => {
        onReact(e.currentTarget);
        onClose();
      },
    });
  }

  if (canOpenMedia && onOpenMedia) {
    actions.push({
      label: t`Open in viewer`,
      icon: <FaExpand />,
      onClick: () => {
        onOpenMedia();
        onClose();
      },
    });
  }

  if (canDelete && onDelete) {
    actions.push({
      label: t`Delete`,
      icon: <FaTimes />,
      onClick: () => {
        onDelete();
        onClose();
      },
      className: "text-red-400",
    });
  }

  if (actions.length === 0) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
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
    </BottomSheet>
  );
};

export default MessageBottomSheet;
