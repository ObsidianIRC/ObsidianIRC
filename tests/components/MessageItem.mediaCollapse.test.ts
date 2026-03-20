import { describe, expect, test } from "vitest";
import { partitionMediaEntries } from "../../src/components/message/MessageItem";
import type { MediaEntry } from "../../src/lib/mediaUtils";

describe("partitionMediaEntries", () => {
  test("first URL has no preview, second is image — image shown directly, nothing collapsed", () => {
    // Regression: this was incorrectly collapsed behind "Show 1 more item"
    const entries: MediaEntry[] = [
      { url: "https://example.com/page", type: null },
      { url: "https://example.com/photo.jpg", type: "image" },
    ];
    const { firstKnownNotAtZero, extraKnownEntries } =
      partitionMediaEntries(entries);
    expect(firstKnownNotAtZero?.url).toBe("https://example.com/photo.jpg");
    expect(extraKnownEntries).toHaveLength(0);
  });

  test("both are images — index 0 already shown, second collapsed", () => {
    const entries: MediaEntry[] = [
      { url: "https://example.com/a.jpg", type: "image" },
      { url: "https://example.com/b.jpg", type: "image" },
    ];
    const { firstKnownNotAtZero, extraKnownEntries } =
      partitionMediaEntries(entries);
    expect(firstKnownNotAtZero).toBeNull();
    expect(extraKnownEntries).toHaveLength(1);
    expect(extraKnownEntries[0].url).toBe("https://example.com/b.jpg");
  });

  test("null, null, image — image shown directly, one extra null shown inline", () => {
    const entries: MediaEntry[] = [
      { url: "https://example.com/a", type: null },
      { url: "https://example.com/b", type: null },
      { url: "https://example.com/c.jpg", type: "image" },
    ];
    const { extraNullEntries, firstKnownNotAtZero, extraKnownEntries } =
      partitionMediaEntries(entries);
    expect(extraNullEntries).toHaveLength(1);
    expect(extraNullEntries[0].url).toBe("https://example.com/b");
    expect(firstKnownNotAtZero?.url).toBe("https://example.com/c.jpg");
    expect(extraKnownEntries).toHaveLength(0);
  });

  test("null, image, video — image shown directly, video collapsed", () => {
    const entries: MediaEntry[] = [
      { url: "https://example.com/page", type: null },
      { url: "https://example.com/photo.jpg", type: "image" },
      { url: "https://example.com/clip.mp4", type: "video" },
    ];
    const { firstKnownNotAtZero, extraKnownEntries } =
      partitionMediaEntries(entries);
    expect(firstKnownNotAtZero?.url).toBe("https://example.com/photo.jpg");
    expect(extraKnownEntries).toHaveLength(1);
    expect(extraKnownEntries[0].url).toBe("https://example.com/clip.mp4");
  });

  test("single image — no extra entries", () => {
    const entries: MediaEntry[] = [
      { url: "https://example.com/a.jpg", type: "image" },
    ];
    const { firstKnownNotAtZero, extraKnownEntries, extraNullEntries } =
      partitionMediaEntries(entries);
    expect(firstKnownNotAtZero).toBeNull();
    expect(extraKnownEntries).toHaveLength(0);
    expect(extraNullEntries).toHaveLength(0);
  });

  test("single null entry — no extras anywhere", () => {
    const entries: MediaEntry[] = [
      { url: "https://example.com/page", type: null },
    ];
    const { firstKnownNotAtZero, extraKnownEntries, extraNullEntries } =
      partitionMediaEntries(entries);
    expect(firstKnownNotAtZero).toBeNull();
    expect(extraKnownEntries).toHaveLength(0);
    expect(extraNullEntries).toHaveLength(0);
  });
});
