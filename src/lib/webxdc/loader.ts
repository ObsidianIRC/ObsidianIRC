import type { XdcBundle } from "./unzip";

const MIME_BY_EXT: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  js: "application/javascript",
  mjs: "application/javascript",
  css: "text/css",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  wasm: "application/wasm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  txt: "text/plain",
};

function mimeFor(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export interface LoadedXdc {
  iframeSrc: string;
  blobUrls: string[];
}

// Strict CSP. Webxdc spec forbids internet access; we go further and drop
// optional features (eval, deep-linking, file import, sendToChat) for a
// minimal attack surface. Apps that need those won't run here — by design.
//
// - default-src 'self' blob: data:  — only blob/data assets from the bundle
// - connect-src 'none'              — no fetch/XHR/WebSocket/EventSource/Beacon
// - script-src ... NO 'unsafe-eval' — eval(), new Function(), setTimeout(string) blocked
// - frame-src 'none'                — no nested iframes
// - object-src 'none'               — no <embed>/<object>
// - base-uri 'none'                 — no <base href> attack to redirect relatives
// - form-action 'none'              — no form POSTs (even cross-origin)
const WEBXDC_CSP =
  "default-src 'self' blob: data:; " +
  "script-src 'self' 'unsafe-inline' blob:; " +
  "style-src 'self' 'unsafe-inline' blob:; " +
  "img-src 'self' blob: data:; " +
  "media-src 'self' blob: data:; " +
  "font-src 'self' blob: data:; " +
  "connect-src 'none'; " +
  "frame-src 'none'; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "form-action 'none'";

// Pure: rewrites HTML asset references using the path→URL map and injects
// CSP meta + shim. Exported separately so tests can verify CSP/shim injection
// without needing URL.createObjectURL (not available in jsdom).
export function renderXdcHtml(
  bundle: XdcBundle,
  shimSource: string,
  pathToUrl: Map<string, string>,
): string {
  const indexBytes = bundle.files["index.html"];
  if (!indexBytes) throw new Error(".xdc missing index.html");
  let html = new TextDecoder().decode(indexBytes);

  html = rewriteAttr(
    html,
    /<(?:img|script|link|source|audio|video)\b[^>]*\b(src|href)\s*=\s*"([^"]+)"/gi,
    pathToUrl,
  );
  html = rewriteAttr(
    html,
    /<(?:img|script|link|source|audio|video)\b[^>]*\b(src|href)\s*=\s*'([^']+)'/gi,
    pathToUrl,
  );

  const cspTag = `<meta http-equiv="Content-Security-Policy" content="${WEBXDC_CSP}">`;
  const shimTag = `<script>${shimSource}</script>`;
  return injectIntoHead(html, cspTag + shimTag);
}

// Builds a blob URL for index.html with all asset references rewritten to blob URLs.
// Injects CSP meta + webxdc shim into <head>. CSP enforces no-network sandbox per spec.
//
// Apps conventionally reference the shim via <script src="webxdc.js"></script>.
// The host (us) provides that file. We inject the shim inline at the top of
// <head> and also map webxdc.js to a no-op blob so the script tag loads
// without 404 — the actual shim already ran inline before any app code.
export function buildIframeSrc(
  bundle: XdcBundle,
  shimSource: string,
): LoadedXdc {
  const blobUrls: string[] = [];
  const pathToBlob = new Map<string, string>();

  for (const [path, bytes] of Object.entries(bundle.files)) {
    if (path === "index.html" || path === "manifest.toml") continue;
    const blob = new Blob([bytes as BlobPart], { type: mimeFor(path) });
    const url = URL.createObjectURL(blob);
    pathToBlob.set(path, url);
    pathToBlob.set(`./${path}`, url);
    pathToBlob.set(`/${path}`, url);
    blobUrls.push(url);
  }

  const noopJs = "/* webxdc shim loaded inline at head */";
  const noopBlob = new Blob([noopJs], { type: "application/javascript" });
  const noopUrl = URL.createObjectURL(noopBlob);
  pathToBlob.set("webxdc.js", noopUrl);
  pathToBlob.set("./webxdc.js", noopUrl);
  pathToBlob.set("/webxdc.js", noopUrl);
  blobUrls.push(noopUrl);

  const html = renderXdcHtml(bundle, shimSource, pathToBlob);
  const indexBlob = new Blob([html], { type: "text/html" });
  const iframeSrc = URL.createObjectURL(indexBlob);
  blobUrls.push(iframeSrc);

  return { iframeSrc, blobUrls };
}

function rewriteAttr(
  html: string,
  re: RegExp,
  map: Map<string, string>,
): string {
  return html.replace(re, (match, _attr, url) => {
    if (/^(https?:|data:|blob:|#)/.test(url)) return match;
    const hit = map.get(url) ?? map.get(url.replace(/^\.\//, ""));
    if (!hit) return match;
    return match.replace(url, hit);
  });
}

function injectIntoHead(html: string, snippet: string): string {
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (m) => `${m}${snippet}`);
  }
  return `<head>${snippet}</head>${html}`;
}

export function disposeBlobs(loaded: LoadedXdc): void {
  for (const u of loaded.blobUrls) URL.revokeObjectURL(u);
}
