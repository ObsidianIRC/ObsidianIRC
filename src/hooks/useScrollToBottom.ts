import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const SCROLL_TOLERANCE = 30;

export function isScrolledToBottom(
  container: HTMLElement,
  tolerance: number = SCROLL_TOLERANCE,
): boolean {
  return (
    container.scrollHeight - container.scrollTop - container.clientHeight <
    tolerance
  );
}

export interface UseScrollToBottomOptions {
  tolerance?: number;
  channelId?: string | null;
}

export interface UseScrollToBottomReturn {
  isScrolledUp: boolean;
  wasAtBottomRef: RefObject<boolean>;
  scrollToBottom: () => void;
}

export function useScrollToBottom(
  containerRef: RefObject<HTMLElement>,
  endElementRef: RefObject<HTMLElement>,
  options: UseScrollToBottomOptions = {},
): UseScrollToBottomReturn {
  const { tolerance = SCROLL_TOLERANCE, channelId } = options;
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const wasAtBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    endElementRef.current?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => {
      endElementRef.current?.scrollIntoView({ behavior: "auto" });
    }, 500);
  }, [endElementRef]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: channelId is intentionally included to re-initialize scroll detection when channel changes
  useEffect(() => {
    const container = containerRef.current;
    const endElement = endElementRef.current;

    if (!container || !endElement) return;

    const checkIfScrolledToBottom = () => {
      const atBottom = isScrolledToBottom(container, tolerance);
      setIsScrolledUp(!atBottom);
      wasAtBottomRef.current = atBottom;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries[0].isIntersecting;
        setIsScrolledUp(!isVisible);
        wasAtBottomRef.current = isVisible;
      },
      {
        root: container,
        threshold: 0,
        rootMargin: `${tolerance}px`,
      },
    );

    observer.observe(endElement);

    const checkInitial = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(checkIfScrolledToBottom);
      });
    };
    checkInitial();

    container.addEventListener("scroll", checkIfScrolledToBottom, {
      passive: true,
    });

    container.addEventListener("touchend", checkIfScrolledToBottom, {
      passive: true,
    });

    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", checkIfScrolledToBottom);
      container.removeEventListener("touchend", checkIfScrolledToBottom);
    };
  }, [containerRef, endElementRef, tolerance, channelId]);

  return { isScrolledUp, wasAtBottomRef, scrollToBottom };
}
