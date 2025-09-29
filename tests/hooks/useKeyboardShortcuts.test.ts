import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyboardShortcutsConfig } from "../../src/hooks/useKeyboardShortcuts";
import {
  createChatShortcuts,
  useKeyboardShortcuts,
} from "../../src/hooks/useKeyboardShortcuts";

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    document.removeEventListener = vi.fn();
    document.addEventListener = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with enabled state", () => {
    const config: KeyboardShortcutsConfig = {
      shortcuts: [],
      enabled: true,
    };

    const { result } = renderHook(() => useKeyboardShortcuts(config));
    expect(result.current.isEnabled).toBe(true);
  });

  it("should respect disabled state", () => {
    const config: KeyboardShortcutsConfig = {
      shortcuts: [],
      enabled: false,
    };

    const { result } = renderHook(() => useKeyboardShortcuts(config));
    expect(result.current.isEnabled).toBe(false);
  });

  it("should add event listener when enabled", () => {
    const config: KeyboardShortcutsConfig = {
      shortcuts: [],
      enabled: true,
    };

    renderHook(() => useKeyboardShortcuts(config));

    expect(document.addEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
  });

  it("should not add event listener when disabled", () => {
    const config: KeyboardShortcutsConfig = {
      shortcuts: [],
      enabled: false,
    };

    renderHook(() => useKeyboardShortcuts(config));

    expect(document.addEventListener).not.toHaveBeenCalled();
  });

  it("should call handler for matching shortcut", () => {
    const handler = vi.fn();
    const config: KeyboardShortcutsConfig = {
      shortcuts: [
        {
          key: "Tab",
          handler,
          description: "Test tab handler",
        },
      ],
      enabled: true,
    };

    renderHook(() => useKeyboardShortcuts(config));

    const addEventListenerCall = vi.mocked(document.addEventListener).mock
      .calls[0];
    const eventListener = addEventListenerCall[1] as (event: Event) => void;

    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    Object.defineProperty(tabEvent, "preventDefault", {
      value: vi.fn(),
      writable: true,
    });

    eventListener(tabEvent);

    expect(handler).toHaveBeenCalledWith(tabEvent);
    expect(tabEvent.preventDefault).toHaveBeenCalled();
  });

  it("should handle modifier keys correctly", () => {
    const handler = vi.fn();
    const config: KeyboardShortcutsConfig = {
      shortcuts: [
        {
          key: "k",
          ctrlKey: true,
          handler,
          description: "Ctrl+K shortcut",
        },
      ],
      enabled: true,
    };

    renderHook(() => useKeyboardShortcuts(config));

    const addEventListenerCall = vi.mocked(document.addEventListener).mock
      .calls[0];
    const eventListener = addEventListenerCall[1] as (event: Event) => void;

    const ctrlKEvent = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    Object.defineProperty(ctrlKEvent, "preventDefault", {
      value: vi.fn(),
      writable: true,
    });

    eventListener(ctrlKEvent);

    expect(handler).toHaveBeenCalledWith(ctrlKEvent);

    handler.mockClear();
    const kEvent = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    eventListener(kEvent);

    expect(handler).not.toHaveBeenCalled();
  });

  it("should not prevent default when specified", () => {
    const handler = vi.fn();
    const config: KeyboardShortcutsConfig = {
      shortcuts: [
        {
          key: "Escape",
          handler,
          preventDefault: false,
          description: "Escape handler",
        },
      ],
      enabled: true,
    };

    renderHook(() => useKeyboardShortcuts(config));

    const addEventListenerCall = vi.mocked(document.addEventListener).mock
      .calls[0];
    const eventListener = addEventListenerCall[1] as (event: Event) => void;

    const escapeEvent = new KeyboardEvent("keydown", {
      key: "Escape",
    });

    Object.defineProperty(escapeEvent, "preventDefault", {
      value: vi.fn(),
      writable: true,
    });

    eventListener(escapeEvent);

    expect(handler).toHaveBeenCalledWith(escapeEvent);
    expect(escapeEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("should stop propagation when handler returns false", () => {
    const handler = vi.fn().mockReturnValue(false);
    const config: KeyboardShortcutsConfig = {
      shortcuts: [
        {
          key: "Tab",
          handler,
          description: "Tab handler that stops propagation",
        },
      ],
      enabled: true,
    };

    renderHook(() => useKeyboardShortcuts(config));

    const addEventListenerCall = vi.mocked(document.addEventListener).mock
      .calls[0];
    const eventListener = addEventListenerCall[1] as (event: Event) => void;

    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
    });

    Object.defineProperty(tabEvent, "preventDefault", {
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(tabEvent, "stopPropagation", {
      value: vi.fn(),
      writable: true,
    });

    eventListener(tabEvent);

    expect(handler).toHaveBeenCalledWith(tabEvent);
    expect(tabEvent.stopPropagation).toHaveBeenCalled();
  });

  it("should ignore non-keyboard events", () => {
    const handler = vi.fn();
    const config: KeyboardShortcutsConfig = {
      shortcuts: [
        {
          key: "Tab",
          handler,
          description: "Tab handler",
        },
      ],
      enabled: true,
    };

    renderHook(() => useKeyboardShortcuts(config));

    const addEventListenerCall = vi.mocked(document.addEventListener).mock
      .calls[0];
    const eventListener = addEventListenerCall[1] as (event: Event) => void;

    const clickEvent = new MouseEvent("click");
    eventListener(clickEvent);

    expect(handler).not.toHaveBeenCalled();
  });

  it("should handle case insensitive key matching", () => {
    const handler = vi.fn();
    const config: KeyboardShortcutsConfig = {
      shortcuts: [
        {
          key: "K",
          ctrlKey: true,
          handler,
          description: "Ctrl+K shortcut",
        },
      ],
      enabled: true,
    };

    renderHook(() => useKeyboardShortcuts(config));

    const addEventListenerCall = vi.mocked(document.addEventListener).mock
      .calls[0];
    const eventListener = addEventListenerCall[1] as (event: Event) => void;

    const ctrlKEvent = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
    });

    Object.defineProperty(ctrlKEvent, "preventDefault", {
      value: vi.fn(),
      writable: true,
    });

    eventListener(ctrlKEvent);

    expect(handler).toHaveBeenCalledWith(ctrlKEvent);
  });
});

describe("createChatShortcuts", () => {
  it("should create tab completion shortcut when handler provided", () => {
    const handlers = {
      onTabCompletion: vi.fn(),
    };

    const shortcuts = createChatShortcuts(handlers);

    expect(shortcuts).toHaveLength(1);
    const tabShortcut = shortcuts.find((s) => s.key === "Tab");
    expect(tabShortcut).toBeDefined();
    expect(tabShortcut?.handler).toBe(handlers.onTabCompletion);
    expect(tabShortcut?.description).toBe("Tab completion for nicknames");
  });

  it("should create empty array when no handlers provided", () => {
    const shortcuts = createChatShortcuts({});
    expect(shortcuts).toHaveLength(0);
  });
});
