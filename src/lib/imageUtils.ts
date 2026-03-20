import type { Message } from "../types/index";
import { canShowMedia, extractMediaFromMessage } from "./mediaUtils";

export { isImageLikeUrl } from "./mediaUtils";

/** Returns all image-like URLs found in a message's content. */
export function extractImageUrlsFromMessage(message: Message): string[] {
  return extractMediaFromMessage(message)
    .filter((e) => e.type === "image")
    .map((e) => e.url);
}

export function canShowImageUrl(
  url: string,
  showSafeMedia: boolean,
  showExternalContent: boolean,
  filehost?: string | null,
): boolean {
  // Backwards-compat wrapper: trusted-sources flag intentionally absent to preserve old image-only behaviour
  return canShowMedia(
    url,
    { showSafeMedia, showTrustedSourcesMedia: false, showExternalContent },
    filehost,
  );
}
