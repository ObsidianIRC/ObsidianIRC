import { detectMediaType, type MediaType } from "./mediaUtils";

export interface ProbeResult {
  type: MediaType;
  size?: number;
  streamable: boolean; // audio/* with no Content-Length
  skipped: boolean; // video > 50 MB — show link, not preview
}

const cache = new Map<string, ProbeResult | null>();
const keyOrder: string[] = [];
const MAX_CACHE_SIZE = 200;

function cacheSet(url: string, result: ProbeResult | null): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = keyOrder.shift();
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(url, result);
  keyOrder.push(url);
}

/** Returns true if the URL has no detectable type and should be HEAD-probed. */
export function shouldProbeUrl(url: string): boolean {
  return detectMediaType(url) === null;
}

export async function probeMediaUrl(url: string): Promise<ProbeResult | null> {
  if (cache.has(url)) return cache.get(url) ?? null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      cacheSet(url, null);
      return null;
    }

    const contentType = response.headers.get("Content-Type") ?? "";
    const rawType = contentType.split(";")[0].trim();

    let type: MediaType;
    if (rawType.startsWith("video/")) {
      type = "video";
    } else if (rawType.startsWith("audio/")) {
      type = "audio";
    } else if (rawType.startsWith("image/")) {
      type = "image";
    } else if (rawType === "application/pdf") {
      type = "pdf";
    } else {
      cacheSet(url, null);
      return null;
    }

    const lengthHeader = response.headers.get("Content-Length");
    const contentLength =
      lengthHeader !== null ? Number(lengthHeader) : undefined;

    if (
      type === "video" &&
      contentLength !== undefined &&
      contentLength > 52_428_800
    ) {
      const result: ProbeResult = {
        type,
        size: contentLength,
        streamable: false,
        skipped: true,
      };
      cacheSet(url, result);
      return result;
    }

    const streamable = type === "audio" && contentLength === undefined;
    const result: ProbeResult = {
      type,
      size: contentLength,
      streamable,
      skipped: false,
    };
    cacheSet(url, result);
    return result;
  } catch (err) {
    clearTimeout(timer);

    // Intentional abort (timeout) — don't try further.
    if (err instanceof Error && err.name === "AbortError") {
      cacheSet(url, null);
      return null;
    }

    // HEAD failed, most likely CORS (no Access-Control-Allow-Origin header).
    // <audio>/<video> elements load cross-origin media without CORS restrictions,
    // so use them to detect audio/video when fetch can't read the response.
    // Probe video first: <audio> can play mp4 audio tracks, misclassifying video as audio.
    const isVideo = await probeViaMediaElement(url, "video");
    if (isVideo) {
      const result: ProbeResult = {
        type: "video",
        streamable: false,
        skipped: false,
      };
      cacheSet(url, result);
      return result;
    }
    const isAudio = await probeViaMediaElement(url, "audio");
    if (isAudio) {
      const result: ProbeResult = {
        type: "audio",
        streamable: true,
        skipped: false,
      };
      cacheSet(url, result);
      return result;
    }

    cacheSet(url, null);
    return null;
  }
}

// Tries to load a URL as audio or video using a temporary media element.
// loadedmetadata fires if the browser can decode it; error fires otherwise.
// This bypasses CORS restrictions that block fetch() for cross-origin servers.
function probeViaMediaElement(
  url: string,
  tag: "audio" | "video",
): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement(tag);
    el.preload = "metadata";
    let settled = false;
    const done = (result: boolean) => {
      if (settled) return;
      settled = true;
      el.src = "";
      el.load(); // abort pending network activity
      resolve(result);
    };
    // loadedmetadata fires for regular files; canplay also catches live streams
    // where some browsers skip straight to buffering without a discrete metadata event.
    el.addEventListener("loadedmetadata", () => done(true), { once: true });
    el.addEventListener("canplay", () => done(true), { once: true });
    el.addEventListener("error", () => done(false), { once: true });
    setTimeout(() => done(false), 5_000);
    el.src = url;
  });
}
