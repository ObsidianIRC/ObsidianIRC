import { useCallback, useEffect, useRef } from "react";

export type ShortcutHandler = (event: KeyboardEvent) => boolean | undefined;

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  preventDefault?: boolean;
  handler: ShortcutHandler;
  description?: string;
}

export interface KeyboardShortcutsConfig {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  targetElement?: HTMLElement | null;
}

export function useKeyboardShortcuts(
  config: KeyboardShortcutsConfig,
  options: UseKeyboardShortcutsOptions = {},
) {
  const { enabled = true, targetElement } = options;
  const configRef = useRef(config);

  // Update config ref when config changes
  configRef.current = config;

  const handleKeyDown = useCallback(
    (event: Event) => {
      // Only handle keyboard events
      if (!(event instanceof KeyboardEvent)) return;

      const currentConfig = configRef.current;

      if (!enabled || !currentConfig.enabled) {
        return;
      }

      for (const shortcut of currentConfig.shortcuts) {
        const keyMatches =
          shortcut.key.toLowerCase() === event.key.toLowerCase();
        const ctrlMatches = (shortcut.ctrlKey ?? false) === event.ctrlKey;
        const altMatches = (shortcut.altKey ?? false) === event.altKey;
        const shiftMatches = (shortcut.shiftKey ?? false) === event.shiftKey;
        const metaMatches = (shortcut.metaKey ?? false) === event.metaKey;

        if (
          keyMatches &&
          ctrlMatches &&
          altMatches &&
          shiftMatches &&
          metaMatches
        ) {
          // Prevent default if specified
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }

          // Call handler and check if it wants to stop propagation
          const result = shortcut.handler(event);
          if (result === false) {
            event.stopPropagation();
          }

          // Exit after first match
          break;
        }
      }
    },
    [enabled],
  );

  useEffect(() => {
    const element = targetElement || document;

    if (enabled && config.enabled !== false) {
      element.addEventListener("keydown", handleKeyDown);

      return () => {
        element.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [handleKeyDown, enabled, config.enabled, targetElement]);

  return {
    isEnabled: enabled && config.enabled !== false,
  };
}

export const createChatShortcuts = (handlers: {
  onTabCompletion?: ShortcutHandler;
}): KeyboardShortcut[] => {
  const shortcuts: KeyboardShortcut[] = [];

  if (handlers.onTabCompletion) {
    shortcuts.push({
      key: "Tab",
      handler: handlers.onTabCompletion,
      description: "Tab completion for nicknames",
    });
  }

  return shortcuts;
};
