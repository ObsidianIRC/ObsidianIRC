import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NARROW_VIEW_QUERY = "(max-width: 768px)";

describe("Store Initialization", () => {
  let originalWindow: typeof globalThis.window;

  beforeEach(() => {
    originalWindow = global.window;
    vi.resetModules();
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  it("should initialize isNarrowView as false on desktop", async () => {
    const mockMatchMedia = vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })) as unknown as typeof window.matchMedia;

    Object.defineProperty(global, "window", {
      value: { matchMedia: mockMatchMedia },
      writable: true,
      configurable: true,
    });

    const { default: useStore } = await import("../../src/store");
    const state = useStore.getState();

    expect(state.ui.isNarrowView).toBe(false);
  });

  it("should initialize isNarrowView as true on mobile", async () => {
    const mockMatchMedia = vi.fn((query: string) => ({
      matches: query === NARROW_VIEW_QUERY,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })) as unknown as typeof window.matchMedia;

    Object.defineProperty(global, "window", {
      value: { matchMedia: mockMatchMedia },
      writable: true,
      configurable: true,
    });

    const { default: useStore } = await import("../../src/store");
    const state = useStore.getState();

    expect(state.ui.isNarrowView).toBe(true);
  });

  it("should default to false when window is undefined (SSR)", async () => {
    Object.defineProperty(global, "window", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { default: useStore } = await import("../../src/store");
    const state = useStore.getState();

    expect(state.ui.isNarrowView).toBe(false);
  });
});
