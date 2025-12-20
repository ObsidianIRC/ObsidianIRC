import { useCallback, useEffect, useRef, useState } from "react";

export interface UseKeyboardNavigationOptions<T = unknown> {
  items: T[];
  onSelect?: (item: T, index: number) => void;
  onCancel?: () => void;
  isActive?: boolean;
  initialIndex?: number;
  wrap?: boolean;
  orientation?: "vertical" | "horizontal" | "grid";
  gridColumns?: number;
  disabledIndices?: number[];
  onFocusChange?: (index: number) => void;
}

export interface UseKeyboardNavigationReturn {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  handleKeyDown: (event: React.KeyboardEvent | KeyboardEvent) => void;
  selectItem: (index: number) => void;
  selectNext: () => void;
  selectPrevious: () => void;
  selectFirst: () => void;
  selectLast: () => void;
}

/**
 * Hook for keyboard navigation in lists and grids
 */
export const useKeyboardNavigation = <T = unknown>(
  options: UseKeyboardNavigationOptions<T>,
): UseKeyboardNavigationReturn => {
  const {
    items,
    onSelect,
    onCancel,
    isActive = true,
    initialIndex = 0,
    wrap = true,
    orientation = "vertical",
    gridColumns = 1,
    disabledIndices = [],
    onFocusChange,
  } = options;

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const lastItemsLength = useRef(items.length);

  // Reset index when items change significantly
  useEffect(() => {
    if (items.length !== lastItemsLength.current) {
      if (selectedIndex >= items.length) {
        setSelectedIndex(Math.max(0, items.length - 1));
      }
      lastItemsLength.current = items.length;
    }
  }, [items.length, selectedIndex]);

  // Notify focus change
  useEffect(() => {
    if (onFocusChange && isActive) {
      onFocusChange(selectedIndex);
    }
  }, [selectedIndex, onFocusChange, isActive]);

  // Find next valid index (skipping disabled items)
  const findNextValidIndex = useCallback(
    (currentIndex: number, direction: "next" | "previous"): number => {
      const step = direction === "next" ? 1 : -1;
      let nextIndex = currentIndex;
      let attempts = 0;
      const maxAttempts = items.length;

      do {
        nextIndex = nextIndex + step;

        if (wrap) {
          if (nextIndex < 0) nextIndex = items.length - 1;
          if (nextIndex >= items.length) nextIndex = 0;
        } else {
          nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
          if (nextIndex === currentIndex) return currentIndex;
        }

        attempts++;
        if (attempts > maxAttempts) return currentIndex;
      } while (
        disabledIndices.includes(nextIndex) &&
        nextIndex !== currentIndex
      );

      return nextIndex;
    },
    [items.length, wrap, disabledIndices],
  );

  const selectNext = useCallback(() => {
    const nextIndex = findNextValidIndex(selectedIndex, "next");
    setSelectedIndex(nextIndex);
  }, [selectedIndex, findNextValidIndex]);

  const selectPrevious = useCallback(() => {
    const prevIndex = findNextValidIndex(selectedIndex, "previous");
    setSelectedIndex(prevIndex);
  }, [selectedIndex, findNextValidIndex]);

  const selectFirst = useCallback(() => {
    let firstIndex = 0;
    while (
      disabledIndices.includes(firstIndex) &&
      firstIndex < items.length - 1
    ) {
      firstIndex++;
    }
    setSelectedIndex(firstIndex);
  }, [disabledIndices, items.length]);

  const selectLast = useCallback(() => {
    let lastIndex = items.length - 1;
    while (disabledIndices.includes(lastIndex) && lastIndex > 0) {
      lastIndex--;
    }
    setSelectedIndex(lastIndex);
  }, [disabledIndices, items.length]);

  const selectItem = useCallback(
    (index: number) => {
      if (
        index >= 0 &&
        index < items.length &&
        !disabledIndices.includes(index)
      ) {
        if (onSelect) {
          onSelect(items[index], index);
        }
      }
    },
    [items, onSelect, disabledIndices],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent | KeyboardEvent) => {
      if (!isActive || items.length === 0) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          if (orientation === "vertical") {
            selectNext();
          } else if (orientation === "grid") {
            const nextRow = selectedIndex + gridColumns;
            if (nextRow < items.length) {
              setSelectedIndex(nextRow);
            } else if (wrap) {
              setSelectedIndex(selectedIndex % gridColumns);
            }
          }
          break;

        case "ArrowUp":
          event.preventDefault();
          if (orientation === "vertical") {
            selectPrevious();
          } else if (orientation === "grid") {
            const prevRow = selectedIndex - gridColumns;
            if (prevRow >= 0) {
              setSelectedIndex(prevRow);
            } else if (wrap) {
              const column = selectedIndex % gridColumns;
              const lastRowStart =
                Math.floor((items.length - 1) / gridColumns) * gridColumns;
              setSelectedIndex(
                Math.min(lastRowStart + column, items.length - 1),
              );
            }
          }
          break;

        case "ArrowRight":
          event.preventDefault();
          if (orientation === "horizontal" || orientation === "grid") {
            selectNext();
          }
          break;

        case "ArrowLeft":
          event.preventDefault();
          if (orientation === "horizontal" || orientation === "grid") {
            selectPrevious();
          }
          break;

        case "Home":
          event.preventDefault();
          selectFirst();
          break;

        case "End":
          event.preventDefault();
          selectLast();
          break;

        case "Enter":
        case " ":
          event.preventDefault();
          selectItem(selectedIndex);
          break;

        case "Escape":
          event.preventDefault();
          if (onCancel) {
            onCancel();
          }
          break;

        case "Tab":
          // Allow Tab to move through items if desired
          event.preventDefault();
          if (event.shiftKey) {
            selectPrevious();
          } else {
            selectNext();
          }
          break;

        case "PageDown": {
          event.preventDefault();
          const pageSize = orientation === "grid" ? gridColumns * 3 : 5;
          const nextPageIndex = Math.min(
            selectedIndex + pageSize,
            items.length - 1,
          );
          setSelectedIndex(nextPageIndex);
          break;
        }

        case "PageUp": {
          event.preventDefault();
          const pageSizeUp = orientation === "grid" ? gridColumns * 3 : 5;
          const prevPageIndex = Math.max(selectedIndex - pageSizeUp, 0);
          setSelectedIndex(prevPageIndex);
          break;
        }
      }
    },
    [
      isActive,
      items.length,
      orientation,
      gridColumns,
      selectedIndex,
      wrap,
      selectNext,
      selectPrevious,
      selectFirst,
      selectLast,
      selectItem,
      onCancel,
    ],
  );

  // Global keyboard listener when active
  useEffect(() => {
    if (!isActive) return;

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      handleKeyDown(event);
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [isActive, handleKeyDown]);

  return {
    selectedIndex,
    setSelectedIndex,
    handleKeyDown,
    selectItem,
    selectNext,
    selectPrevious,
    selectFirst,
    selectLast,
  };
};

/**
 * Hook for command palette keyboard shortcuts
 */
export const useCommandShortcut = (
  shortcut: string,
  callback: () => void,
  enabled = true,
) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const keys = shortcut.toLowerCase().split("+");
      const hasCtrl = keys.includes("ctrl") || keys.includes("control");
      const hasAlt = keys.includes("alt");
      const hasShift = keys.includes("shift");
      const hasMeta = keys.includes("meta") || keys.includes("cmd");

      const key = keys[keys.length - 1];

      const isMatch =
        event.key.toLowerCase() === key &&
        event.ctrlKey === hasCtrl &&
        event.altKey === hasAlt &&
        event.shiftKey === hasShift &&
        event.metaKey === hasMeta;

      if (isMatch) {
        event.preventDefault();
        callback();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [shortcut, callback, enabled]);
};

export default useKeyboardNavigation;
