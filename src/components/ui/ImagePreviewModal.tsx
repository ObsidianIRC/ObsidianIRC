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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-dark-400 rounded-lg shadow-lg border border-discord-dark-300 max-w-md w-full mx-4">
        <div className="p-4">
          <h3 className="text-lg font-semibold text-white mb-4">
            Upload Image
          </h3>
          <div className="flex justify-center mb-4">
            <img
              src={previewUrl}
              alt="Preview"
              className="max-w-full max-h-96 rounded-lg"
            />
          </div>
          <p className="text-sm text-discord-text-muted mb-4">
            File: {file?.name} ({(file?.size || 0) / 1024} KB)
          </p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-discord-dark-300">
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
        </div>
      </div>
    </div>
  );
}
