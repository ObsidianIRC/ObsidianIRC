import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  clampZoom,
  MediaViewerModal,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../../src/components/ui/MediaViewerModal";
import * as platformUtils from "../../src/lib/platformUtils";
import * as store from "../../src/store";

vi.mock("../../src/lib/openUrl", () => ({
  openExternalUrl: vi.fn(),
}));

vi.mock("../../src/lib/platformUtils", () => ({
  isTauri: vi.fn(() => false),
}));

vi.mock("../../src/store", () => ({
  getChannelMessages: vi.fn(() => []),
  default: Object.assign(
    vi.fn((selector: (state: unknown) => unknown) =>
      typeof selector === "function" ? selector({ messages: {} }) : null,
    ),
    { getState: vi.fn(() => ({ messages: {} })) },
  ),
}));

vi.mock("../../src/lib/ircClient", () => ({
  default: { sendRaw: vi.fn() },
  ircClient: { sendRaw: vi.fn() },
}));

// ExternalLinkWarningModal → BaseModal → useMediaQuery needs matchMedia
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("clampZoom", () => {
  test("clamps to minimum", () => {
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(-5)).toBe(ZOOM_MIN);
  });

  test("clamps to maximum", () => {
    expect(clampZoom(100)).toBe(ZOOM_MAX);
    expect(clampZoom(5)).toBe(ZOOM_MAX);
  });

  test("passes through values within range", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(clampZoom(ZOOM_MAX)).toBe(ZOOM_MAX);
  });
});

describe("MediaViewerModal", () => {
  const defaultProps = {
    isOpen: true,
    url: "https://example.com/image.jpg",
    onClose: vi.fn(),
  };

  test("renders image with correct src", () => {
    render(<MediaViewerModal {...defaultProps} />);
    const img = screen.getByRole("img", { name: "Image preview" });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", defaultProps.url);
  });

  test("has zoom in and zoom out buttons", () => {
    render(<MediaViewerModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Zoom out" }),
    ).toBeInTheDocument();
  });

  test("zoom in button increases slider value", () => {
    render(<MediaViewerModal {...defaultProps} />);
    const slider = screen.getByRole("slider", { name: "Zoom level" });
    expect(slider).toHaveValue("1");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(slider).toHaveValue("1.25");
  });

  test("zoom out button decreases slider value", () => {
    render(<MediaViewerModal {...defaultProps} />);
    const slider = screen.getByRole("slider", { name: "Zoom level" });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(slider).toHaveValue("1");
  });

  test("clicking image toggles between 1x and 2x zoom", () => {
    render(<MediaViewerModal {...defaultProps} />);
    const img = screen.getByRole("img", { name: "Image preview" });
    fireEvent.click(img);
    expect((img as HTMLImageElement).style.transform).toBe(
      "translate(0px, 0px) scale(2)",
    );
    fireEvent.click(img);
    expect((img as HTMLImageElement).style.transform).toBe(
      "translate(0px, 0px) scale(1)",
    );
  });

  test("dragging when zoomed pans the image", () => {
    render(<MediaViewerModal {...defaultProps} />);
    const img = screen.getByRole("img", { name: "Image preview" });
    const dialog = screen.getByRole("dialog");

    // Zoom in first so drag is enabled
    fireEvent.click(img);

    fireEvent.mouseDown(img, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(dialog, { clientX: 150, clientY: 130 });
    fireEvent.mouseUp(dialog);

    expect((img as HTMLImageElement).style.transform).toBe(
      "translate(50px, 30px) scale(2)",
    );
  });

  test("drag does not toggle zoom", () => {
    render(<MediaViewerModal {...defaultProps} />);
    const img = screen.getByRole("img", { name: "Image preview" });
    const dialog = screen.getByRole("dialog");
    const slider = screen.getByRole("slider", { name: "Zoom level" });

    // Zoom to 2x first
    fireEvent.click(img);
    expect(slider).toHaveValue("2");

    // Drag — should not change zoom back to 1
    fireEvent.mouseDown(img, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(dialog, { clientX: 20, clientY: 20 });
    fireEvent.click(img);

    expect(slider).toHaveValue("2");
  });

  test("shows ExternalLinkWarningModal when Open button clicked", () => {
    render(<MediaViewerModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /open in browser/i }));
    expect(screen.getByText("External Link Warning")).toBeInTheDocument();
  });

  test("calls onClose when ESC pressed", () => {
    const onClose = vi.fn();
    render(<MediaViewerModal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  test("does not render when closed", () => {
    render(<MediaViewerModal {...defaultProps} isOpen={false} />);
    expect(
      screen.queryByRole("img", { name: "Image preview" }),
    ).not.toBeInTheDocument();
  });

  test("download button hidden in browser (non-Tauri)", () => {
    // isTauri() returns false (mocked above)
    render(<MediaViewerModal {...defaultProps} />);
    expect(
      screen.queryByRole("button", { name: /download image/i }),
    ).not.toBeInTheDocument();
  });

  test("download button invokes Rust command on Tauri", async () => {
    vi.mocked(platformUtils.isTauri).mockReturnValue(true);
    const mockInvoke = vi.fn().mockResolvedValue("Saved to Downloads");
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

    render(<MediaViewerModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /download image/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("download_image", {
        url: defaultProps.url,
      });
    });
  });

  test("comments toggle button not shown without serverId/channelId", () => {
    render(<MediaViewerModal {...defaultProps} />);
    expect(
      screen.queryByRole("button", { name: /comments/i }),
    ).not.toBeInTheDocument();
  });

  describe("navigation", () => {
    test("no navigation arrows when no serverId/channelId provided", () => {
      render(<MediaViewerModal {...defaultProps} />);
      expect(
        screen.queryByRole("button", { name: /previous image/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /next image/i }),
      ).not.toBeInTheDocument();
    });

    test("shows next arrow when more images exist after current", () => {
      vi.mocked(store.getChannelMessages).mockReturnValue([
        {
          id: "1",
          content: "https://example.com/image.jpg",
          serverId: "s1",
          channelId: "c1",
          type: "message",
          timestamp: new Date(),
          userId: "user1",
          reactions: [],
          msgid: "1",
        },
        {
          id: "2",
          content: "https://example.com/image2.png",
          serverId: "s1",
          channelId: "c1",
          type: "message",
          timestamp: new Date(),
          userId: "user1",
          reactions: [],
          msgid: "2",
        },
      ] as unknown as ReturnType<typeof store.getChannelMessages>);

      render(
        <MediaViewerModal
          {...defaultProps}
          url="https://example.com/image.jpg"
          serverId="s1"
          channelId="c1"
        />,
      );

      // prev button is rendered but disabled (visually hidden) when on first image
      expect(
        screen.getByRole("button", { name: /previous image/i }),
      ).toBeDisabled();
      expect(screen.getByRole("button", { name: /next image/i })).toBeEnabled();
    });

    test("keyboard arrow navigation works", () => {
      vi.mocked(store.getChannelMessages).mockReturnValue([
        {
          id: "1",
          content: "https://example.com/image.jpg",
          serverId: "s1",
          channelId: "c1",
          type: "message",
          timestamp: new Date(),
          userId: "user1",
          reactions: [],
          msgid: "1",
        },
        {
          id: "2",
          content: "https://example.com/image2.png",
          serverId: "s1",
          channelId: "c1",
          type: "message",
          timestamp: new Date(),
          userId: "user1",
          reactions: [],
          msgid: "2",
        },
      ] as unknown as ReturnType<typeof store.getChannelMessages>);

      render(
        <MediaViewerModal
          {...defaultProps}
          url="https://example.com/image.jpg"
          serverId="s1"
          channelId="c1"
        />,
      );

      const img = screen.getByRole("img", { name: "Image preview" });
      expect(img).toHaveAttribute("src", "https://example.com/image.jpg");

      fireEvent.keyDown(document, { key: "ArrowRight" });
      expect(img).toHaveAttribute("src", "https://example.com/image2.png");

      fireEvent.keyDown(document, { key: "ArrowLeft" });
      expect(img).toHaveAttribute("src", "https://example.com/image.jpg");
    });
  });

  describe("duplicate URL handling", () => {
    // Two different messages that both contain the same image URL.
    const duplicateMessages = [
      {
        id: "msg-a",
        msgid: "msgid-a",
        content: "https://example.com/same.jpg",
        serverId: "s1",
        channelId: "c1",
        type: "message",
        timestamp: new Date(),
        userId: "user1",
        reactions: [],
      },
      {
        id: "msg-b",
        msgid: "msgid-b",
        content: "https://example.com/same.jpg",
        serverId: "s1",
        channelId: "c1",
        type: "message",
        timestamp: new Date(),
        userId: "user2",
        reactions: [],
      },
    ] as unknown as ReturnType<typeof store.getChannelMessages>;

    test("opening the second duplicate selects the second filmstrip entry", () => {
      vi.mocked(store.getChannelMessages).mockReturnValue(duplicateMessages);

      render(
        <MediaViewerModal
          isOpen={true}
          url="https://example.com/same.jpg"
          sourceMsgId="msgid-b"
          onClose={vi.fn()}
          serverId="s1"
          channelId="c1"
        />,
      );

      // The filmstrip should show two thumbnails (same URL, two separate entries).
      const thumbs = screen.getAllByRole("button", { name: /image \d+ of 2/i });
      expect(thumbs).toHaveLength(2);

      // The SECOND thumbnail must be the active one (aria-current="true").
      expect(thumbs[0]).not.toHaveAttribute("aria-current", "true");
      expect(thumbs[1]).toHaveAttribute("aria-current", "true");
    });

    test("opening the first duplicate selects the first filmstrip entry", () => {
      vi.mocked(store.getChannelMessages).mockReturnValue(duplicateMessages);

      render(
        <MediaViewerModal
          isOpen={true}
          url="https://example.com/same.jpg"
          sourceMsgId="msgid-a"
          onClose={vi.fn()}
          serverId="s1"
          channelId="c1"
        />,
      );

      const thumbs = screen.getAllByRole("button", { name: /image \d+ of 2/i });
      expect(thumbs[0]).toHaveAttribute("aria-current", "true");
      expect(thumbs[1]).not.toHaveAttribute("aria-current", "true");
    });

    test("arrow navigation moves one entry at a time through duplicates", () => {
      vi.mocked(store.getChannelMessages).mockReturnValue(duplicateMessages);

      render(
        <MediaViewerModal
          isOpen={true}
          url="https://example.com/same.jpg"
          sourceMsgId="msgid-a"
          onClose={vi.fn()}
          serverId="s1"
          channelId="c1"
        />,
      );

      const thumbs = screen.getAllByRole("button", { name: /image \d+ of 2/i });
      // Start at entry 0.
      expect(thumbs[0]).toHaveAttribute("aria-current", "true");

      // ArrowRight should advance to entry 1 (second duplicate).
      fireEvent.keyDown(document, { key: "ArrowRight" });
      expect(thumbs[1]).toHaveAttribute("aria-current", "true");
      expect(thumbs[0]).not.toHaveAttribute("aria-current", "true");

      // ArrowLeft should go back to entry 0.
      fireEvent.keyDown(document, { key: "ArrowLeft" });
      expect(thumbs[0]).toHaveAttribute("aria-current", "true");
    });

    test("message with multiple images creates one entry per image", () => {
      vi.mocked(store.getChannelMessages).mockReturnValue([
        {
          id: "msg-multi",
          msgid: "msgid-multi",
          content:
            "check these out https://example.com/a.jpg and https://example.com/b.png",
          serverId: "s1",
          channelId: "c1",
          type: "message",
          timestamp: new Date(),
          userId: "user1",
          reactions: [],
        },
      ] as unknown as ReturnType<typeof store.getChannelMessages>);

      render(
        <MediaViewerModal
          isOpen={true}
          url="https://example.com/a.jpg"
          sourceMsgId="msgid-multi"
          onClose={vi.fn()}
          serverId="s1"
          channelId="c1"
        />,
      );

      // Both images from the single message appear as separate filmstrip entries.
      const thumbs = screen.getAllByRole("button", { name: /image \d+ of 2/i });
      expect(thumbs).toHaveLength(2);
      expect(thumbs[0]).toHaveAttribute("aria-current", "true");

      // Arrow right navigates to the second image in the same message.
      const img = screen.getByRole("img", { name: "Image preview" });
      fireEvent.keyDown(document, { key: "ArrowRight" });
      expect(img).toHaveAttribute("src", "https://example.com/b.png");
      expect(thumbs[1]).toHaveAttribute("aria-current", "true");
    });

    test("same URL in multi-image message and another message are distinct entries", () => {
      vi.mocked(store.getChannelMessages).mockReturnValue([
        {
          id: "msg-1",
          msgid: "msgid-1",
          content:
            "https://example.com/same.jpg and https://example.com/other.png",
          serverId: "s1",
          channelId: "c1",
          type: "message",
          timestamp: new Date(),
          userId: "user1",
          reactions: [],
        },
        {
          id: "msg-2",
          msgid: "msgid-2",
          content: "https://example.com/same.jpg",
          serverId: "s1",
          channelId: "c1",
          type: "message",
          timestamp: new Date(),
          userId: "user2",
          reactions: [],
        },
      ] as unknown as ReturnType<typeof store.getChannelMessages>);

      render(
        <MediaViewerModal
          isOpen={true}
          url="https://example.com/same.jpg"
          sourceMsgId="msgid-2"
          onClose={vi.fn()}
          serverId="s1"
          channelId="c1"
        />,
      );

      // 3 entries total: same.jpg(msg-1), other.png(msg-1), same.jpg(msg-2)
      const thumbs = screen.getAllByRole("button", { name: /image \d+ of 3/i });
      expect(thumbs).toHaveLength(3);

      // sourceMsgId="msgid-2" means the third entry (index 2) is active.
      expect(thumbs[2]).toHaveAttribute("aria-current", "true");
      expect(thumbs[0]).not.toHaveAttribute("aria-current", "true");
    });
  });
});
