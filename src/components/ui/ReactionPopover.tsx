import type { EmojiClickData } from "emoji-picker-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AppEmojiPicker } from "./AppEmojiPicker";

interface Props {
  isOpen: boolean;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
}

const PICKER_W = 320;
const PICKER_H = 420;
const GAP = 8;
const MARGIN = 12;

function computeStyle(anchorRect: DOMRect): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const top =
    anchorRect.bottom + GAP + PICKER_H <= vh - MARGIN
      ? anchorRect.bottom + GAP
      : Math.max(MARGIN, anchorRect.top - GAP - PICKER_H);

  const left = Math.min(
    Math.max(MARGIN, anchorRect.left),
    vw - PICKER_W - MARGIN,
  );

  return { position: "fixed", top, left, zIndex: 50, width: PICKER_W };
}

export function ReactionPopover({
  isOpen,
  anchorRect,
  onClose,
  onSelectEmoji,
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

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorRect) return null;

  return createPortal(
    <div ref={popoverRef} style={computeStyle(anchorRect)}>
      <div className="bg-discord-dark-400 rounded-lg shadow-lg border border-discord-dark-300 overflow-hidden">
        <AppEmojiPicker
          onEmojiClick={(d: EmojiClickData) => onSelectEmoji(d.emoji)}
        />
      </div>
    </div>,
    document.body,
  );
}
