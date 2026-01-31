import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";

/**
 * Detects if running in Tauri native environment
 */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as { __TAURI__?: unknown }).__TAURI__ !== undefined
  );
}

/**
 * Opens URL in system browser (native) or new tab (web)
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    await tauriOpenUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
