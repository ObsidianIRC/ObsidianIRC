import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { MediaPreview } from "../../src/components/message/MediaPreview";
import type { MediaEntry } from "../../src/lib/mediaUtils";

const mockState = {
  ui: {
    activeMedia: null as null | {
      url: string;
      type: string;
      isPlaying: boolean;
      isInlineVisible: boolean;
    },
    openedMedia: null,
  },
  openMedia: vi.fn(),
  playMedia: vi.fn(),
  pauseActiveMedia: vi.fn(),
  stopActiveMedia: vi.fn(),
  setMediaInlineVisible: vi.fn(),
};

vi.mock("../../src/store", () => ({
  default: Object.assign(
    vi.fn((selector: (state: unknown) => unknown) =>
      typeof selector === "function" ? selector(mockState) : null,
    ),
    { getState: () => mockState },
  ),
}));

vi.mock("../../src/lib/ircClient", () => ({
  default: { getCurrentUser: vi.fn(() => null) },
}));

vi.mock("react-pdf", () => ({
  Document: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: () => <div data-testid="pdf-page" />,
  pdfjs: { GlobalWorkerOptions: { workerSrc: "" } },
}));

vi.mock("react-player", () => ({
  default: ({ src }: { src: string }) => (
    <div data-testid="react-player" data-src={src} />
  ),
}));

vi.mock("exifr", () => ({ default: { parse: vi.fn(() => null) } }));

// jsdom doesn't implement IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe("MediaPreview", () => {
  const makeEntry = (
    type: MediaEntry["type"],
    url = "https://example.com/media",
  ): MediaEntry => ({
    url,
    type,
  });

  test("renders img for image entry", () => {
    const { container } = render(
      <MediaPreview
        entry={makeEntry("image", "https://example.com/photo.jpg")}
      />,
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
  });

  test("renders video for video entry", () => {
    const { container } = render(
      <MediaPreview
        entry={makeEntry("video", "https://example.com/video.mp4")}
      />,
    );
    const video = container.querySelector("video");
    expect(video).toBeTruthy();
    expect(video?.src).toContain("video.mp4");
  });

  test("video uses preload=metadata", () => {
    const { container } = render(
      <MediaPreview
        entry={makeEntry("video", "https://example.com/video.mp4")}
      />,
    );
    const video = container.querySelector("video");
    expect(video?.getAttribute("preload")).toBe("metadata");
  });

  test("audio entry renders play button, not audio element", () => {
    const { container, getByLabelText } = render(
      <MediaPreview
        entry={makeEntry("audio", "https://example.com/audio.mp3")}
      />,
    );
    // No audio element — dispatch-only control
    expect(container.querySelector("audio")).toBeNull();
    // Play button should be present
    expect(getByLabelText("Play")).toBeTruthy();
  });
});
