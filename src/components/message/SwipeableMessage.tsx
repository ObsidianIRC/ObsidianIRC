import type React from "react";
import { useCallback, useState } from "react";
import { FaReply, FaTimes } from "react-icons/fa";
import { useSwipeable } from "react-swipeable";
import { useLongPress } from "../../hooks/useLongPress";
import MessageBottomSheet from "../mobile/MessageBottomSheet";

interface SwipeableMessageProps {
  children: React.ReactNode;
  onReply: () => void;
  onReact: (buttonElement: Element) => void;
  onDelete?: () => void;
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
  canReply,
  canDelete,
  isNarrowView,
}) => {
  const [translateX, setTranslateX] = useState(0);
  const [isSpringBack, setIsSpringBack] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleLongPress = useCallback(() => {
    setSheetOpen(true);
  }, []);

  const longPress = useLongPress({
    onLongPress: handleLongPress,
    delay: 400,
    moveThreshold: 10,
  });

  const handlers = useSwipeable({
    onSwiping: (e) => {
      if (longPress.firedRef.current) return;

      let dx = e.deltaX;

      if (dx > 0 && !canReply) dx = 0;
      if (dx < 0 && !canDelete) dx = 0;

      setIsSpringBack(false);
      setTranslateX(dx);
    },
    onSwipedRight: (e) => {
      if (canReply && e.deltaX >= SWIPE_THRESHOLD) {
        onReply();
      }
      setIsSpringBack(true);
      setTranslateX(0);
    },
    onSwipedLeft: (e) => {
      if (canDelete && Math.abs(e.deltaX) >= SWIPE_THRESHOLD) {
        onDelete?.();
      }
      setIsSpringBack(true);
      setTranslateX(0);
    },
    onSwiped: () => {
      setIsSpringBack(true);
      setTranslateX(0);
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
        }}
        data-no-swipe
        {...swipeEventHandlers}
        onTouchStartCapture={(e) => {
          longPress.onTouchStart(e);
        }}
        onTouchMoveCapture={(e) => {
          longPress.onTouchMove(e);
        }}
        onTouchEndCapture={() => {
          longPress.onTouchEnd();
        }}
        onTouchCancelCapture={() => {
          longPress.onTouchCancel();
        }}
        className="relative overflow-hidden"
      >
        {/* Reply icon behind (left side) */}
        {canReply && translateX > 0 && (
          <div
            className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{ opacity: rightProgress }}
          >
            <FaReply
              className={`text-lg ${rightProgress >= 1 ? "text-blue-400" : "text-gray-400"}`}
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
