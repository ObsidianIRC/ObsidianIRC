import { platform } from "@tauri-apps/plugin-os";
import { useEffect } from "react";

// Hook to handle keyboard visibility and viewport resizing on mobile platforms
export const useKeyboardResize = () => {
  useEffect(() => {
    // Only apply this for mobile platforms
    if (!("__TAURI__" in window) || !["android", "ios"].includes(platform())) {
      return;
    }

    let isKeyboardVisible = false;
    let initialViewportHeight = window.visualViewport?.height || window.innerHeight;

    const handleVisualViewportChange = () => {
      if (!window.visualViewport) return;

      const currentHeight = window.visualViewport.height;
      const heightDifference = initialViewportHeight - currentHeight;
      
      // Keyboard is considered visible if the viewport height decreased significantly
      const keyboardWasVisible = isKeyboardVisible;
      isKeyboardVisible = heightDifference > 150; // Adjust threshold as needed

      // Force a resize event when keyboard state changes
      if (keyboardWasVisible !== isKeyboardVisible) {
        updateKeyboardState(isKeyboardVisible, heightDifference);
      }
    };

    const updateKeyboardState = (visible: boolean, heightDiff: number) => {
      // Update CSS custom property for keyboard height
      document.documentElement.style.setProperty(
        '--keyboard-height', 
        visible ? `${heightDiff}px` : '0px'
      );

      // Trigger a resize event to force layout recalculation
      window.dispatchEvent(new Event('resize'));
      
      // Small delay to ensure DOM updates are processed
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    };

    const handleAndroidKeyboardShow = () => {
      if (!isKeyboardVisible) {
        isKeyboardVisible = true;
        const heightDiff = initialViewportHeight - (window.visualViewport?.height || window.innerHeight);
        updateKeyboardState(true, heightDiff);
      }
    };

    const handleAndroidKeyboardHide = () => {
      if (isKeyboardVisible) {
        isKeyboardVisible = false;
        updateKeyboardState(false, 0);
      }
    };

    const handleWindowResize = () => {
      // Update initial height when window is resized
      if (window.visualViewport) {
        if (!isKeyboardVisible) {
          initialViewportHeight = window.visualViewport.height;
        }
      } else {
        initialViewportHeight = window.innerHeight;
      }
    };

    // Use visualViewport API if available (modern browsers)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange);
      window.visualViewport.addEventListener('scroll', handleVisualViewportChange);
    }

    // Listen for native Android keyboard events
    window.addEventListener('keyboardDidShow', handleAndroidKeyboardShow);
    window.addEventListener('keyboardDidHide', handleAndroidKeyboardHide);

    // Fallback for older browsers or additional handling
    window.addEventListener('resize', handleWindowResize);

    // Cleanup
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
        window.visualViewport.removeEventListener('scroll', handleVisualViewportChange);
      }
      window.removeEventListener('keyboardDidShow', handleAndroidKeyboardShow);
      window.removeEventListener('keyboardDidHide', handleAndroidKeyboardHide);
      window.removeEventListener('resize', handleWindowResize);
      
      // Reset CSS property
      document.documentElement.style.removeProperty('--keyboard-height');
    };
  }, []);
};