import type React from "react";
import { useState } from "react";
import { openExternalUrl } from "../../lib/openUrl";
import useStore from "../../store";
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

  // Get global settings
  const { showExternalContent } = useStore((state) => state.globalSettings);

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

  const handleConfirmOpen = async () => {
    if (firstUrl) {
      await openExternalUrl(firstUrl);
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
        className={`mt-2 rounded-lg border border-${theme}-dark-400 bg-${theme}-dark-200 max-w-lg pl-4 pr-12 py-2 bg-black/20 rounded select-none ${firstUrl ? `cursor-pointer hover:bg-${theme}-dark-300 transition-colors` : ""}`}
        style={{ height: "100px" }}
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
        <div className="flex items-start h-full">
          {imageUrl && showExternalContent && (
            <div
              className="relative inline-block h-full"
              style={{ verticalAlign: "top" }}
            >
              <img
                src={imageUrl}
                alt={title || "Link preview"}
                className="h-full object-contain rounded-lg"
                onError={(e) => {
                  // Hide image if it fails to load
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}
          {(title || snippet) && (
            <div className="flex-grow pl-[40px] pr-2 pt-2 pb-2 min-w-0">
              {title && (
                <div
                  className={`font-semibold text-${theme}-text mb-1 line-clamp-2 text-xs`}
                >
                  {title}
                </div>
              )}
              {snippet && (
                <div
                  className={`text-xs text-${theme}-text-muted line-clamp-2`}
                >
                  {snippet}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
