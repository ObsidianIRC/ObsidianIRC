import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import { useEffect, useRef } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";

interface AppEmojiPickerProps {
  onEmojiClick: (emojiData: EmojiClickData) => void;
}

/**
 * Shared emoji picker with app-wide defaults.
 * On mobile the search input is not auto-focused (prevents keyboard popup).
 */
export function AppEmojiPicker({ onEmojiClick }: AppEmojiPickerProps) {
  const isMobile = useMediaQuery();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // The library calls element.focus() via requestAnimationFrame internally,
  // which races with autoFocusSearch={false}. Blurring after a short delay
  // reliably prevents the on-screen keyboard from appearing on mobile.
  useEffect(() => {
    if (!isMobile) return;
    const id = setTimeout(() => {
      const input =
        wrapperRef.current?.querySelector<HTMLInputElement>("input");
      input?.blur();
    }, 50);
    return () => clearTimeout(id);
  }, [isMobile]);

  return (
    <div ref={wrapperRef}>
      <EmojiPicker
        onEmojiClick={onEmojiClick}
        theme={Theme.DARK}
        width="100%"
        height={isMobile ? 500 : 380}
        searchPlaceholder="Search emojis..."
        previewConfig={{ showPreview: false }}
        skinTonesDisabled={false}
        lazyLoadEmojis={true}
        autoFocusSearch={!isMobile}
      />
    </div>
  );
}
