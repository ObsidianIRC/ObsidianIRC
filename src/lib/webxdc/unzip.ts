import { unzipSync } from "fflate";
import { isTauri } from "../platformUtils";

export interface XdcBundle {
  files: Record<string, Uint8Array>;
  manifest: { name?: string; sourceCodeUrl?: string; minApi?: number };
  iconUrl?: string;
}

// In Tauri, route through native reqwest — bypasses browser CORS so .xdc
// downloads work against any filehost. In web, plain fetch — relies on the
// filehost sending Access-Control-Allow-Origin (no client-side workaround).
async function fetchBytes(url: string): Promise<Uint8Array> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const arr = await invoke<number[]>("fetch_bytes", { url });
    return new Uint8Array(arr);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// girafiles redirects unknown MIMEs to /info/ for browsers; ?download=1 forces
// byte delivery. Harmless query param on filehosts that don't recognise it.
function withDownloadParam(url: string): string {
  return url.includes("?") ? `${url}&download=1` : `${url}?download=1`;
}

export async function fetchAndUnzipXdc(url: string): Promise<XdcBundle> {
  let buf: Uint8Array;
  try {
    buf = await fetchBytes(withDownloadParam(url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isTauri() && /Failed to fetch|NetworkError|CORS/i.test(msg)) {
      throw new Error(
        "Filehost blocks cross-origin reads (no Access-Control-Allow-Origin header). " +
          "Either open this app in the desktop/mobile build, or have the filehost set " +
          "`Access-Control-Allow-Origin: *`.",
      );
    }
    throw new Error(`Failed to fetch .xdc: ${msg}`);
  }
  const files = unzipSync(buf);
  const manifestBytes = files["manifest.toml"];
  const manifest = manifestBytes
    ? parseManifest(new TextDecoder().decode(manifestBytes))
    : {};

  let iconUrl: string | undefined;
  const iconKey = files["icon.png"]
    ? "icon.png"
    : files["icon.jpg"]
      ? "icon.jpg"
      : undefined;
  if (iconKey) {
    const blob = new Blob([files[iconKey] as BlobPart], {
      type: iconKey.endsWith(".png") ? "image/png" : "image/jpeg",
    });
    iconUrl = URL.createObjectURL(blob);
  }

  return { files, manifest, iconUrl };
}

function parseManifest(toml: string): XdcBundle["manifest"] {
  const out: XdcBundle["manifest"] = {};
  for (const line of toml.split(/\r?\n/)) {
    const m = line.match(/^\s*([a-z_]+)\s*=\s*(.+?)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (key === "name") out.name = val;
    else if (key === "source_code_url") out.sourceCodeUrl = val;
    else if (key === "min_api") out.minApi = Number(val);
  }
  return out;
}

export function disposeBundle(bundle: XdcBundle): void {
  if (bundle.iconUrl) URL.revokeObjectURL(bundle.iconUrl);
}
