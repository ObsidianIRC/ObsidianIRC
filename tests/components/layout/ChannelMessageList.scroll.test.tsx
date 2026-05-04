import { render } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChannelMessageList,
  type ChannelMessageListHandle,
  DEFAULT_VISIBLE_MESSAGE_COUNT,
} from "../../../src/components/layout/ChannelMessageList";
import useStore from "../../../src/store";

vi.mock("../../../src/lib/ircClient", () => ({
  default: {
    sendRaw: vi.fn(),
    on: vi.fn(),
    getCurrentUser: vi.fn(() => ({ id: "u1", username: "tester" })),
    getNick: vi.fn(() => "tester"),
    version: "1.0.0",
  },
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn().mockResolvedValue("linux"),
}));

// Minimal props — channelId:null means no channel lookup, no loading spinner.
const defaultProps = {
  channelKey: "s1::pm:pm1",
  serverId: "s1",
  channelId: null as null,
  privateChatId: "pm1",
  isActive: true,
  searchQuery: "",
  isMemberListVisible: false,
  onReply: vi.fn(),
  onUsernameContextMenu: vi.fn(),
  onIrcLinkClick: vi.fn(),
  onReactClick: vi.fn(),
  onReactionUnreact: vi.fn(),
  onOpenReactionModal: vi.fn(),
  onDirectReaction: vi.fn(),
  onRedactMessage: vi.fn(),
  onOpenProfile: vi.fn(),
  joinChannel: vi.fn(),
  onClearSearch: vi.fn(),
};

const makeMsg = (
  id: string,
  overrides?: Partial<import("../../../src/types").Message>,
): import("../../../src/types").Message => ({
  id,
  msgid: id,
  type: "message",
  content: `Content of ${id}`,
  timestamp: new Date("2024-01-01T12:00:00Z"),
  userId: "alice",
  channelId: "pm1",
  serverId: "s1",
  reactions: [],
  replyMessage: null,
  mentioned: [],
  ...overrides,
});

describe("ChannelMessageList scroll state", () => {
  beforeEach(() => {
    useStore.setState({ messages: {}, servers: [] });
  });

  it("restores saved position when initialScrollState is provided", () => {
    const ref = createRef<ChannelMessageListHandle>();
    render(
      <ChannelMessageList
        {...defaultProps}
        ref={ref}
        initialScrollState={{ scrollTop: 350, visibleCount: 60 }}
      />,
    );

    const state = ref.current?.getScrollState();
    expect(state?.scrollTop).toBe(350);
    expect(state?.isAtBottom).toBe(false);
    expect(state?.visibleCount).toBe(60);
  });

  it("marks at-bottom when initialScrollState is null (user was at bottom when they left)", () => {
    const ref = createRef<ChannelMessageListHandle>();
    render(
      <ChannelMessageList
        {...defaultProps}
        ref={ref}
        initialScrollState={null}
      />,
    );

    const state = ref.current?.getScrollState();
    expect(state?.isAtBottom).toBe(true);
  });

  it("marks at-bottom and uses default window size when initialScrollState is absent (first visit)", () => {
    const ref = createRef<ChannelMessageListHandle>();
    render(<ChannelMessageList {...defaultProps} ref={ref} />);

    const state = ref.current?.getScrollState();
    expect(state?.isAtBottom).toBe(true);
    expect(state?.visibleCount).toBe(DEFAULT_VISIBLE_MESSAGE_COUNT);
  });
});

describe("ChannelMessageList highlight", () => {
  beforeEach(() => {
    useStore.setState({
      messages: {
        "s1::pm:pm1": [makeMsg("msg-a"), makeMsg("msg-b"), makeMsg("msg-c")],
      },
      servers: [],
    });
  });

  it("applies highlight class to the matching message row", () => {
    const { container } = render(
      <ChannelMessageList {...defaultProps} highlightedMessageId="msg-b" />,
    );

    const highlighted = container.querySelector('[data-message-id="msg-b"]');
    const others = [
      container.querySelector('[data-message-id="msg-a"]'),
      container.querySelector('[data-message-id="msg-c"]'),
    ];

    expect(highlighted?.className).toContain("bg-primary/10");
    expect(highlighted?.className).toContain("ring-1");
    for (const el of others) {
      expect(el?.className).not.toContain("bg-primary/10");
    }
  });

  it("applies no highlight when highlightedMessageId is undefined", () => {
    const { container } = render(
      <ChannelMessageList {...defaultProps} highlightedMessageId={undefined} />,
    );

    for (const id of ["msg-a", "msg-b", "msg-c"]) {
      const el = container.querySelector(`[data-message-id="${id}"]`);
      expect(el?.className).not.toContain("bg-primary/10");
    }
  });
});
