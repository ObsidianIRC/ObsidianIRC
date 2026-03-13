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
  // platform() is async in Tauri v2; use navigator.userAgent as a reliable synchronous proxy.
  // Mobile Tauri targets inject Android/iOS patterns; desktop targets do not.
  return !/android|iphone|ipad|ipod/i.test(navigator.userAgent);
};
