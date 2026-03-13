import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import { useEffect } from "react";
import { isTauri } from "../lib/platformUtils";

interface IosKeyboardPayload {
  eventType: "will-show" | "did-show" | "will-hide" | "did-hide";
  keyboardHeight: number;
  animationDuration: number;
}

// Hook to handle keyboard visibility and viewport resizing on mobile platforms
export const useKeyboardResize = () => {
  useEffect(() => {
    const isMobile =
      /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      ) || window.innerWidth <= 768;

    if (!isMobile) {
      return;
    }

    let currentPlatform: string | undefined;
    if (isTauri()) {
      try {
        currentPlatform = platform();
        if (!["android", "ios"].includes(currentPlatform)) {
          return;
        }
      } catch {
        // If platform() fails, continue anyway on mobile devices
      }
    }

    const root = document.getElementById("root");
    if (!root) return;

    let isKeyboardVisible = false;
    let baseHeight = window.visualViewport?.height ?? window.innerHeight;

    const setKeyboardVisible = (visible: boolean) => {
      isKeyboardVisible = visible;
      if (visible) {
        document.documentElement.dataset.keyboardVisible = "true";
      } else {
        delete document.documentElement.dataset.keyboardVisible;
      }
    };

    // Eagerly set data-keyboard-visible on focus so CSS adjusts immediately.
    // These handlers only touch the CSS attribute — never isKeyboardVisible,
    // so the root.style.height logic is unaffected.
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        document.documentElement.dataset.keyboardVisible = "true";
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      const isMovingToInput =
        related &&
        (related.tagName === "INPUT" ||
          related.tagName === "TEXTAREA" ||
          related.isContentEditable);
      // Only eagerly remove if the keyboard is confirmed gone.
      // Otherwise the keyboard handler will remove it when keyboard actually closes.
      if (!isMovingToInput && !isKeyboardVisible) {
        delete document.documentElement.dataset.keyboardVisible;
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    // iOS: visualViewport.resize never fires with viewport-fit=cover in WKWebView.
    // Use UIKeyboardWillShow/Hide notifications via tauri-plugin-ios-keyboard instead.
    if (isTauri() && currentPlatform === "ios") {
      let cleanupIos: (() => void) | undefined;

      (async () => {
        const unlisten = await listen<IosKeyboardPayload>(
          "plugin:keyboard::ios-keyboard-event",
          ({ payload }) => {
            if (payload.eventType === "will-show") {
              // Use position:fixed anchored to the viewport bottom instead of
              // computing window.innerHeight - keyboardHeight. This bypasses
              // any window.innerHeight inaccuracies in WKWebView and is immune
              // to the content-scroll that WKWebView sometimes applies when an
              // input is focused (scroll can't move a fixed element).
              root.style.position = "fixed";
              root.style.top = "0";
              root.style.left = "0";
              root.style.right = "0";
              root.style.bottom = `${payload.keyboardHeight}px`;
              root.style.overflow = "hidden";
              document.documentElement.style.setProperty(
                "--keyboard-height",
                `${payload.keyboardHeight}px`,
              );
              // When keyboard is visible env(safe-area-inset-bottom) should be
              // 0 (the keyboard covers the home indicator area). WKWebView does
              // not always update the env() value, so force it here to remove
              // the bottom padding that would otherwise create a darker strip.
              document.documentElement.style.setProperty(
                "--safe-area-inset-bottom",
                "0px",
              );
              window.scrollTo(0, 0);
              setKeyboardVisible(true);
              window.dispatchEvent(new Event("resize"));
            } else if (payload.eventType === "will-hide") {
              root.style.position = "";
              root.style.top = "";
              root.style.left = "";
              root.style.right = "";
              root.style.bottom = "";
              root.style.overflow = "";
              document.documentElement.style.removeProperty(
                "--keyboard-height",
              );
              document.documentElement.style.removeProperty(
                "--safe-area-inset-bottom",
              );
              window.scrollTo(0, 0);
              setKeyboardVisible(false);
              window.dispatchEvent(new Event("resize"));
            }
          },
        );
        cleanupIos = unlisten;
      })();

      return () => {
        cleanupIos?.();
        root.style.position = "";
        root.style.top = "";
        root.style.left = "";
        root.style.right = "";
        root.style.bottom = "";
        root.style.overflow = "";
        document.documentElement.style.removeProperty("--keyboard-height");
        document.documentElement.style.removeProperty(
          "--safe-area-inset-bottom",
        );
        document.removeEventListener("focusin", handleFocusIn);
        document.removeEventListener("focusout", handleFocusOut);
        delete document.documentElement.dataset.keyboardVisible;
      };
    }

    // Android + web/browser: use visualViewport for height detection.
    // Android pans the visual viewport instead of resizing the layout viewport,
    // so position:fixed (anchored to the visual viewport) is used — same as iOS.
    const applyKeyboardOpen = () => {
      root.style.position = "fixed";
      root.style.top = "0";
      root.style.left = "0";
      root.style.right = "0";
      root.style.bottom = "0";
      root.style.overflow = "hidden";
      document.documentElement.style.overscrollBehavior = "none";
    };

    const applyKeyboardClosed = () => {
      root.style.position = "";
      root.style.top = "";
      root.style.left = "";
      root.style.right = "";
      root.style.bottom = "";
      root.style.overflow = "";
      document.documentElement.style.overscrollBehavior = "";
      window.scrollTo(0, 0);
    };

    const handleVisualViewportChange = () => {
      if (!window.visualViewport) return;

      const currentHeight = window.visualViewport.height;
      const heightDifference = baseHeight - currentHeight;
      const wasVisible = isKeyboardVisible;
      const nowVisible = heightDifference > 150;

      if (nowVisible) {
        applyKeyboardOpen();
      } else if (wasVisible && !nowVisible) {
        applyKeyboardClosed();
      }

      if (wasVisible !== nowVisible) {
        setKeyboardVisible(nowVisible);
        window.dispatchEvent(new Event("resize"));
      }
    };

    const handleAndroidKeyboardShow = () => {
      if (!isKeyboardVisible) {
        setKeyboardVisible(true);
        applyKeyboardOpen();
        window.dispatchEvent(new Event("resize"));
      }
    };

    const handleAndroidKeyboardHide = () => {
      if (isKeyboardVisible) {
        setKeyboardVisible(false);
        applyKeyboardClosed();
        window.dispatchEvent(new Event("resize"));
      }
    };

    const handleWindowResize = () => {
      // Update base height when window resizes (e.g. browser chrome hides)
      // but only when keyboard is not visible
      if (!isKeyboardVisible) {
        baseHeight = window.visualViewport?.height ?? window.innerHeight;
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener(
        "resize",
        handleVisualViewportChange,
      );
      window.visualViewport.addEventListener(
        "scroll",
        handleVisualViewportChange,
      );
    }

    window.addEventListener("keyboardDidShow", handleAndroidKeyboardShow);
    window.addEventListener("keyboardDidHide", handleAndroidKeyboardHide);
    window.addEventListener("resize", handleWindowResize);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener(
          "resize",
          handleVisualViewportChange,
        );
        window.visualViewport.removeEventListener(
          "scroll",
          handleVisualViewportChange,
        );
      }
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("keyboardDidShow", handleAndroidKeyboardShow);
      window.removeEventListener("keyboardDidHide", handleAndroidKeyboardHide);
      window.removeEventListener("resize", handleWindowResize);

      applyKeyboardClosed();
      delete document.documentElement.dataset.keyboardVisible;
    };
  }, []);
};
