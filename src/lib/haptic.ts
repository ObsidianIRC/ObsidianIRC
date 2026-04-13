import type { ImpactFeedbackStyle } from "@tauri-apps/plugin-haptics";
import { impactFeedback } from "@tauri-apps/plugin-haptics";
import { isTauriMobile } from "./platformUtils";

// On Tauri mobile (iOS/Android) use native haptics (UIImpactFeedbackGenerator / Vibrator).
// Everywhere else fall back to the Web Vibration API, which works on Android Chrome/WebView
// but is a no-op on iOS Safari and desktop.
export function haptic(style: ImpactFeedbackStyle = "light") {
  if (isTauriMobile()) {
    impactFeedback(style).catch(() => {});
  } else {
    const ms = style === "heavy" ? 80 : style === "medium" ? 50 : 30;
    navigator.vibrate?.(ms);
  }
}
