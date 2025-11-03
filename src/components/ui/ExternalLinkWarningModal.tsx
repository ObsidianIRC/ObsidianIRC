import type React from "react";
import { FaExclamationTriangle, FaExternalLinkAlt } from "react-icons/fa";
import { SimpleModal } from "../modals";

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

  // Truncate very long URLs for display
  const displayUrl = url.length > 80 ? `${url.substring(0, 80)}...` : url;

  const modalTitle = (
    <div className="flex items-center gap-3">
      <FaExclamationTriangle className="text-yellow-500 text-xl flex-shrink-0" />
      <span>External Link Warning</span>
    </div>
  );

  const footerContent = (
    <>
      <button
        onClick={onCancel}
        className="px-4 py-2 rounded bg-discord-dark-300 hover:bg-discord-dark-200 text-white transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        className="px-4 py-2 rounded font-medium bg-discord-primary hover:bg-opacity-80 text-white transition-colors flex items-center gap-2"
      >
        <FaExternalLinkAlt className="text-sm" />
        Open Link
      </button>
    </>
  );

  return (
    <SimpleModal
      isOpen={isOpen}
      onClose={onCancel}
      title={modalTitle}
      footer={footerContent}
      maxWidth="md"
    >
      <div className="space-y-4">
        <p className="text-discord-text">
          You are about to open an external link:
        </p>

        <div className="bg-discord-dark-500 rounded p-3 break-all">
          <code className="text-sm text-discord-text-link">{displayUrl}</code>
        </div>

        <div className="bg-yellow-500 bg-opacity-10 border border-yellow-500 border-opacity-30 rounded p-3">
          <p className="text-sm text-yellow-200">
            <strong>⚠️ Be careful!</strong> Only open links from trusted sources.
            Malicious links can compromise your security or privacy.
          </p>
        </div>

        <p className="text-sm text-discord-text-muted">
          Do you want to open this link in a new tab?
        </p>
      </div>
    </SimpleModal>
  );
};

export default ExternalLinkWarningModal;
