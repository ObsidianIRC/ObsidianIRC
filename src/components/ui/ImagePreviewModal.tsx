/**
 * Modal for previewing and uploading images
 */

import BaseModal from "../../lib/modal/BaseModal";
import { Button, ModalBody, ModalFooter } from "../../lib/modal/components";

interface ImagePreviewModalProps {
  isOpen: boolean;
  file: File | null;
  previewUrl: string | null;
  onCancel: () => void;
  onUpload: () => void;
}

/**
 * Displays a modal with image preview and upload/cancel options
 */
export function ImagePreviewModal({
  isOpen,
  file,
  previewUrl,
  onCancel,
  onUpload,
}: ImagePreviewModalProps) {
  if (!previewUrl) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onCancel}
      title="Upload Image"
      maxWidth="md"
    >
      <ModalBody>
        <div className="flex justify-center mb-4">
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-full max-h-96 rounded-lg"
          />
        </div>
        <p className="text-sm text-discord-text-muted">
          File: {file?.name} ({((file?.size || 0) / 1024).toFixed(1)} KB)
        </p>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onUpload}>
          Upload
        </Button>
      </ModalFooter>
    </BaseModal>
  );
}
