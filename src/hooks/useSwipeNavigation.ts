import { useCallback, useRef, useState } from "react";

interface SwipeNavigationConfig {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  threshold?: number;
  rubberBandStrength?: number;
}

interface SwipeNavigationReturn {
  containerRef: React.RefObject<HTMLDivElement>;
  offset: number;
  isTransitioning: boolean;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
}

interface TouchState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isDragging: boolean;
  isHorizontal: boolean | null;
}

export function useSwipeNavigation({
  currentPage,
  totalPages,
  onPageChange,
  threshold = 50,
  rubberBandStrength = 0.3,
}: SwipeNavigationConfig): SwipeNavigationReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const touchState = useRef<TouchState>({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    isDragging: false,
    isHorizontal: null,
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      isDragging: false,
      isHorizontal: null,
    };
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (isTransitioning) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchState.current.startX;
      const deltaY = touch.clientY - touchState.current.startY;

      if (touchState.current.isHorizontal === null) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absX > 10 || absY > 10) {
          touchState.current.isHorizontal = absX > absY;
        }
      }

      if (touchState.current.isHorizontal === false) {
        return;
      }

      if (touchState.current.isHorizontal === true) {
        e.preventDefault();
        touchState.current.isDragging = true;

        let newOffset = deltaX;

        if (currentPage === 0 && deltaX > 0) {
          newOffset = deltaX * rubberBandStrength;
        } else if (currentPage === totalPages - 1 && deltaX < 0) {
          newOffset = deltaX * rubberBandStrength;
        }

        setOffset(newOffset);
      }
    },
    [currentPage, totalPages, rubberBandStrength, isTransitioning],
  );

  const handleTouchEnd = useCallback(() => {
    if (!touchState.current.isDragging) {
      return;
    }

    const deltaX = offset;
    let newPage = currentPage;

    if (Math.abs(deltaX) > threshold) {
      if (deltaX > 0 && currentPage > 0) {
        newPage = currentPage - 1;
      } else if (deltaX < 0 && currentPage < totalPages - 1) {
        newPage = currentPage + 1;
      }
    }

    setIsTransitioning(true);
    setOffset(0);
    touchState.current = {
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      isDragging: false,
      isHorizontal: null,
    };

    if (newPage !== currentPage) {
      onPageChange(newPage);
    }

    setTimeout(() => {
      setIsTransitioning(false);
    }, 300);
  }, [offset, currentPage, totalPages, threshold, onPageChange]);

  return {
    containerRef,
    offset,
    isTransitioning,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
