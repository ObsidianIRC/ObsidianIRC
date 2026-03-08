import type React from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FaPencilAlt, FaSignOutAlt } from "react-icons/fa";

interface ServerBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string;
  onEdit: () => void;
  onDisconnect: () => void;
}

const ServerBottomSheet: React.FC<ServerBottomSheetProps> = ({
  isOpen,
  onClose,
  serverName,
  onEdit,
  onDisconnect,
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
        {/* Server name */}
        <div className="px-4 pb-2">
          <span className="text-sm text-discord-text-muted">{serverName}</span>
        </div>
        {/* Actions */}
        <div className="px-2 pb-2">
          <button
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg active:bg-discord-dark-400 text-left text-white"
            style={{ minHeight: "48px" }}
            onClick={() => {
              onEdit();
              onClose();
            }}
          >
            <span className="text-lg">
              <FaPencilAlt />
            </span>
            <span className="text-sm font-medium">Edit Server</span>
          </button>
          <button
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg active:bg-discord-dark-400 text-left text-red-400"
            style={{ minHeight: "48px" }}
            onClick={() => {
              onDisconnect();
              onClose();
            }}
          >
            <span className="text-lg">
              <FaSignOutAlt />
            </span>
            <span className="text-sm font-medium">Disconnect</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ServerBottomSheet;
