import type { Message } from "../types/index";
import { isUrlFromFilehost } from "./ircUtils";
import { stripIrcFormatting } from "./messageFormatter";

export type MediaType = "image" | "video" | "audio" | "pdf" | "embed";

export interface MediaEntry {
  url: string;
  type: MediaType | null; // null = type unknown, needs HEAD probe
}

export const TRUSTED_EMBED_DOMAINS: Record<string, MediaType> = {
  "youtube.com": "embed",
  "youtu.be": "embed",
  "vimeo.com": "embed",
  "soundcloud.com": "embed",
  "open.spotify.com": "embed",
  "media.tenor.com": "image",
  "tenor.com": "image",
  "media.giphy.com": "image",
  "giphy.com": "image",
  "imgur.com": "image",
};

/** Extract and normalise the hostname from a URL, stripping a leading www. Returns null on parse failure. */
function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Detect media type from a URL. Returns null if not recognised. */
export function detectMediaType(url: string): MediaType | null {
  const hostname = extractHostname(url);
  if (hostname === null) return null;

  for (const domain of Object.keys(TRUSTED_EMBED_DOMAINS)) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return TRUSTED_EMBED_DOMAINS[domain];
    }
  }

  const lower = url.toLowerCase().split("?")[0].split("#")[0];

  if (/\.(mp4|webm|mov|ogv)$/.test(lower)) return "video";
  if (/\.(mp3|ogg|wav|flac|aac|m4a)$/.test(lower)) return "audio";
  if (/\.pdf$/.test(lower)) return "pdf";
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(lower)) return "image";

  return null;
}

/** Like detectMediaType but trusted domains only — no extension guessing.
 *  Extension-based URLs get type:null so they are always HEAD-probed at render
 *  time. This lets the server's actual Content-Type override the URL hint
 *  (e.g. a .png path that serves text/html should produce no preview). */
function detectTrustedDomainType(url: string): MediaType | null {
  const hostname = extractHostname(url);
  if (hostname === null) return null;
  for (const domain of Object.keys(TRUSTED_EMBED_DOMAINS)) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return TRUSTED_EMBED_DOMAINS[domain];
    }
  }
  return null;
}

export function isImageLikeUrl(url: string): boolean {
  return detectMediaType(url) === "image";
}

/** Returns all media entries found in a message's content, deduplicated by URL.
 *  Trusted-domain URLs (YouTube, Tenor, etc.) get their type pre-set.
 *  All other URLs — including those with image/video/audio extensions — get
 *  type:null so ProbeablePreview HEAD-probes them. This ensures the server's
 *  actual Content-Type is authoritative: a .png path returning text/html will
 *  produce no preview instead of a broken image widget. */
export function extractMediaFromMessage(message: Message): MediaEntry[] {
  const content = stripIrcFormatting(message.content).trim();

  // Single-token message that starts with http — check it directly
  if (!/\s/.test(content) && content.startsWith("http")) {
    const clean = content.replace(/[.,!?;:)>\]*]+$/, "");
    return [{ url: clean, type: detectTrustedDomainType(clean) }];
  }

  const matches = content.match(/https?:\/\/[^\s,]+/gi) ?? [];
  const seen = new Set<string>();
  const entries: MediaEntry[] = [];
  for (const raw of matches) {
    const u = raw.replace(/[.,!?;:)>\]*]+$/, "");
    if (seen.has(u)) continue;
    seen.add(u);
    entries.push({ url: u, type: detectTrustedDomainType(u) });
  }
  return entries;
}

export interface MediaSettings {
  showSafeMedia: boolean;
  showTrustedSourcesMedia: boolean;
  showExternalContent: boolean;
}

export type MediaVisibilityLevel = 0 | 1 | 2 | 3;
// 0 — Off:      no previews
// 1 — Safe:     server's trusted filehost only
// 2 — Trusted:  filehost + known embed services (YouTube, Vimeo, etc.)
// 3 — External: all URLs are candidates

/** Single source of truth for the enum → MediaSettings conversion. */
export function mediaLevelToSettings(
  level: MediaVisibilityLevel,
): MediaSettings {
  return {
    showSafeMedia: level >= 1,
    showTrustedSourcesMedia: level >= 2,
    showExternalContent: level >= 3,
  };
}

/**
 * Returns a static thumbnail URL for known embed platforms.
 * Currently supports YouTube (CDN thumbnail, no API key needed).
 */
export function getEmbedThumbnailUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "youtu.be") {
      let videoId: string | null = null;
      if (host === "youtu.be") {
        videoId = u.pathname.slice(1).split("/")[0] || null;
      } else {
        videoId = u.searchParams.get("v");
        if (!videoId) {
          const parts = u.pathname.split("/").filter(Boolean);
          if (parts[0] === "embed" || parts[0] === "shorts")
            videoId = parts[1] ?? null;
        }
      }
      if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
  } catch {
    // ignore invalid URLs
  }
  return null;
}

export function filenameFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
}

/** Returns true if the given URL should be shown based on current media settings. */
export function canShowMedia(
  url: string,
  settings: MediaSettings,
  filehost?: string | null,
): boolean {
  if (settings.showExternalContent) return true;
  if (settings.showSafeMedia && filehost && isUrlFromFilehost(url, filehost))
    return true;
  if (settings.showTrustedSourcesMedia) {
    const hostname = extractHostname(url);
    if (hostname === null) return false;
    for (const domain of Object.keys(TRUSTED_EMBED_DOMAINS)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return true;
    }
  }
  return false;
}
