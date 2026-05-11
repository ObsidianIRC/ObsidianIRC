import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { StandardReplyNotification } from "../../src/components/ui/StandardReplyNotification";

vi.mock("../../src/lib/ircUtils", () => ({
  mircToHtml: vi.fn((text: string) => `<span>${text}</span>`),
  processMarkdownInText: vi.fn((text: string) => `<span>${text}</span>`),
}));

vi.mock("../../src/components/ui/LinkWrapper", () => ({
  EnhancedLinkWrapper: ({
    children,
    onIrcLinkClick,
  }: {
    children: React.ReactNode;
    onIrcLinkClick?: (url: string) => void;
  }) => (
    <div data-testid="enhanced-link-wrapper" data-onclick={!!onIrcLinkClick}>
      {children}
    </div>
  ),
}));

describe("StandardReplyNotification", () => {
  const mockOnIrcLinkClick = vi.fn();
  const baseProps = {
    command: "AUTHENTICATE",
    code: "INVALID_CREDENTIALS",
    message: "Authentication failed",
    timestamp: new Date("2023-01-01T12:00:00Z"),
  };

  test("renders the human-readable description as the body", () => {
    render(
      <StandardReplyNotification
        {...baseProps}
        type="FAIL"
        onIrcLinkClick={mockOnIrcLinkClick}
      />,
    );
    expect(screen.getByTestId("enhanced-link-wrapper")).toHaveTextContent(
      "Authentication failed",
    );
  });

  test("does NOT render command/code as visible text (computer-readable only)", () => {
    render(
      <StandardReplyNotification
        {...baseProps}
        type="FAIL"
        onIrcLinkClick={mockOnIrcLinkClick}
      />,
    );
    // Description text is what users see; command/code/type must not appear
    // in any visible label.
    expect(screen.queryByText(/AUTHENTICATE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/INVALID_CREDENTIALS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^FAIL$/)).not.toBeInTheDocument();
  });

  test("FAIL applies red severity styling", () => {
    render(<StandardReplyNotification {...baseProps} type="FAIL" />);
    const card = document.querySelector(".bg-red-100");
    expect(card).toHaveClass("bg-red-100", "border-red-300");
    expect(card).toHaveClass("dark:bg-red-950/50", "dark:border-red-700");
  });

  test("WARN applies yellow severity styling", () => {
    render(<StandardReplyNotification {...baseProps} type="WARN" />);
    const card = document.querySelector(".bg-yellow-100");
    expect(card).toHaveClass("bg-yellow-100", "border-yellow-300");
  });

  test("NOTE applies blue severity styling", () => {
    render(<StandardReplyNotification {...baseProps} type="NOTE" />);
    const card = document.querySelector(".bg-blue-100");
    expect(card).toHaveClass("bg-blue-100", "border-blue-300");
  });

  test("renders context strings as chips alongside the description", () => {
    render(
      <StandardReplyNotification
        {...baseProps}
        type="FAIL"
        context={["#foo", "alice"]}
      />,
    );
    expect(screen.getByText("#foo")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  test("legacy `target` is rendered as a chip when no `context` is supplied", () => {
    render(
      <StandardReplyNotification {...baseProps} type="FAIL" target="#foo" />,
    );
    expect(screen.getByText("#foo")).toBeInTheDocument();
  });

  test("falls back to '(no description)' when message is empty", () => {
    render(<StandardReplyNotification {...baseProps} type="FAIL" message="" />);
    expect(screen.getByText("(no description)")).toBeInTheDocument();
  });

  test("exposes computer-readable info via the title attribute", () => {
    render(
      <StandardReplyNotification
        {...baseProps}
        type="FAIL"
        context={["#foo"]}
      />,
    );
    const card = document.querySelector("[title]") as HTMLElement | null;
    expect(card?.getAttribute("title")).toBe(
      "FAIL AUTHENTICATE INVALID_CREDENTIALS #foo",
    );
  });

  test("displays formatted timestamp", () => {
    const testDate = new Date("2023-01-01T15:30:00Z");
    render(
      <StandardReplyNotification
        {...baseProps}
        type="NOTE"
        timestamp={testDate}
      />,
    );
    const expected = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(testDate);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  test("passes onIrcLinkClick into EnhancedLinkWrapper", () => {
    render(
      <StandardReplyNotification
        {...baseProps}
        type="NOTE"
        onIrcLinkClick={mockOnIrcLinkClick}
      />,
    );
    const wrapper = screen.getByTestId("enhanced-link-wrapper");
    expect(wrapper).toHaveAttribute("data-onclick", "true");
  });

  test("works without onIrcLinkClick callback", () => {
    render(<StandardReplyNotification {...baseProps} type="FAIL" />);
    const wrapper = screen.getByTestId("enhanced-link-wrapper");
    expect(wrapper).toHaveAttribute("data-onclick", "false");
  });
});
