import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "./platformUtils";

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
