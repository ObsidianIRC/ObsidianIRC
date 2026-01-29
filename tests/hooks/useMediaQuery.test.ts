import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "../../src/hooks/useMediaQuery";

describe("useMediaQuery", () => {
  let matchMediaMock: {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    matchMediaMock = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    window.matchMedia = vi.fn(
      () => matchMediaMock as unknown as MediaQueryList,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with current media query value", () => {
    matchMediaMock.matches = true;
    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));

    expect(result.current).toBe(true);
  });

  it("should update when media query changes", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));

    expect(result.current).toBe(false);

    const listener = matchMediaMock.addEventListener.mock.calls[0][1];

    act(() => {
      listener({ matches: true } as MediaQueryListEvent);
    });

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(result.current).toBe(true);
    vi.useRealTimers();
  });

  it("should debounce rapid media query changes", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useMediaQuery("(max-width: 768px)", 100),
    );

    const listener = matchMediaMock.addEventListener.mock.calls[0][1];

    act(() => {
      listener({ matches: true } as MediaQueryListEvent);
      listener({ matches: false } as MediaQueryListEvent);
      listener({ matches: true } as MediaQueryListEvent);
    });

    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe(true);
    vi.useRealTimers();
  });

  it("should cleanup timeout on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() =>
      useMediaQuery("(max-width: 768px)", 100),
    );

    const listener = matchMediaMock.addEventListener.mock.calls[0][1];

    act(() => {
      listener({ matches: true } as MediaQueryListEvent);
    });

    unmount();

    expect(matchMediaMock.removeEventListener).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("should use custom debounce time", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useMediaQuery("(max-width: 768px)", 200),
    );

    const listener = matchMediaMock.addEventListener.mock.calls[0][1];

    act(() => {
      listener({ matches: true } as MediaQueryListEvent);
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe(true);
    vi.useRealTimers();
  });

  it("should handle multiple query parameter", () => {
    const { result, rerender } = renderHook(
      ({ query }) => useMediaQuery(query),
      { initialProps: { query: "(max-width: 768px)" } },
    );

    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 768px)");

    rerender({ query: "(max-width: 1080px)" });

    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 1080px)");
  });
});
