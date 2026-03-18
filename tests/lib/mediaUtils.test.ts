import { describe, expect, test } from "vitest";
import {
  canShowMedia,
  detectMediaType,
  extractMediaFromMessage,
  getEmbedThumbnailUrl,
  TRUSTED_EMBED_DOMAINS,
} from "../../src/lib/mediaUtils";
import type { Message } from "../../src/types/index";

function makeMessage(content: string): Message {
  return {
    id: "test-id",
    content,
    userId: "user",
    channelId: "channel",
    serverId: "server",
    timestamp: new Date(),
    type: "message",
    reactions: [],
    replyMessage: null,
    mentioned: [],
  };
}

describe("detectMediaType", () => {
  test("returns 'video' for .mp4 URLs", () => {
    expect(detectMediaType("https://example.com/video.mp4")).toBe("video");
  });
  test("returns 'video' for .webm, .mov, .ogv", () => {
    expect(detectMediaType("https://example.com/video.webm")).toBe("video");
    expect(detectMediaType("https://example.com/video.mov")).toBe("video");
    expect(detectMediaType("https://example.com/video.ogv")).toBe("video");
  });
  test("returns 'audio' for .mp3, .ogg, .wav, .flac, .aac, .m4a", () => {
    expect(detectMediaType("https://example.com/audio.mp3")).toBe("audio");
    expect(detectMediaType("https://example.com/audio.ogg")).toBe("audio");
    expect(detectMediaType("https://example.com/audio.wav")).toBe("audio");
    expect(detectMediaType("https://example.com/audio.flac")).toBe("audio");
    expect(detectMediaType("https://example.com/audio.aac")).toBe("audio");
    expect(detectMediaType("https://example.com/audio.m4a")).toBe("audio");
  });
  test("returns 'pdf' for .pdf URLs", () => {
    expect(detectMediaType("https://example.com/doc.pdf")).toBe("pdf");
  });
  test("returns 'embed' for youtube.com", () => {
    expect(detectMediaType("https://www.youtube.com/watch?v=abc")).toBe(
      "embed",
    );
  });
  test("returns 'embed' for youtu.be", () => {
    expect(detectMediaType("https://youtu.be/abc")).toBe("embed");
  });
  test("returns 'embed' for vimeo.com", () => {
    expect(detectMediaType("https://vimeo.com/123")).toBe("embed");
  });
  test("returns 'embed' for soundcloud.com", () => {
    expect(detectMediaType("https://soundcloud.com/artist/track")).toBe(
      "embed",
    );
  });
  test("returns 'image' for imgur.com image URLs", () => {
    expect(detectMediaType("https://imgur.com/abc.jpg")).toBe("image");
  });
  test("returns 'image' for tenor.com URLs", () => {
    expect(detectMediaType("https://media.tenor.com/abc.gif")).toBe("image");
  });
  test("returns 'image' for standard image extensions", () => {
    expect(detectMediaType("https://example.com/photo.jpg")).toBe("image");
    expect(detectMediaType("https://example.com/photo.png")).toBe("image");
    expect(detectMediaType("https://example.com/photo.webp")).toBe("image");
  });
  test("returns null for unrecognised URLs", () => {
    expect(detectMediaType("https://example.com/page")).toBeNull();
    expect(detectMediaType("not-a-url")).toBeNull();
  });
  test("strips query string before extension check", () => {
    expect(detectMediaType("https://example.com/video.mp4?t=10")).toBe("video");
  });
});

describe("extractMediaFromMessage", () => {
  test("extracts single URL message", () => {
    const entries = extractMediaFromMessage(
      makeMessage("https://example.com/photo.jpg"),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      url: "https://example.com/photo.jpg",
      type: "image",
    });
  });
  test("extracts multiple URLs from text", () => {
    const entries = extractMediaFromMessage(
      makeMessage(
        "Check this https://example.com/a.jpg and https://example.com/b.mp4",
      ),
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe("image");
    expect(entries[1].type).toBe("video");
  });
  test("deduplicates identical URLs", () => {
    const entries = extractMediaFromMessage(
      makeMessage("https://example.com/a.jpg https://example.com/a.jpg"),
    );
    expect(entries).toHaveLength(1);
  });
  test("returns null-type entry for URLs with no detectable extension", () => {
    const entries = extractMediaFromMessage(
      makeMessage("https://example.com/page"),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ url: "https://example.com/page", type: null });
  });
  test("strips IRC formatting codes", () => {
    const entries = extractMediaFromMessage(
      makeMessage("\x02https://example.com/photo.jpg\x02"),
    );
    expect(entries).toHaveLength(1);
  });
  test("strips trailing punctuation from URLs", () => {
    const entries = extractMediaFromMessage(
      makeMessage("See https://example.com/photo.jpg."),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe("https://example.com/photo.jpg");
  });
  test("strips trailing asterisks from markdown-bold URLs", () => {
    const entries = extractMediaFromMessage(
      makeMessage("look **https://example.com/video.mp4** nice"),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe("https://example.com/video.mp4");
    expect(entries[0].type).toBe("video");
  });
  test("handles URL with fragment/hash", () => {
    const entries = extractMediaFromMessage(
      makeMessage("https://example.com/photo.jpg#section"),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("image");
  });
  test("handles URL with both query and extension", () => {
    const entries = extractMediaFromMessage(
      makeMessage("https://example.com/video.mp4?token=abc123"),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("video");
  });
});

describe("canShowMedia", () => {
  // isUrlFromFilehost expects filehost to be a full URL
  const filehost = "https://files.example.com";

  test("returns true when showExternalContent is true", () => {
    expect(
      canShowMedia(
        "https://anything.com/x.jpg",
        {
          showSafeMedia: false,
          showTrustedSourcesMedia: false,
          showExternalContent: true,
        },
        null,
      ),
    ).toBe(true);
  });
  test("returns true for filehost URL when showSafeMedia is true", () => {
    expect(
      canShowMedia(
        `${filehost}/image.jpg`,
        {
          showSafeMedia: true,
          showTrustedSourcesMedia: false,
          showExternalContent: false,
        },
        filehost,
      ),
    ).toBe(true);
  });
  test("returns false for filehost URL when showSafeMedia is false", () => {
    expect(
      canShowMedia(
        `${filehost}/image.jpg`,
        {
          showSafeMedia: false,
          showTrustedSourcesMedia: false,
          showExternalContent: false,
        },
        filehost,
      ),
    ).toBe(false);
  });
  test("returns true for trusted domain when showTrustedSourcesMedia is true", () => {
    expect(
      canShowMedia(
        "https://youtube.com/watch?v=x",
        {
          showSafeMedia: false,
          showTrustedSourcesMedia: true,
          showExternalContent: false,
        },
        null,
      ),
    ).toBe(true);
  });
  test("returns false for trusted domain when showTrustedSourcesMedia is false", () => {
    expect(
      canShowMedia(
        "https://youtube.com/watch?v=x",
        {
          showSafeMedia: false,
          showTrustedSourcesMedia: false,
          showExternalContent: false,
        },
        null,
      ),
    ).toBe(false);
  });
  test("returns false for unknown domain with all settings off", () => {
    expect(
      canShowMedia(
        "https://unknown.example.com/x.jpg",
        {
          showSafeMedia: false,
          showTrustedSourcesMedia: false,
          showExternalContent: false,
        },
        null,
      ),
    ).toBe(false);
  });
  test("returns false for external URL when only showSafeMedia is true (no filehost)", () => {
    expect(
      canShowMedia(
        "https://evil.com/tracker.jpg",
        {
          showSafeMedia: true,
          showTrustedSourcesMedia: false,
          showExternalContent: false,
        },
        null,
      ),
    ).toBe(false);
  });
  test("returns false for external URL when only showSafeMedia is true (with filehost)", () => {
    expect(
      canShowMedia(
        "https://evil.com/tracker.jpg",
        {
          showSafeMedia: true,
          showTrustedSourcesMedia: false,
          showExternalContent: false,
        },
        "https://files.example.com",
      ),
    ).toBe(false);
  });
  test("subdomain of trusted domain is allowed", () => {
    expect(
      canShowMedia(
        "https://cdn.youtube.com/watch?v=x",
        {
          showSafeMedia: false,
          showTrustedSourcesMedia: true,
          showExternalContent: false,
        },
        null,
      ),
    ).toBe(true);
  });
  test("similar but non-matching domain is denied", () => {
    expect(
      canShowMedia(
        "https://notyoutube.com/watch?v=x",
        {
          showSafeMedia: false,
          showTrustedSourcesMedia: true,
          showExternalContent: false,
        },
        null,
      ),
    ).toBe(false);
  });
});

describe("TRUSTED_EMBED_DOMAINS", () => {
  test("contains youtube.com as embed", () => {
    expect(TRUSTED_EMBED_DOMAINS["youtube.com"]).toBe("embed");
  });
  test("contains vimeo.com as embed", () => {
    expect(TRUSTED_EMBED_DOMAINS["vimeo.com"]).toBe("embed");
  });
  test("contains tenor.com as image", () => {
    expect(TRUSTED_EMBED_DOMAINS["tenor.com"]).toBe("image");
  });
  test("contains giphy.com as image", () => {
    expect(TRUSTED_EMBED_DOMAINS["giphy.com"]).toBe("image");
  });
});

describe("getEmbedThumbnailUrl", () => {
  test("returns YouTube thumbnail for standard URL", () => {
    expect(getEmbedThumbnailUrl("https://www.youtube.com/watch?v=abc123")).toBe(
      "https://img.youtube.com/vi/abc123/hqdefault.jpg",
    );
  });
  test("returns YouTube thumbnail for youtu.be short URL", () => {
    expect(getEmbedThumbnailUrl("https://youtu.be/abc123")).toBe(
      "https://img.youtube.com/vi/abc123/hqdefault.jpg",
    );
  });
  test("returns YouTube thumbnail for /embed/ URL", () => {
    expect(getEmbedThumbnailUrl("https://www.youtube.com/embed/abc123")).toBe(
      "https://img.youtube.com/vi/abc123/hqdefault.jpg",
    );
  });
  test("returns YouTube thumbnail for /shorts/ URL", () => {
    expect(getEmbedThumbnailUrl("https://www.youtube.com/shorts/abc123")).toBe(
      "https://img.youtube.com/vi/abc123/hqdefault.jpg",
    );
  });
  test("returns null for non-YouTube URL", () => {
    expect(getEmbedThumbnailUrl("https://vimeo.com/123456")).toBeNull();
  });
  test("returns null for invalid URL", () => {
    expect(getEmbedThumbnailUrl("not-a-url")).toBeNull();
  });
});
