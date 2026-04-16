import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { locale as tauriLocale } from "@tauri-apps/plugin-os";
import React from "react";
import ReactDOM from "react-dom/client";
import { pdfjs } from "react-pdf";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Failed to find root element");
}

const SUPPORTED = ["en", "es", "fr", "zh", "pt", "de", "it", "ro"];

function matchLocale(raw: string | null | undefined): string {
  if (!raw) return "en";
  const lang = raw.split("-")[0].toLowerCase();
  return SUPPORTED.includes(lang) ? lang : "en";
}

async function resolveLocale(): Promise<string> {
  // Dev override: localStorage.__dev_locale = "fr" in console to test any locale
  const devOverride = import.meta.env.DEV
    ? localStorage.getItem("__dev_locale")
    : null;
  if (devOverride && SUPPORTED.includes(devOverride)) return devOverride;

  // User explicit preference from the in-app language switcher
  const userPref = localStorage.getItem("locale");
  if (userPref && SUPPORTED.includes(userPref)) return userPref;

  // System locale via Tauri plugin (macOS, Windows, Linux, iOS, Android)
  // Throws or returns null when running as a plain web build
  try {
    const sys = await tauriLocale();
    if (sys) return matchLocale(sys);
  } catch {
    // web build — no Tauri runtime available
  }

  // Browser locale fallback (Docker / web build)
  return matchLocale(navigator.language);
}

async function loadCatalog(locale: string) {
  try {
    // lingui compile emits .mjs when package.json has "type":"module"
    const { messages } = await import(`./locales/${locale}/messages.mjs`);
    i18n.load(locale, messages);
    i18n.activate(locale);
  } catch {
    // Catalog not yet compiled for this locale — fall back to English
    if (locale !== "en") {
      const { messages } = await import("./locales/en/messages.mjs");
      i18n.load("en", messages);
      i18n.activate("en");
    }
  }
}

(async () => {
  const locale = await resolveLocale();
  await loadCatalog(locale);
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <I18nProvider i18n={i18n}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </I18nProvider>
    </React.StrictMode>,
  );
})();
