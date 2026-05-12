// Register the hosted-PWA service worker. Only the single-tenant hosted
// build (VITE_HIDE_SERVER_LIST=true) ships a manifest + SW; the multi-
// network build is a generic IRC client and doesn't claim a PWA identity.
//
// Registration is deferred to the "load" event so the SW download doesn't
// race the initial bundle parse.
export function registerHostedServiceWorker(): void {
  if (!__HIDE_SERVER_LIST__) return;
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        console.warn("[PWA] service worker registration failed:", err);
      });
  });
}
