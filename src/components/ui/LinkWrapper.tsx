import React, { Children, cloneElement, Fragment, isValidElement } from "react";

interface EnhancedLinkWrapperProps {
  children: React.ReactNode;
  onIrcLinkClick?: (url: string) => void;
}

export const EnhancedLinkWrapper: React.FC<EnhancedLinkWrapperProps> = ({
  children,
  onIrcLinkClick
}) => {
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
              className="text-discord-text-link underline hover:text-blue-700"
              onClick={(e) => {
                if (
                  (matches[index].startsWith("ircs://") ||
                    matches[index].startsWith("irc://")) &&
                  onIrcLinkClick
                ) {
                  e.preventDefault();
                  onIrcLinkClick(matches[index]);
                }
              }}
            >
              {matches[index]}
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
  return <>{processChildren(children)}</>;
};