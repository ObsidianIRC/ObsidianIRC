import type { Message } from "../types/index";
import { stripIrcFormatting } from "./messageFormatter";

export function isImageLikeUrl(url: string): boolean {
  return (
    /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url) ||
    url.includes("/images/") ||
    /media\d*\.giphy\.com\/media\//.test(url) ||
    url.includes("media.tenor.com/") ||
    /tenor\.com\/view\//.test(url)
  );
}

/** Returns all image-like URLs found in a message's content. */
export function extractImageUrlsFromMessage(message: Message): string[] {
  const content = stripIrcFormatting(message.content).trim();
  if (
    !/\s/.test(content) &&
    content.startsWith("http") &&
    isImageLikeUrl(content)
  ) {
    return [content];
  }
  const matches = content.match(/https?:\/\/[^\s,]+/gi) ?? [];
  return matches
    .map((u) => u.replace(/[.,!?;:)>\]]+$/, ""))
    .filter(isImageLikeUrl);
}
