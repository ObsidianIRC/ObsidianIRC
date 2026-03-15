import type { EmojiClickData } from "emoji-picker-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AppEmojiPicker } from "./AppEmojiPicker";

interface Props {
  isOpen: boolean;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  zIndex?: number;
  placement?: "auto" | "left";
  /** Left edge of the container (in viewport px). When placement="left" the
   *  picker's right edge is anchored here instead of to anchorRect.left, so the
   *  picker stays fully outside the container regardless of button indent. */
  containerLeft?: number;
}

const PICKER_W = 352;
const PICKER_H = 450;
const GAP = 8;
const MARGIN = 12;

function computeStyle(
  anchorRect: DOMRect,
  zIndex = 50,
  placement: "auto" | "left" = "auto",
  containerLeft?: number,
): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const top =
    anchorRect.bottom + GAP + PICKER_H <= vh - MARGIN
      ? anchorRect.bottom + GAP
      : Math.max(MARGIN, anchorRect.top - GAP - PICKER_H);

  const left =
    placement === "left"
      ? Math.max(MARGIN, (containerLeft ?? anchorRect.left) - PICKER_W - GAP)
      : Math.min(Math.max(MARGIN, anchorRect.left), vw - PICKER_W - MARGIN);

  return { position: "fixed", top, left, zIndex, width: PICKER_W };
}

export function ReactionPopover({
  isOpen,
  anchorRect,
  onClose,
  onSelectEmoji,
  zIndex,
  placement,
  containerLeft,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      // Capture phase: fires before any bubble-phase listeners on child elements.
      // stopPropagation prevents the chat container's wheel handler from firing
      // (which would incorrectly set isScrolledUp=true even though the chat never scrolls).
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorRect) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={computeStyle(anchorRect, zIndex, placement, containerLeft)}
    >
      <div className="bg-discord-dark-400 rounded-lg shadow-lg border border-discord-dark-300 overflow-hidden">
        <AppEmojiPicker
          onEmojiClick={(d: EmojiClickData) => onSelectEmoji(d.emoji)}
        />
      </div>
    </div>,
    document.body,
  );
}
