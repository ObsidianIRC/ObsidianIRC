import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isScrolledToBottom,
  useScrollToBottom,
} from "../../src/hooks/useScrollToBottom";

describe("isScrolledToBottom", () => {
  it("should return true when at the bottom", () => {
    const container = {
      scrollHeight: 1000,
      scrollTop: 970,
      clientHeight: 500,
    } as HTMLElement;

    expect(isScrolledToBottom(container, 30)).toBe(true);
  });

  it("should return false when scrolled up", () => {
    const container = {
      scrollHeight: 1000,
      scrollTop: 0,
      clientHeight: 500,
    } as HTMLElement;

    expect(isScrolledToBottom(container, 30)).toBe(false);
  });

  it("should respect custom tolerance", () => {
    const container = {
      scrollHeight: 1000,
      scrollTop: 460,
      clientHeight: 500,
    } as HTMLElement;

    expect(isScrolledToBottom(container, 50)).toBe(true);
    expect(isScrolledToBottom(container, 30)).toBe(false);
  });

  it("should handle edge case where scrollTop is exactly at bottom", () => {
    const container = {
      scrollHeight: 1000,
      scrollTop: 500,
      clientHeight: 500,
    } as HTMLElement;

    expect(isScrolledToBottom(container, 30)).toBe(true);
  });
});

describe("useScrollToBottom", () => {
  let mockContainer: HTMLElement;
  let mockEndElement: HTMLElement;
  let observerCallbacks: IntersectionObserverCallback[] = [];
  let observedElements: Element[] = [];
  let resizeObserverCallbacks: ResizeObserverCallback[] = [];
  let resizeObservedElements: Element[] = [];
  let resizeDisconnectSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    observerCallbacks = [];
    observedElements = [];
    resizeObserverCallbacks = [];
    resizeObservedElements = [];
    resizeDisconnectSpy = vi.fn();

    mockContainer = {
      scrollHeight: 1000,
      scrollTop: 0,
      clientHeight: 500,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;

    mockEndElement = {} as unknown as HTMLElement;

    global.IntersectionObserver = vi.fn().mockImplementation((callback) => {
      observerCallbacks.push(callback);
      return {
        observe: vi.fn((element) => observedElements.push(element)),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
        takeRecords: vi.fn(),
        root: null,
        rootMargin: "",
        thresholds: [],
      };
    });

    global.ResizeObserver = vi.fn().mockImplementation((callback) => {
      resizeObserverCallbacks.push(callback);
      return {
        observe: vi.fn((element) => resizeObservedElements.push(element)),
        disconnect: resizeDisconnectSpy,
        unobserve: vi.fn(),
      };
    });

    global.requestAnimationFrame = vi.fn((cb) => {
      setTimeout(cb, 0);
      return 0;
    });

    global.cancelAnimationFrame = vi.fn();
  });

  it("should initialize with isScrolledUp as false", () => {
    const { result } = renderHook(() => {
      const containerRef = useRef(mockContainer);
      const endElementRef = useRef(mockEndElement);
      return useScrollToBottom(containerRef, endElementRef);
    });

    expect(result.current.isScrolledUp).toBe(false);
  });

  it("should provide scrollToBottom function that sets scrollTop", () => {
    const { result } = renderHook(() => {
      const containerRef = useRef(mockContainer);
      const endElementRef = useRef(mockEndElement);
      return useScrollToBottom(containerRef, endElementRef);
    });

    expect(result.current.scrollToBottom).toBeInstanceOf(Function);

    result.current.scrollToBottom();
    expect(mockContainer.scrollTop).toBe(mockContainer.scrollHeight);
  });

  it("should set up IntersectionObserver", () => {
    renderHook(() => {
      const containerRef = useRef(mockContainer);
      const endElementRef = useRef(mockEndElement);
      return useScrollToBottom(containerRef, endElementRef);
    });

    expect(global.IntersectionObserver).toHaveBeenCalled();
    expect(observedElements).toContain(mockEndElement);
  });

  it("should add scroll and touchend event listeners", () => {
    renderHook(() => {
      const containerRef = useRef(mockContainer);
      const endElementRef = useRef(mockEndElement);
      return useScrollToBottom(containerRef, endElementRef);
    });

    expect(mockContainer.addEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      { passive: true },
    );
    expect(mockContainer.addEventListener).toHaveBeenCalledWith(
      "touchend",
      expect.any(Function),
      { passive: true },
    );
  });

  it("should update isScrolledUp when IntersectionObserver fires", () => {
    const { result } = renderHook(() => {
      const containerRef = useRef(mockContainer);
      const endElementRef = useRef(mockEndElement);
      return useScrollToBottom(containerRef, endElementRef);
    });

    const callback = observerCallbacks[0];

    act(() => {
      callback(
        [
          {
            isIntersecting: false,
            target: mockEndElement,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRatio: 0,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            time: 0,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    expect(result.current.isScrolledUp).toBe(true);
  });

  it("should clean up on unmount", () => {
    const intersectionDisconnectSpy = vi.fn();
    global.IntersectionObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      disconnect: intersectionDisconnectSpy,
      unobserve: vi.fn(),
      takeRecords: vi.fn(),
      root: null,
      rootMargin: "",
      thresholds: [],
    }));

    const { unmount } = renderHook(() => {
      const containerRef = useRef(mockContainer);
      const endElementRef = useRef(mockEndElement);
      return useScrollToBottom(containerRef, endElementRef);
    });

    unmount();

    expect(intersectionDisconnectSpy).toHaveBeenCalled();
    expect(resizeDisconnectSpy).toHaveBeenCalled();
    expect(mockContainer.removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    );
    expect(mockContainer.removeEventListener).toHaveBeenCalledWith(
      "touchend",
      expect.any(Function),
    );
  });

  it("should reinitialize when channelId changes", () => {
    const { rerender } = renderHook(
      ({ channelId }) => {
        const containerRef = useRef(mockContainer);
        const endElementRef = useRef(mockEndElement);
        return useScrollToBottom(containerRef, endElementRef, { channelId });
      },
      { initialProps: { channelId: "channel1" } },
    );

    const initialObserverCount = observerCallbacks.length;

    rerender({ channelId: "channel2" });

    expect(observerCallbacks.length).toBeGreaterThan(initialObserverCount);
  });

  it("should handle null refs gracefully", () => {
    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLElement>(null);
      const endElementRef = useRef<HTMLElement>(null);
      return useScrollToBottom(containerRef, endElementRef);
    });

    expect(result.current.isScrolledUp).toBe(false);
    expect(() => result.current.scrollToBottom()).not.toThrow();
  });

  it("should use custom tolerance", () => {
    renderHook(() => {
      const containerRef = useRef(mockContainer);
      const endElementRef = useRef(mockEndElement);
      return useScrollToBottom(containerRef, endElementRef, { tolerance: 50 });
    });

    expect(global.IntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        rootMargin: "50px",
      }),
    );
  });

  it("should set up ResizeObserver on the container", () => {
    renderHook(() => {
      const containerRef = useRef(mockContainer);
      const endElementRef = useRef(mockEndElement);
      return useScrollToBottom(containerRef, endElementRef);
    });

    expect(global.ResizeObserver).toHaveBeenCalled();
    expect(resizeObservedElements).toContain(mockContainer);
  });

  it("should scroll to bottom on resize when at bottom", () => {
    renderHook(() => {
      const containerRef = useRef(mockContainer);
      const endElementRef = useRef(mockEndElement);
      return useScrollToBottom(containerRef, endElementRef);
    });

    // Simulate being at bottom via IntersectionObserver
    act(() => {
      observerCallbacks[0](
        [
          {
            isIntersecting: true,
            target: mockEndElement,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRatio: 1,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            time: 0,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    mockContainer.scrollTop = 0;

    act(() => {
      resizeObserverCallbacks[0]([], {} as ResizeObserver);
    });

    expect(mockContainer.scrollTop).toBe(mockContainer.scrollHeight);
  });

  it("should not scroll on resize when user is scrolled up", () => {
    renderHook(() => {
      const containerRef = useRef(mockContainer);
      const endElementRef = useRef(mockEndElement);
      return useScrollToBottom(containerRef, endElementRef);
    });

    // Simulate being scrolled up via IntersectionObserver
    act(() => {
      observerCallbacks[0](
        [
          {
            isIntersecting: false,
            target: mockEndElement,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRatio: 0,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            time: 0,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    mockContainer.scrollTop = 200;

    act(() => {
      resizeObserverCallbacks[0]([], {} as ResizeObserver);
    });

    expect(mockContainer.scrollTop).toBe(200);
  });
});
