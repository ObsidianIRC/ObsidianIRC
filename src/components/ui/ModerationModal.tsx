import type React from "react";
import { useState } from "react";
import { SimpleModal } from "../modals";

export type ModerationAction = "warn" | "kick" | "ban-nick" | "ban-hostmask";

interface ModerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (action: ModerationAction, reason: string) => void;
  username: string;
  action: ModerationAction;
}

const ModerationModal: React.FC<ModerationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  username,
  action,
}) => {
  const [reason, setReason] = useState("");

  const getActionTitle = (action: ModerationAction): string => {
    switch (action) {
      case "warn":
        return "Warn User";
      case "kick":
        return "Kick User";
      case "ban-nick":
        return "Ban User (by Nickname)";
      case "ban-hostmask":
        return "Ban User (by Hostmask)";
      default:
        return "Moderate User";
    }
  };

  const getActionDescription = (action: ModerationAction): string => {
    switch (action) {
      case "warn":
        return `Send a warning message to ${username}`;
      case "kick":
        return `Remove ${username} from the channel`;
      case "ban-nick":
        return `Ban ${username} by nickname (prevents them from rejoining with the same nick)`;
      case "ban-hostmask":
        return `Ban ${username} by hostmask (prevents them from rejoining from the same IP/host)`;
      default:
        return "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = reason.trim() || "no reason";
    onConfirm(action, finalReason);
    setReason("");
    onClose();
  };

  const handleClose = () => {
    setReason("");
    onClose();
  };

  if (!isOpen) return null;

  const footerContent = (
    <div className="flex gap-2 w-full">
      <button
        type="button"
        onClick={handleClose}
        className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded font-medium"
      >
        Cancel
      </button>
      <button
        type="submit"
        onClick={handleSubmit}
        className={`flex-1 text-white py-2 rounded font-medium ${
          action === "warn"
            ? "bg-discord-primary hover:bg-opacity-80"
            : "bg-red-600 hover:bg-red-700"
        }`}
      >
        {getActionTitle(action)}
      </button>
    </div>
  );

  return (
    <SimpleModal
      isOpen={isOpen}
      onClose={handleClose}
      title={getActionTitle(action)}
      footer={footerContent}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <label className="block text-white mb-2">Username</label>
            <input
              type="text"
              value={username}
              disabled
              className="w-full p-2 bg-discord-dark-300 text-white rounded"
            />
          </div>

          <div>
            <label className="block text-white mb-2">Action</label>
            <input
              type="text"
              value={getActionDescription(action)}
              disabled
              className="w-full p-2 bg-discord-dark-300 text-white rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-white mb-2">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-2 bg-discord-dark-300 text-white rounded"
              placeholder="Enter reason (optional)"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">
              Will default to "no reason" if left empty
            </p>
          </div>
        </div>
      </form>
    </SimpleModal>
  );
};

export default ModerationModal;
