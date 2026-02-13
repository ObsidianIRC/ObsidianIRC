import { useCallback, useEffect, useRef, useState } from "react";

interface UseDragReorderConfig<T> {
  items: T[];
  getItemId: (item: T) => string;
  onReorder: (reorderedIds: string[]) => void;
  disabled?: boolean;
}

interface UseDragReorderReturn {
  handlePointerDown: (e: React.PointerEvent, itemId: string) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  getItemProps: (itemId: string) => {
    "data-draggable-item": true;
    "data-item-id": string;
    onPointerDown: (e: React.PointerEvent) => void;
    className: string;
    style?: React.CSSProperties;
  };
  draggedItemId: string | null;
  dragOverItemId: string | null;
  isDragging: boolean;
}

export function useDragReorder<T>({
  items,
  getItemId,
  onReorder,
  disabled = false,
}: UseDragReorderConfig<T>): UseDragReorderReturn {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dragState = useRef({
    startY: 0,
    currentY: 0,
    itemId: null as string | null,
    initialIndex: -1,
    hasMoved: false,
    dragOffset: 0,
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, itemId: string) => {
      if (disabled || e.button !== 0) return;

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const index = items.findIndex((item) => getItemId(item) === itemId);

      dragState.current = {
        startY: e.clientY,
        currentY: e.clientY,
        itemId,
        initialIndex: index,
        hasMoved: false,
        dragOffset: 0,
      };
    },
    [disabled, items, getItemId],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !dragState.current.itemId) return;

      const deltaY = Math.abs(e.clientY - dragState.current.startY);

      if (!dragState.current.hasMoved && deltaY > 5) {
        dragState.current.hasMoved = true;
        setIsDragging(true);
        setDraggedItemId(dragState.current.itemId);
      }

      if (dragState.current.hasMoved) {
        dragState.current.currentY = e.clientY;
        dragState.current.dragOffset = e.clientY - dragState.current.startY;

        // Always find a drop target - no dead zones
        const allItems = Array.from(
          document.querySelectorAll<HTMLElement>("[data-draggable-item]"),
        );

        if (allItems.length === 0) return;

        let targetId: string | null = null;
        let minDistance = Number.POSITIVE_INFINITY;

        // Find which item zone the cursor is in
        for (const item of allItems) {
          const itemId = item.getAttribute("data-item-id");
          if (!itemId) continue;

          const rect = item.getBoundingClientRect();
          const itemCenter = rect.top + rect.height / 2;
          const distance = Math.abs(e.clientY - itemCenter);

          if (distance < minDistance) {
            minDistance = distance;
            targetId = itemId;
          }
        }

        // Always set a target (ensures continuous visual feedback)
        if (targetId) {
          setDragOverItemId(targetId);
        }
      }
    },
    [disabled],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;

      const target = e.currentTarget as HTMLElement;
      target.releasePointerCapture(e.pointerId);

      if (
        dragState.current.hasMoved &&
        dragState.current.itemId &&
        dragOverItemId
      ) {
        const draggedId = dragState.current.itemId;

        if (draggedId !== dragOverItemId) {
          const draggedIndex = items.findIndex(
            (item) => getItemId(item) === draggedId,
          );
          const targetIndex = items.findIndex(
            (item) => getItemId(item) === dragOverItemId,
          );

          if (draggedIndex !== -1 && targetIndex !== -1) {
            const reordered = [...items];
            const [removed] = reordered.splice(draggedIndex, 1);
            reordered.splice(targetIndex, 0, removed);
            onReorder(reordered.map(getItemId));
          }
        }
      }

      dragState.current = {
        startY: 0,
        currentY: 0,
        itemId: null,
        initialIndex: -1,
        hasMoved: false,
        dragOffset: 0,
      };
      setIsDragging(false);
      setDraggedItemId(null);
      setDragOverItemId(null);
    },
    [disabled, dragOverItemId, items, getItemId, onReorder],
  );

  const getItemProps = useCallback(
    (itemId: string) => {
      const isDraggingThis = draggedItemId === itemId && isDragging;

      const draggedIndex = items.findIndex(
        (item) => getItemId(item) === draggedItemId,
      );
      const targetIndex = items.findIndex((item) => getItemId(item) === itemId);
      const isTargetBelow = targetIndex > draggedIndex;

      // Show visual feedback for insertion point
      // "Above" means insert BEFORE this item, "Below" means insert AFTER this item
      let isDropTargetAbove = false;
      let isDropTargetBelow = false;

      if (dragOverItemId === itemId && isDragging) {
        // If dragging over itself, show where it will stay
        if (draggedItemId === itemId) {
          // Show subtle indication it's staying in place
          isDropTargetBelow = true;
        } else {
          // Dragging over a different item
          if (!isTargetBelow) {
            // Target is above dragged item → will insert before target
            isDropTargetAbove = true;
          } else {
            // Target is below dragged item → will insert after target
            isDropTargetBelow = true;
          }
        }
      }

      return {
        "data-draggable-item": true as const,
        "data-item-id": itemId,
        onPointerDown: (e: React.PointerEvent) => handlePointerDown(e, itemId),
        className: [
          "draggable-item",
          isDraggingThis && "is-dragging",
          isDropTargetAbove && "is-drop-target-above",
          isDropTargetBelow && "is-drop-target-below",
        ]
          .filter(Boolean)
          .join(" "),
        style: isDraggingThis
          ? {
              transform: `translateY(${dragState.current.dragOffset}px) translateZ(0)`,
            }
          : undefined,
      };
    },
    [
      handlePointerDown,
      draggedItemId,
      isDragging,
      dragOverItemId,
      items,
      getItemId,
    ],
  );

  useEffect(() => {
    if (isDragging) {
      document.body.classList.add("no-select");
      return () => {
        document.body.classList.remove("no-select");
      };
    }
  }, [isDragging]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    getItemProps,
    draggedItemId,
    dragOverItemId,
    isDragging,
  };
}
