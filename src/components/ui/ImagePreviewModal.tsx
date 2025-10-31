import { SimpleModal } from "../modals";

/**
 * Modal for previewing and uploading images
 */

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
  if (!isOpen || !previewUrl) return null;

  const footerContent = (
    <>
      <button
        onClick={onCancel}
        className="px-4 py-2 text-discord-text-muted hover:text-white rounded"
      >
        Cancel
      </button>
      <button
        onClick={onUpload}
        className="px-4 py-2 bg-discord-accent text-white rounded hover:bg-discord-accent-hover"
      >
        Upload
      </button>
    </>
  );

  return (
    <SimpleModal
      isOpen={isOpen}
      onClose={onCancel}
      title="Upload Image"
      footer={footerContent}
      maxWidth="md"
    >
      <div className="flex justify-center mb-4">
        <img
          src={previewUrl}
          alt="Preview"
          className="max-w-full max-h-96 rounded-lg"
        />
      </div>
      <p className="text-sm text-discord-text-muted">
        File: {file?.name} ({((file?.size || 0) / 1024).toFixed(2)} KB)
      </p>
    </SimpleModal>
  );
}
