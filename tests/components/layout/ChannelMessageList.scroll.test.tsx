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
