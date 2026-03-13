import type React from "react";
import { useCallback, useRef, useState } from "react";
import { FaReply, FaTimes } from "react-icons/fa";
import { useSwipeable } from "react-swipeable";
import { useLongPress } from "../../hooks/useLongPress";
import MessageBottomSheet from "../mobile/MessageBottomSheet";

interface SwipeableMessageProps {
  children: React.ReactNode;
  onReply: () => void;
  onReact: (buttonElement: Element) => void;
  onDelete?: () => void;
  onTap?: () => void;
  canReply: boolean;
  canDelete: boolean;
  isNarrowView: boolean;
}

const SWIPE_THRESHOLD = 80;

export const SwipeableMessage: React.FC<SwipeableMessageProps> = ({
  children,
  onReply,
  onReact,
  onDelete,
  onTap,
  canReply,
  canDelete,
  isNarrowView,
}) => {
  const [translateX, setTranslateX] = useState(0);
  const [isSpringBack, setIsSpringBack] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const touchStartTargetRef = useRef<EventTarget | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef(false);

  const handleLongPress = useCallback(() => {
    setSheetOpen(true);
  }, []);

  const longPress = useLongPress({
    onLongPress: handleLongPress,
    delay: 400,
    moveThreshold: 10,
  });

  const claimGesture = useCallback(() => {
    wrapperRef.current?.setAttribute("data-no-swipe", "");
  }, []);

  const releaseGesture = useCallback(() => {
    wrapperRef.current?.removeAttribute("data-no-swipe");
  }, []);

  const handlers = useSwipeable({
    onSwiping: (e) => {
      if (longPress.firedRef.current) return;

      const dx = e.deltaX;

      const isActionable = (dx > 0 && canReply) || (dx < 0 && canDelete);
      if (!isActionable) return;

      claimGesture();
      setIsSpringBack(false);
      setTranslateX(dx);
    },
    onSwipedRight: (e) => {
      if (canReply && e.deltaX >= SWIPE_THRESHOLD) {
        onReply();
      }
      setIsSpringBack(true);
      setTranslateX(0);
      releaseGesture();
    },
    onSwipedLeft: (e) => {
      if (canDelete && Math.abs(e.deltaX) >= SWIPE_THRESHOLD) {
        onDelete?.();
      }
      setIsSpringBack(true);
      setTranslateX(0);
      releaseGesture();
    },
    onSwiped: () => {
      setIsSpringBack(true);
      setTranslateX(0);
      releaseGesture();
    },
    delta: 15,
    trackMouse: false,
    trackTouch: true,
    preventScrollOnSwipe: false,
  });

  // Desktop: no wrapper
  if (!isNarrowView) {
    return <>{children}</>;
  }

  const rightProgress = canReply
    ? Math.min(translateX / SWIPE_THRESHOLD, 1)
    : 0;
  const leftProgress = canDelete
    ? Math.min(Math.abs(translateX) / SWIPE_THRESHOLD, 1)
    : 0;

  // react-swipeable spreads onTouchStart/onTouchEnd/onTouchMove via {...handlers}
  // We layer our long-press handlers on top by wrapping
  const { ref: swipeRef, ...swipeEventHandlers } = handlers;

  return (
    <>
      <div
        ref={(el) => {
          swipeRef(el as HTMLElement);
          wrapperRef.current = el;
        }}
        {...swipeEventHandlers}
        onTouchStartCapture={(e) => {
          const touch = e.touches[0];
          touchStartTargetRef.current = e.target;
          touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
          hasMovedRef.current = false;
          longPress.onTouchStart(e);
        }}
        onTouchMoveCapture={(e) => {
          // Mirror useLongPress moveThreshold so a tap isn't cancelled by iOS micro-drift
          if (touchStartPosRef.current) {
            const t = e.touches[0];
            const dx = t.clientX - touchStartPosRef.current.x;
            const dy = t.clientY - touchStartPosRef.current.y;
            if (Math.sqrt(dx * dx + dy * dy) > 10) {
              hasMovedRef.current = true;
            }
          }
          longPress.onTouchMove(e);
        }}
        onTouchEndCapture={() => {
          // firedRef must be read before onTouchEnd clears it
          const wasLongPress = longPress.firedRef.current;
          longPress.onTouchEnd();
          releaseGesture();
          if (!wasLongPress && !hasMovedRef.current && onTap) {
            const target = touchStartTargetRef.current as Element | null;
            if (!target?.closest("button, [role='button'], a")) {
              onTap();
            }
          }
        }}
        onTouchCancelCapture={() => {
          longPress.onTouchCancel();
          releaseGesture();
        }}
        className={`relative ${translateX !== 0 ? "overflow-hidden" : ""}`}
      >
        {/* Reply icon behind (left side) */}
        {canReply && translateX > 0 && (
          <div
            className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{ opacity: rightProgress }}
          >
            <FaReply
              className={`text-lg ${rightProgress >= 1 ? "text-discord-reply" : "text-gray-400"}`}
            />
          </div>
        )}

        {/* Delete icon behind (right side) */}
        {canDelete && translateX < 0 && (
          <div
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{ opacity: leftProgress }}
          >
            <FaTimes
              className={`text-lg ${leftProgress >= 1 ? "text-red-400" : "text-gray-400"}`}
            />
          </div>
        )}

        {/* Message content */}
        <div
          style={{
            transform: `translateX(${translateX}px)`,
            transition: isSpringBack ? "transform 300ms ease-out" : "none",
          }}
          onTransitionEnd={() => setIsSpringBack(false)}
        >
          {children}
        </div>
      </div>

      <MessageBottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onReply={onReply}
        onReact={onReact}
        onDelete={onDelete}
        canReply={canReply}
        canReact={!!canReply}
        canDelete={canDelete}
      />
    </>
  );
};
