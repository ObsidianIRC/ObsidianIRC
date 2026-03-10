import { ChevronDownIcon } from "@heroicons/react/24/outline";
import type * as React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { isScrolledToBottom } from "../../hooks/useScrollToBottom";

interface CollapsibleMessageProps {
  content: React.ReactNode;
  maxLines?: number;
}

export const CollapsibleMessage: React.FC<CollapsibleMessageProps> = ({
  content,
  maxLines = 5,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsCollapsing, setNeedsCollapsing] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [collapsedMaxHeight, setCollapsedMaxHeight] = useState<string>("none");
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!contentRef.current) return;

    const element = contentRef.current;
    const computedStyle = window.getComputedStyle(element);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 16;
    const maxHeight = lineHeight * maxLines;

    const fullHeight = element.scrollHeight;
    setContentHeight(fullHeight);
    setCollapsedMaxHeight(`${lineHeight * maxLines}px`);

    setNeedsCollapsing(fullHeight > maxHeight);
  }, [maxLines]);

  const toggleExpanded = () => {
    const willExpand = !isExpanded;

    if (willExpand && contentRef.current) {
      // Find the nearest scrollable ancestor
      let scrollContainer: HTMLElement | null = null;
      let el: HTMLElement | null = contentRef.current.parentElement;
      while (el) {
        if (el.scrollHeight > el.clientHeight) {
          scrollContainer = el;
          break;
        }
        el = el.parentElement;
      }

      // If the user was at the bottom, keep them there during the expand animation
      if (scrollContainer && isScrolledToBottom(scrollContainer)) {
        const container = scrollContainer;
        const observer = new ResizeObserver(() => {
          container.scrollTop = container.scrollHeight;
        });
        observer.observe(contentRef.current);
        // Disconnect slightly after the 300ms transition ends
        setTimeout(() => observer.disconnect(), 350);
      }
    }

    setIsExpanded(willExpand);
  };

  return (
    <div className="collapsible-message">
      <div
        ref={contentRef}
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          maxHeight: isExpanded
            ? `${contentHeight}px`
            : needsCollapsing
              ? collapsedMaxHeight
              : "none",
        }}
      >
        {content}
      </div>
      {needsCollapsing && (
        <>
          {!isExpanded && <div className="border-b border-white/20 mt-1" />}
          <div className="flex justify-start mt-0.5">
            <button
              onClick={toggleExpanded}
              title={isExpanded ? "Show less" : "Read more"}
              className="opacity-80 hover:opacity-100 transition-opacity p-0.5 rounded"
            >
              <ChevronDownIcon
                className={`w-5 h-5 text-discord-text-muted transition-transform duration-300 ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
        </>
      )}
    </div>
  );
};
