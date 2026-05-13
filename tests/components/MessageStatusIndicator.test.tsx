import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MessageStatusIndicator } from "../../src/components/message/MessageStatusIndicator";

describe("MessageStatusIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("renders nothing during the first 500ms in pending", () => {
    const { container } = render(<MessageStatusIndicator status="pending" />);
    expect(container.firstChild).toBeNull();
  });

  test("renders the spinner once 500ms has elapsed in pending", () => {
    render(<MessageStatusIndicator status="pending" />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const indicator = screen.getByLabelText("Sending");
    expect(indicator).toBeTruthy();
    expect(indicator.querySelector("svg.animate-spin")).toBeTruthy();
  });

  test("does not render the spinner if status flips before the delay", () => {
    const { rerender, container } = render(
      <MessageStatusIndicator status="pending" />,
    );
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender(<MessageStatusIndicator status="failed" onRetry={() => {}} />);
    expect(container.querySelector("svg.animate-spin")).toBeNull();
  });

  test("renders a retry button for failed status and fires onRetry on click", () => {
    const onRetry = vi.fn();
    render(<MessageStatusIndicator status="failed" onRetry={onRetry} />);
    const button = screen.getByLabelText("Retry sending");
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
