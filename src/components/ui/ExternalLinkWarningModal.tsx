import type React from "react";
import { FaExclamationTriangle, FaExternalLinkAlt } from "react-icons/fa";
import BaseModal from "../../lib/modal/BaseModal";
import { Button, ModalBody, ModalFooter } from "../../lib/modal/components";

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
  // Truncate very long URLs for display
  const displayUrl = url.length > 80 ? `${url.substring(0, 80)}...` : url;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onCancel}
      title={
        <div className="flex items-center gap-3">
          <FaExclamationTriangle className="text-yellow-500 text-xl flex-shrink-0" />
          <span>External Link Warning</span>
        </div>
      }
      maxWidth="md"
    >
      <ModalBody>
        <div className="space-y-4">
          <p className="text-discord-text-normal">
            You are about to open an external link:
          </p>

          <div className="bg-discord-dark-400 rounded p-3 break-all">
            <code className="text-sm text-discord-text-link">{displayUrl}</code>
          </div>

          <div className="bg-yellow-500 bg-opacity-10 border border-yellow-500 border-opacity-30 rounded p-3">
            <p className="text-sm text-yellow-200">
              <strong>⚠️ Be careful!</strong> Only open links from trusted
              sources. Malicious links can compromise your security or privacy.
            </p>
          </div>

          <p className="text-sm text-discord-text-normal">
            Do you want to open this link in a new tab?
          </p>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          <FaExternalLinkAlt className="inline mr-2 text-sm" />
          Open Link
        </Button>
      </ModalFooter>
    </BaseModal>
  );
};

export default ExternalLinkWarningModal;
