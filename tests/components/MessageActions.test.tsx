import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { MessageActions } from "../../src/components/message/MessageActions";
import type { MessageType } from "../../src/types";

const baseMessage: MessageType = {
  id: "msg-1",
  type: "message",
  content: "hello",
  timestamp: new Date("2026-01-01T00:00:00Z"),
  userId: "alice",
  channelId: "channel-1",
  serverId: "server-1",
  reactions: [],
  replyMessage: null,
  mentioned: [],
  msgid: "abc123",
};

describe("MessageActions", () => {
  test("renders translate action when enabled", () => {
    render(
      <MessageActions
        message={baseMessage}
        onReplyClick={vi.fn()}
        onReactClick={vi.fn()}
        onTranslateClick={vi.fn()}
        canTranslate
      />,
    );

    expect(
      screen.getByRole("button", { name: /translate message/i }),
    ).toBeInTheDocument();
  });

  test("calls translate handler when clicked", () => {
    const onTranslateClick = vi.fn();

    render(
      <MessageActions
        message={baseMessage}
        onReplyClick={vi.fn()}
        onReactClick={vi.fn()}
        onTranslateClick={onTranslateClick}
        canTranslate
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /translate message/i }));
    expect(onTranslateClick).toHaveBeenCalledOnce();
  });

  test("disables translate action while translating", () => {
    render(
      <MessageActions
        message={baseMessage}
        onReplyClick={vi.fn()}
        onReactClick={vi.fn()}
        onTranslateClick={vi.fn()}
        canTranslate
        isTranslating
      />,
    );

    expect(
      screen.getByRole("button", { name: /translating message/i }),
    ).toBeDisabled();
  });
});
