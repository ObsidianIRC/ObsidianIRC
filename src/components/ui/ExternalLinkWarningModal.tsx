import type React from "react";
import { createPortal } from "react-dom";
import { FaExclamationTriangle, FaExternalLinkAlt } from "react-icons/fa";

interface ExternalLinkWarningModalProps {
  isOpen: boolean;
  url: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ExternalLinkWarningModal: React.FC<ExternalLinkWarningModalProps> = ({
  isOpen,
  url,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    }
  };

  // Truncate very long URLs for display
  const displayUrl = url.length > 80 ? `${url.substring(0, 80)}...` : url;

  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-discord-dark-400 rounded-lg shadow-xl border border-discord-dark-300 max-w-md w-full mx-4">
        {/* Header */}
        <div className="p-4 border-b border-discord-dark-300">
          <div className="flex items-center gap-3">
            <FaExclamationTriangle className="text-yellow-500 text-xl flex-shrink-0" />
            <h2 className="text-lg font-semibold text-white">
              External Link Warning
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-discord-text">
            You are about to open an external link:
          </p>

          <div className="bg-discord-dark-500 rounded p-3 break-all">
            <code className="text-sm text-discord-text-link">{displayUrl}</code>
          </div>

          <div className="bg-yellow-500 bg-opacity-10 border border-yellow-500 border-opacity-30 rounded p-3">
            <p className="text-sm text-yellow-200">
              <strong>⚠️ Be careful!</strong> Only open links from trusted
              sources. Malicious links can compromise your security or privacy.
            </p>
          </div>

          <p className="text-sm text-discord-text-muted">
            Do you want to open this link in a new tab?
          </p>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-discord-dark-300 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded bg-discord-dark-300 hover:bg-discord-dark-200 text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-2"
          >
            <FaExternalLinkAlt className="text-sm" />
            Open Link
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ExternalLinkWarningModal;
