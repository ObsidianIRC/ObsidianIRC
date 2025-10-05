import type React from "react";
import { useState } from "react";
import ExternalLinkWarningModal from "../ui/ExternalLinkWarningModal";

interface LinkPreviewProps {
  title?: string;
  snippet?: string;
  imageUrl?: string;
  theme: string;
  messageContent: string;
}

export const LinkPreview: React.FC<LinkPreviewProps> = ({
  title,
  snippet,
  imageUrl,
  theme,
  messageContent,
}) => {
  const [showWarningModal, setShowWarningModal] = useState(false);

  // Don't render if there's no content to show
  if (!title && !snippet && !imageUrl) {
    return null;
  }

  // Extract the first URL from the message content
  const urlRegex = /\b(?:https?):\/\/[^\s<>"']+/i;
  const match = messageContent.match(urlRegex);
  const firstUrl = match ? match[0] : undefined;

  const handleClick = () => {
    if (firstUrl) {
      setShowWarningModal(true);
    }
  };

  const handleConfirmOpen = () => {
    if (firstUrl) {
      window.open(firstUrl, "_blank", "noopener,noreferrer");
    }
    setShowWarningModal(false);
  };

  const handleCancelOpen = () => {
    setShowWarningModal(false);
  };

  return (
    <>
      <ExternalLinkWarningModal
        isOpen={showWarningModal}
        url={firstUrl || ""}
        onConfirm={handleConfirmOpen}
        onCancel={handleCancelOpen}
      />
      <div
        className={`mt-2 rounded-lg overflow-hidden border border-${theme}-dark-400 bg-${theme}-dark-200 max-w-xs ${firstUrl ? `cursor-pointer hover:bg-${theme}-dark-300 transition-colors` : ""}`}
        onClick={handleClick}
        role={firstUrl ? "button" : undefined}
        tabIndex={firstUrl ? 0 : undefined}
        onKeyDown={(e) => {
          if (firstUrl && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {imageUrl && (
          <div className="w-full">
            <img
              src={imageUrl}
              alt={title || "Link preview"}
              className="w-full h-auto max-h-32 object-cover"
              onError={(e) => {
                // Hide image if it fails to load
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        )}
        {(title || snippet) && (
          <div className="p-3">
            {title && (
              <div
                className={`font-semibold text-${theme}-text mb-1 line-clamp-2`}
              >
                {title}
              </div>
            )}
            {snippet && (
              <div className={`text-sm text-${theme}-text-muted line-clamp-3`}>
                {snippet}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
