import type React from "react";
import { FaPencilAlt, FaSignOutAlt } from "react-icons/fa";
import BottomSheet from "./BottomSheet";

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
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="px-4 pb-2">
        <span className="text-sm text-discord-text-muted">{serverName}</span>
      </div>
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
    </BottomSheet>
  );
};

export default ServerBottomSheet;
