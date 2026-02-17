import { platform } from "@tauri-apps/plugin-os";
import { useEffect } from "react";
import { isTauri } from "../lib/platformUtils";

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

    if (isTauri()) {
      try {
        const currentPlatform = platform();
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

    const handleVisualViewportChange = () => {
      if (!window.visualViewport) return;

      const currentHeight = window.visualViewport.height;
      const heightDifference = baseHeight - currentHeight;
      const wasVisible = isKeyboardVisible;
      const nowVisible = heightDifference > 150;

      if (nowVisible) {
        // Keyboard open: set root to exact visible height
        root.style.height = `${currentHeight}px`;
        // Prevent iOS Safari from scrolling the page behind the keyboard
        window.scrollTo(0, 0);
      } else if (wasVisible && !nowVisible) {
        // Keyboard just closed: reset to CSS default
        root.style.height = "";
        window.scrollTo(0, 0);
      }

      if (wasVisible !== nowVisible) {
        setKeyboardVisible(nowVisible);
        window.dispatchEvent(new Event("resize"));
      }
    };

    const handleAndroidKeyboardShow = () => {
      if (!isKeyboardVisible) {
        setKeyboardVisible(true);
        if (window.visualViewport) {
          root.style.height = `${window.visualViewport.height}px`;
        }
        window.dispatchEvent(new Event("resize"));
      }
    };

    const handleAndroidKeyboardHide = () => {
      if (isKeyboardVisible) {
        setKeyboardVisible(false);
        root.style.height = "";
        window.scrollTo(0, 0);
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
      window.removeEventListener("keyboardDidShow", handleAndroidKeyboardShow);
      window.removeEventListener("keyboardDidHide", handleAndroidKeyboardHide);
      window.removeEventListener("resize", handleWindowResize);

      root.style.height = "";
      delete document.documentElement.dataset.keyboardVisible;
    };
  }, []);
};
