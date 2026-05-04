import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COLLAPSIBLE_MAX_LINES,
  CollapsibleMessage,
} from "../../src/components/message/CollapsibleMessage";

describe("CollapsibleMessage", () => {
  const LINE_HEIGHT = 20;
  let mockScrollHeight = 0;

  beforeEach(() => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () =>
        ({
          lineHeight: `${LINE_HEIGHT}px`,
        }) as unknown as CSSStyleDeclaration,
    );

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return mockScrollHeight;
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockScrollHeight = 0;
  });

  it("does not show button when content fits within the line limit", () => {
    mockScrollHeight = LINE_HEIGHT * COLLAPSIBLE_MAX_LINES; // exactly at threshold
    render(<CollapsibleMessage content={<p>Short content</p>} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows button when content exceeds the line limit", () => {
    mockScrollHeight = LINE_HEIGHT * (COLLAPSIBLE_MAX_LINES + 1); // one line over
    render(<CollapsibleMessage content={<p>Long content</p>} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("toggles expanded state on button click", () => {
    mockScrollHeight = LINE_HEIGHT * (COLLAPSIBLE_MAX_LINES + 1);
    const { container } = render(
      <CollapsibleMessage content={<p>Long content</p>} />,
    );

    const contentDiv = container.querySelector(
      ".overflow-hidden",
    ) as HTMLElement;
    expect(contentDiv.style.maxHeight).toBe(
      `${LINE_HEIGHT * COLLAPSIBLE_MAX_LINES}px`,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(contentDiv.style.maxHeight).toBe(
      `${LINE_HEIGHT * (COLLAPSIBLE_MAX_LINES + 1)}px`,
    );
  });

  it("uses px units (not em) for collapsed height", () => {
    mockScrollHeight = LINE_HEIGHT * (COLLAPSIBLE_MAX_LINES + 1);
    const { container } = render(
      <CollapsibleMessage content={<p>Long content</p>} />,
    );

    const contentDiv = container.querySelector(
      ".overflow-hidden",
    ) as HTMLElement;
    const maxHeight = contentDiv.style.maxHeight;

    expect(maxHeight).toMatch(/^\d+px$/);
    expect(maxHeight).not.toContain("em");
  });

  it("shows correct tooltip before and after toggle", () => {
    mockScrollHeight = LINE_HEIGHT * (COLLAPSIBLE_MAX_LINES + 1);
    render(<CollapsibleMessage content={<p>Long content</p>} />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("title", "Read more");

    fireEvent.click(button);
    expect(button).toHaveAttribute("title", "Show less");
  });
});
