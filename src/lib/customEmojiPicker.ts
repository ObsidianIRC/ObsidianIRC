// Glue between draft/custom-emoji packs and the picker / completion
// UI.  Kept separate from the renderer (customEmoji.tsx) so JSX-free
// callers can import without pulling in React-DOM.

import type { EmojiClickData } from "emoji-picker-react";
import type { ResolvedShortcode } from "./customEmoji";

/**
 * Shape `emoji-picker-react` expects in its `customEmojis` prop.
 *
 * Each entry is a single-shortcode emoji card: the picker shows
 * `imgUrl` as the thumbnail and exposes the first `names[]` element
 * as the click result's `names[0]`.
 */
export interface PickerCustomEmoji {
  id: string;
  names: string[];
  imgUrl: string;
}

export function packEntriesForPicker(
  shortcodes: ResolvedShortcode[],
): PickerCustomEmoji[] {
  return shortcodes.map((sc) => ({
    id: `${sc.packId}/${sc.shortcode}`,
    names: [sc.shortcode],
    imgUrl: sc.url,
  }));
}

/**
 * Pull the right text out of the picker's click event.  For a regular
 * Unicode emoji this is the unicode character; for a custom emoji we
 * return the `:shortcode:` form so the message renderer downstream
 * can swap it back to the correct <img> via the same trust path that
 * formats inbound messages.
 */
export function emojiClickValue(d: EmojiClickData): string {
  if (d.isCustom && d.names && d.names.length > 0) {
    return `:${d.names[0]}:`;
  }
  return d.emoji;
}
