declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

export const isTauri = () =>
  typeof window !== "undefined" && window.__TAURI__ !== undefined;
