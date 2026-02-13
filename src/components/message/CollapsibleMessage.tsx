import type * as React from "react";
import { useLayoutEffect, useRef, useState } from "react";

interface CollapsibleMessageProps {
  content: React.ReactNode;
  maxLines?: number;
}

export const CollapsibleMessage: React.FC<CollapsibleMessageProps> = ({
  content,
  maxLines = 3,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsCollapsing, setNeedsCollapsing] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const animationTimeoutRef = useRef<number | null>(null);

  // Cleanup timeout on unmount
  useLayoutEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!contentRef.current) return;

    // Measure the actual rendered content height
    const element = contentRef.current;
    const computedStyle = window.getComputedStyle(element);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 16; // fallback to 16px
    const maxHeight = lineHeight * maxLines;

    // Get the full content height
    const fullHeight = element.scrollHeight;
    setContentHeight(fullHeight);

    // Check if content overflows the max height
    setNeedsCollapsing(fullHeight > maxHeight);
  }, [maxLines]);

  const toggleExpanded = () => {
    const willExpand = !isExpanded;
    setIsExpanding(willExpand);
    setIsAnimating(true);
    setIsExpanded(willExpand);

    // Clear any existing timeout
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }

    // Reset animation after it completes
    animationTimeoutRef.current = window.setTimeout(() => {
      setIsAnimating(false);
      animationTimeoutRef.current = null;
    }, 600);
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
              ? "4.5em"
              : "none",
        }}
      >
        {content}
      </div>
      {needsCollapsing && (
        <div className="truncation-container select-none">
          <div className="truncation-line" />
          <div className="mt-1 text-center">
            <button
              onClick={toggleExpanded}
              className="text-blue-500 hover:text-blue-600 text-xs font-medium cursor-pointer border border-blue-500 rounded-full py-0 px-1"
              style={{ textDecoration: "none" }}
            >
              {isExpanded ? "Show less " : "Show more "}
              <span
                className={`inline-block ${isAnimating ? (isExpanding ? "arrow-flip-expand" : "arrow-flip-collapse") : ""}`}
                style={
                  !isAnimating && isExpanded
                    ? { transform: "rotateX(180deg)" }
                    : undefined
                }
              >
                ↓
              </span>
            </button>
          </div>
          <div className="truncation-line" />
        </div>
      )}
    </div>
  );
};
