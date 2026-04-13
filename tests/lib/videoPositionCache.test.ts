import { beforeEach, describe, expect, test } from "vitest";
import {
  clearVideoPosition,
  getVideoPosition,
  setVideoPosition,
} from "../../src/lib/videoPositionCache";

beforeEach(() => {
  // Clear any state from previous tests
  clearVideoPosition("https://example.com/video.mp4");
  clearVideoPosition("https://example.com/other.mp4");
});

describe("videoPositionCache", () => {
  test("getVideoPosition returns undefined when nothing cached", () => {
    expect(getVideoPosition("https://example.com/video.mp4")).toBeUndefined();
  });

  test("setVideoPosition + getVideoPosition returns the stored time", () => {
    setVideoPosition("https://example.com/video.mp4", 42.5);
    expect(getVideoPosition("https://example.com/video.mp4")).toBe(42.5);
  });

  test("getVideoPosition is one-shot — second call returns undefined", () => {
    setVideoPosition("https://example.com/video.mp4", 10);
    getVideoPosition("https://example.com/video.mp4");
    expect(getVideoPosition("https://example.com/video.mp4")).toBeUndefined();
  });

  test("clearVideoPosition removes cached value", () => {
    setVideoPosition("https://example.com/video.mp4", 99);
    clearVideoPosition("https://example.com/video.mp4");
    expect(getVideoPosition("https://example.com/video.mp4")).toBeUndefined();
  });

  test("different URLs are stored independently", () => {
    setVideoPosition("https://example.com/video.mp4", 5);
    setVideoPosition("https://example.com/other.mp4", 15);
    expect(getVideoPosition("https://example.com/other.mp4")).toBe(15);
    expect(getVideoPosition("https://example.com/video.mp4")).toBe(5);
  });

  test("setVideoPosition overwrites a previous value for the same URL", () => {
    setVideoPosition("https://example.com/video.mp4", 10);
    setVideoPosition("https://example.com/video.mp4", 20);
    expect(getVideoPosition("https://example.com/video.mp4")).toBe(20);
  });
});
