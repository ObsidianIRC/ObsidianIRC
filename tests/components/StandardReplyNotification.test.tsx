import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { StandardReplyNotification } from "../../src/components/ui/StandardReplyNotification";

// Mock the IRC utilities
vi.mock("../../src/lib/ircUtils", () => ({
  mircToHtml: vi.fn((text: string) => `<span>${text}</span>`),
}));

// Mock the LinkWrapper component
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

  test("renders FAIL notification with correct styling and icon", () => {
    render(
      <StandardReplyNotification
        {...baseProps}
        type="FAIL"
        onIrcLinkClick={mockOnIrcLinkClick}
      />,
    );

    // Check that the notification is rendered
    expect(
      screen.getByText("FAIL AUTHENTICATE INVALID_CREDENTIALS"),
    ).toBeInTheDocument();

    // Check FAIL-specific styling (red colors) - find the main container by class
    const mainContainer = document.querySelector(".bg-red-100");
    expect(mainContainer).toHaveClass("bg-red-100", "border-red-300");
    expect(mainContainer).toHaveClass(
      "dark:bg-red-950/50",
      "dark:border-red-700",
    );

    // Check that the red icon is present (FaTimesCircle)
    const iconContainer = screen.getByText(
      "FAIL AUTHENTICATE INVALID_CREDENTIALS",
    ).parentElement?.previousElementSibling;
    expect(iconContainer).toBeInTheDocument();
  });

  test("renders WARN notification with correct styling and icon", () => {
    render(
      <StandardReplyNotification
        {...baseProps}
        type="WARN"
        onIrcLinkClick={mockOnIrcLinkClick}
      />,
    );

    expect(
      screen.getByText("WARN AUTHENTICATE INVALID_CREDENTIALS"),
    ).toBeInTheDocument();

    // Check WARN-specific styling (yellow colors)
    const mainContainer = document.querySelector(".bg-yellow-100");
    expect(mainContainer).toHaveClass("bg-yellow-100", "border-yellow-300");
    expect(mainContainer).toHaveClass(
      "dark:bg-yellow-950/50",
      "dark:border-yellow-700",
    );
  });

  test("renders NOTE notification with correct styling and icon", () => {
    render(
      <StandardReplyNotification
        {...baseProps}
        type="NOTE"
        onIrcLinkClick={mockOnIrcLinkClick}
      />,
    );

    expect(
      screen.getByText("NOTE AUTHENTICATE INVALID_CREDENTIALS"),
    ).toBeInTheDocument();

    // Check NOTE-specific styling (blue colors)
    const mainContainer = document.querySelector(".bg-blue-100");
    expect(mainContainer).toHaveClass("bg-blue-100", "border-blue-300");
    expect(mainContainer).toHaveClass(
      "dark:bg-blue-950/50",
      "dark:border-blue-700",
    );
  });

  test("displays target when provided", () => {
    render(
      <StandardReplyNotification {...baseProps} type="FAIL" target="user123" />,
    );

    expect(screen.getByText(/FAIL/)).toBeInTheDocument();
    expect(screen.getByText(/AUTHENTICATE/)).toBeInTheDocument();
    expect(screen.getByText(/INVALID_CREDENTIALS/)).toBeInTheDocument();
    expect(screen.getByText(/user123/)).toBeInTheDocument();
  });

  test("does not display target when not provided", () => {
    render(<StandardReplyNotification {...baseProps} type="FAIL" />);

    expect(
      screen.getByText("FAIL AUTHENTICATE INVALID_CREDENTIALS"),
    ).toBeInTheDocument();
    expect(screen.queryByText("•")).not.toBeInTheDocument();
  });

  test("displays formatted timestamp", () => {
    render(
      <StandardReplyNotification
        {...baseProps}
        type="NOTE"
        timestamp={new Date("2023-01-01T15:30:00Z")}
      />,
    );

    // Should display time in 12-hour format with 2 digits
    expect(screen.getByText("03:30 PM")).toBeInTheDocument();
  });

  test("renders message content through EnhancedLinkWrapper", () => {
    render(
      <StandardReplyNotification
        {...baseProps}
        type="WARN"
        message="Warning: Invalid command"
        onIrcLinkClick={mockOnIrcLinkClick}
      />,
    );

    // Check that the message is wrapped in EnhancedLinkWrapper
    const linkWrapper = screen.getByTestId("enhanced-link-wrapper");
    expect(linkWrapper).toBeInTheDocument();
    expect(linkWrapper).toHaveAttribute("data-onclick", "true");

    // Check that mircToHtml was called and the result is displayed
    expect(linkWrapper).toHaveTextContent("Warning: Invalid command");
  });

  test("handles onIrcLinkClick callback", () => {
    render(
      <StandardReplyNotification
        {...baseProps}
        type="NOTE"
        onIrcLinkClick={mockOnIrcLinkClick}
      />,
    );

    const linkWrapper = screen.getByTestId("enhanced-link-wrapper");
    expect(linkWrapper).toHaveAttribute("data-onclick", "true");
  });

  test("works without onIrcLinkClick callback", () => {
    render(<StandardReplyNotification {...baseProps} type="FAIL" />);

    const linkWrapper = screen.getByTestId("enhanced-link-wrapper");
    expect(linkWrapper).toHaveAttribute("data-onclick", "false");
  });

  test("applies correct text colors for each type", () => {
    const { rerender } = render(
      <StandardReplyNotification {...baseProps} type="FAIL" />,
    );

    // FAIL should have red text
    let header = screen.getByText("FAIL AUTHENTICATE INVALID_CREDENTIALS");
    expect(header).toHaveClass("text-red-800", "dark:text-red-200");

    // Re-render with WARN
    rerender(<StandardReplyNotification {...baseProps} type="WARN" />);

    header = screen.getByText("WARN AUTHENTICATE INVALID_CREDENTIALS");
    expect(header).toHaveClass("text-yellow-800", "dark:text-yellow-200");

    // Re-render with NOTE
    rerender(<StandardReplyNotification {...baseProps} type="NOTE" />);

    header = screen.getByText("NOTE AUTHENTICATE INVALID_CREDENTIALS");
    expect(header).toHaveClass("text-blue-800", "dark:text-blue-200");
  });
});
