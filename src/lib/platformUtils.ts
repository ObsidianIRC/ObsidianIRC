import { platform } from "@tauri-apps/plugin-os";

declare global {
  interface Window {
    __TAURI__?: unknown;
    androidBackCallback?: () => void;
  }
}

export const isTauri = (): boolean => {
  return typeof window !== "undefined" && window.__TAURI__ !== undefined;
};

/** True only on Tauri desktop builds (macOS, Windows, Linux). False on browser, iOS, Android. */
export const isTauriDesktop = (): boolean => {
  if (!isTauri()) return false;
  try {
    const p = platform();
    return p !== "android" && p !== "ios";
  } catch {
    return false;
  }
};
