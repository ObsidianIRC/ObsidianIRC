declare global {
  interface Window {
    __TAURI__?: unknown;
    androidBackCallback?: () => void;
  }
}

export const isTauri = (): boolean => {
  return typeof window !== "undefined" && window.__TAURI__ !== undefined;
};

/** True only on Tauri mobile builds (iOS, Android). False on browser and desktop. */
export const isTauriMobile = (): boolean =>
  isTauri() && /android|iphone|ipad|ipod/i.test(navigator.userAgent);

/** True only on Tauri iOS builds. False on Android, desktop, and browser. */
export const isTauriIOS = (): boolean =>
  isTauri() && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** True only on Tauri Android builds. False on iOS, desktop, and browser. */
export const isTauriAndroid = (): boolean =>
  isTauri() && /android/i.test(navigator.userAgent);

/** True only on Tauri desktop builds (macOS, Windows, Linux). False on browser, iOS, Android. */
export const isTauriDesktop = (): boolean => {
  if (!isTauri()) return false;
  // platform() is async in Tauri v2; use navigator.userAgent as a reliable synchronous proxy.
  // Mobile Tauri targets inject Android/iOS patterns; desktop targets do not.
  return !/android|iphone|ipad|ipod/i.test(navigator.userAgent);
};
