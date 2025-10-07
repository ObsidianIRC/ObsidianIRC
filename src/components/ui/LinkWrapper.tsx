import type React from "react";
import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useState,
} from "react";
import ExternalLinkWarningModal from "./ExternalLinkWarningModal";

interface EnhancedLinkWrapperProps {
  children: React.ReactNode;
  onIrcLinkClick?: (url: string) => void;
}

export const EnhancedLinkWrapper: React.FC<EnhancedLinkWrapperProps> = ({
  children,
  onIrcLinkClick,
}) => {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    // Handle IRC links
    if (
      (url.startsWith("ircs://") || url.startsWith("irc://")) &&
      onIrcLinkClick
    ) {
      e.preventDefault();
      onIrcLinkClick(url);
      return;
    }

    // Handle HTTP/HTTPS links - show warning modal
    if (url.startsWith("http://") || url.startsWith("https://")) {
      e.preventDefault();
      setPendingUrl(url);
    }
  };

  const handleConfirmOpen = () => {
    if (pendingUrl) {
      window.open(pendingUrl, "_blank", "noopener,noreferrer");
    }
    setPendingUrl(null);
  };

  const handleCancelOpen = () => {
    setPendingUrl(null);
  };

  // Truncate long URLs with middle ellipsis
  const truncateUrl = (url: string, maxLength = 60): string => {
    if (url.length <= maxLength) return url;

    const charsToShow = maxLength - 3; // Account for "..."
    const frontChars = Math.ceil(charsToShow / 2);
    const backChars = Math.floor(charsToShow / 2);

    return `${url.substring(0, frontChars)}...${url.substring(url.length - backChars)}`;
  };

  // Regular expression to detect HTTP and HTTPS links
  const urlRegex = /\b(?:https?|irc|ircs):\/\/[^\s<>"']+/gi;
  const parseContent = (content: string): React.ReactNode[] => {
    // Split the content based on the URL regex
    const parts = content.split(urlRegex);
    const matches = content.match(urlRegex) || [];

    return parts.map((part, index) => {
      // Generate stable keys based on content and position
      const partKey = `text-${part}-${index}`;
      const textPart = <span key={partKey}>{part}</span>;

      // If there's a matching link for this part, render it
      if (index < matches.length) {
        const fragmentKey = `fragment-${matches[index]}-${index}`;
        return (
          <Fragment key={fragmentKey}>
            {textPart}
            <a
              href={matches[index]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-discord-text-link underline hover:text-blue-700 break-all"
              onClick={(e) => handleLinkClick(e, matches[index])}
              title={matches[index]}
            >
              {truncateUrl(matches[index])}
            </a>
          </Fragment>
        );
      }

      return textPart;
    });
  };

  // Since children can be React nodes, we need to process them
  const processChildren = (node: React.ReactNode): React.ReactNode[] => {
    return (
      Children.map(node, (child) => {
        if (typeof child === "string") {
          return parseContent(child); // Process string content
        }
        if (isValidElement(child)) {
          // Skip already-linkified anchors to avoid nested <a>
          if ((child as React.ReactElement).type === "a") {
            return child;
          }
          // Directly process the children of the React element
          const processed = processChildren(
            (child as React.ReactElement).props?.children,
          );
          return cloneElement(
            child as React.ReactElement,
            undefined,
            processed,
          );
        }
        // For other types of children, return them as is
        return child as React.ReactNode;
      }) ?? []
    );
  };
  return (
    <>
      <ExternalLinkWarningModal
        isOpen={!!pendingUrl}
        url={pendingUrl || ""}
        onConfirm={handleConfirmOpen}
        onCancel={handleCancelOpen}
      />
      {processChildren(children)}
    </>
  );
};
