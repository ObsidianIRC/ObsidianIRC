import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  clampZoom,
  ImageLightboxModal,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../../src/components/ui/ImageLightboxModal";
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
    vi.fn(() => null),
    { getState: vi.fn(() => ({ messages: {} })) },
  ),
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

describe("ImageLightboxModal", () => {
  const defaultProps = {
    isOpen: true,
    url: "https://example.com/image.jpg",
    onClose: vi.fn(),
  };

  test("renders image with correct src", () => {
    render(<ImageLightboxModal {...defaultProps} />);
    const img = screen.getByRole("img", { name: "Image preview" });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", defaultProps.url);
  });

  test("has zoom in and zoom out buttons", () => {
    render(<ImageLightboxModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Zoom out" }),
    ).toBeInTheDocument();
  });

  test("zoom in button increases slider value", () => {
    render(<ImageLightboxModal {...defaultProps} />);
    const slider = screen.getByRole("slider", { name: "Zoom level" });
    expect(slider).toHaveValue("1");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(slider).toHaveValue("1.25");
  });

  test("zoom out button decreases slider value", () => {
    render(<ImageLightboxModal {...defaultProps} />);
    const slider = screen.getByRole("slider", { name: "Zoom level" });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(slider).toHaveValue("1");
  });

  test("clicking image toggles between 1x and 2x zoom", () => {
    render(<ImageLightboxModal {...defaultProps} />);
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
    render(<ImageLightboxModal {...defaultProps} />);
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
    render(<ImageLightboxModal {...defaultProps} />);
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
    render(<ImageLightboxModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /open in browser/i }));
    expect(screen.getByText("External Link Warning")).toBeInTheDocument();
  });

  test("calls onClose when ESC pressed", () => {
    const onClose = vi.fn();
    render(<ImageLightboxModal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  test("does not render when closed", () => {
    render(<ImageLightboxModal {...defaultProps} isOpen={false} />);
    expect(
      screen.queryByRole("img", { name: "Image preview" }),
    ).not.toBeInTheDocument();
  });

  test("download button hidden in browser (non-Tauri)", () => {
    // isTauri() returns false (mocked above)
    render(<ImageLightboxModal {...defaultProps} />);
    expect(
      screen.queryByRole("button", { name: /download image/i }),
    ).not.toBeInTheDocument();
  });

  test("download button invokes Rust command on Tauri", async () => {
    vi.mocked(platformUtils.isTauri).mockReturnValue(true);
    const mockInvoke = vi.fn().mockResolvedValue("Saved to Downloads");
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

    render(<ImageLightboxModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /download image/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("download_image", {
        url: defaultProps.url,
      });
    });
  });

  describe("navigation", () => {
    test("no navigation arrows when no serverId/channelId provided", () => {
      render(<ImageLightboxModal {...defaultProps} />);
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
        <ImageLightboxModal
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
        <ImageLightboxModal
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
});
