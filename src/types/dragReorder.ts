export interface DragState {
  draggedId: string | null;
  dragOverId: string | null;
  isDragging: boolean;
}

export interface TouchDragState {
  startY: number;
  currentY: number;
  itemId: string | null;
  initialIndex: number;
  currentIndex: number;
  isDragging: boolean;
}
