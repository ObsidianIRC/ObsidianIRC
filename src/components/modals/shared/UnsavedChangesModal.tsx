import type React from "react";
import { Modal } from "../base/Modal";

/**
 * Shared modal component for warning users about unsaved changes
 * Used when navigating away or closing modals with unsaved data
 */
export interface UnsavedChangesModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onDontSave: () => void;
  onSave: () => void;
  title?: string;
  message?: string;
  /** Whether to prevent closing by clicking outside or ESC (default: true for blocking behavior) */
  preventClose?: boolean;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  onCancel,
  onDontSave,
  onSave,
  title = "Unsaved Changes",
  message = "You have unsaved changes. Would you like to save them?",
  preventClose = true,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      preventClose={preventClose}
      className="bg-discord-dark-300 rounded-lg shadow-xl max-w-md w-full mx-4"
    >
      <div className="p-6">
        <h3 className="text-white text-xl font-semibold mb-4">{title}</h3>
        <p className="text-discord-text-normal mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-discord-dark-400 text-discord-text-normal rounded font-medium hover:bg-discord-dark-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onDontSave}
            className="px-4 py-2 bg-black text-white rounded font-medium hover:bg-gray-900 transition-colors"
          >
            No
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 bg-[#5865F2] text-white rounded font-medium hover:bg-[#4752C4] transition-colors"
          >
            Yes
          </button>
        </div>
      </div>
    </Modal>
  );
};
