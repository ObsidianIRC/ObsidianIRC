import { useCallback, useRef } from "react";

interface UseLongPressOptions {
  delay?: number;
  moveThreshold?: number;
  onLongPress: () => void;
}

export function useLongPress({
  delay = 400,
  moveThreshold = 10,
  onLongPress,
}: UseLongPressOptions) {
  const timerRef = useRef<number | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPos.current = null;
    firedRef.current = false;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      firedRef.current = false;
      const touch = e.touches[0];
      startPos.current = { x: touch.clientX, y: touch.clientY };
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        onLongPress();
        timerRef.current = null;
      }, delay);
    },
    [delay, onLongPress],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPos.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startPos.current.x;
      const dy = touch.clientY - startPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > moveThreshold) {
        clear();
      }
    },
    [moveThreshold, clear],
  );

  const onTouchEnd = useCallback(() => {
    clear();
  }, [clear]);

  const onTouchCancel = useCallback(() => {
    clear();
  }, [clear]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    firedRef,
  };
}
