import { ChevronDownIcon } from "@heroicons/react/24/outline";
import type * as React from "react";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { isScrolledToBottom } from "../../hooks/useScrollToBottom";

export const COLLAPSIBLE_MAX_LINES = 8;

export interface CollapsibleMessageHandle {
  toggle: () => void;
}

interface CollapsibleMessageProps {
  content: React.ReactNode;
  maxLines?: number;
  onNeedsCollapsing?: (needs: boolean) => void;
}

export const CollapsibleMessage = forwardRef<
  CollapsibleMessageHandle,
  CollapsibleMessageProps
>(({ content, maxLines = COLLAPSIBLE_MAX_LINES, onNeedsCollapsing }, ref) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsCollapsing, setNeedsCollapsing] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [collapsedMaxHeight, setCollapsedMaxHeight] = useState<string>("none");
  const contentRef = useRef<HTMLDivElement>(null);
  // Inner wrapper whose box size changes freely — the outer contentRef is
  // max-height-clamped, so ResizeObserver on it would never fire for growing content
  const measuredContentRef = useRef<HTMLDivElement>(null);
  // Stays false through the initial measurement render so the first collapse is instant.
  // Flipped to true via RAF after that render commits; user expand/collapse animates after.
  const allowTransitionRef = useRef(false);

  useLayoutEffect(() => {
    if (!contentRef.current || !measuredContentRef.current) return;

    const element = contentRef.current;
    const measuredContent = measuredContentRef.current;

    const measure = () => {
      // Skip when display:none collapses all dimensions — would corrupt state.
      // Both must be 0: jsdom always has clientHeight=0, so the dual condition
      // ensures we only bail in genuine display:none (scrollHeight also collapses).
      if (element.clientHeight === 0 && measuredContent.scrollHeight === 0) {
        allowTransitionRef.current = false;
        return;
      }
      const computedStyle = window.getComputedStyle(element);
      const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 16;
      const maxHeight = lineHeight * maxLines;
      // Use the unclamped inner wrapper's scrollHeight for accurate measurement
      const fullHeight = measuredContent.scrollHeight;
      setContentHeight(fullHeight);
      setCollapsedMaxHeight(`${lineHeight * maxLines}px`);
      const needs = fullHeight > maxHeight;
      setNeedsCollapsing(needs);
      onNeedsCollapsing?.(needs);
      requestAnimationFrame(() => {
        allowTransitionRef.current = true;
      });
    };

    measure();

    // Re-measure when the inner content's rendered size changes (images loading,
    // dynamic embeds, etc.). Observing the inner element avoids the false-no-op
    // from the clamped outer container staying the same size.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(measuredContent);
    return () => resizeObserver.disconnect();
  }, [maxLines, onNeedsCollapsing]);

  const toggleExpanded = useCallback(() => {
    const willExpand = !isExpanded;

    if (willExpand && contentRef.current) {
      let scrollContainer: HTMLElement | null = null;
      let el: HTMLElement | null = contentRef.current.parentElement;
      while (el) {
        if (el.scrollHeight > el.clientHeight) {
          scrollContainer = el;
          break;
        }
        el = el.parentElement;
      }

      // Anchor scroll position during expand so users at the bottom stay there
      if (scrollContainer && isScrolledToBottom(scrollContainer)) {
        const container = scrollContainer;
        const observer = new ResizeObserver(() => {
          container.scrollTop = container.scrollHeight;
        });
        observer.observe(contentRef.current);
        setTimeout(() => observer.disconnect(), 350);
      }
    }

    setIsExpanded(willExpand);
  }, [isExpanded]);

  useImperativeHandle(ref, () => ({ toggle: toggleExpanded }), [
    toggleExpanded,
  ]);

  return (
    <div className="collapsible-message">
      <div className="relative">
        <div
          ref={contentRef}
          className="overflow-hidden"
          style={{
            maxHeight: isExpanded
              ? `${contentHeight}px`
              : needsCollapsing
                ? collapsedMaxHeight
                : "none",
            transition: allowTransitionRef.current
              ? "max-height 300ms ease-in-out"
              : "none",
          }}
        >
          <div ref={measuredContentRef}>{content}</div>
        </div>
        {needsCollapsing && !isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-b from-transparent to-discord-dark-100 group-hover:to-discord-message-hover pointer-events-none" />
        )}
      </div>
      {needsCollapsing && (
        <>
          {!isExpanded && <div className="border-b border-white/30" />}
          <div className="flex justify-start mt-0.5 ml-3">
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
});
CollapsibleMessage.displayName = "CollapsibleMessage";
