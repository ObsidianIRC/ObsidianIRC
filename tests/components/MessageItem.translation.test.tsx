import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockState = {
  servers: [
    {
      id: "server-1",
      channels: [{ id: "channel-1", users: [] }],
      privateChats: [],
      capabilities: [],
      filehost: null,
    },
  ],
  globalSettings: {
    mediaVisibilityLevel: 1,
    enableMarkdownRendering: false,
    translationTargetLanguage: "es",
  },
  openMedia: vi.fn(),
};

const mockAvailability = vi.fn();
const mockTranslate = vi.fn();
const mockTargetLanguage = vi.fn();

vi.mock("../../src/hooks/useLongPress", () => ({
  useLongPress: () => ({
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
    onTouchCancel: vi.fn(),
  }),
}));

vi.mock("../../src/hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}));

vi.mock("../../src/lib/browserTranslation", () => ({
  canUseBrowserTranslation: () => true,
  getBrowserTranslationAvailability: (...args: unknown[]) =>
    mockAvailability(...args),
  getMessageSourceLanguage: () => "en",
  getPreferredTranslationTargetLanguageFromSetting: (...args: unknown[]) =>
    mockTargetLanguage(...args),
  translateWithBrowser: (...args: unknown[]) => mockTranslate(...args),
}));

vi.mock("../../src/lib/ircClient", () => ({
  default: {
    getCurrentUser: () => ({ username: "bob" }),
  },
}));

vi.mock("../../src/lib/ircUtils", () => ({
  isUrlFromFilehost: () => false,
  isUserVerified: () => false,
  processMarkdownInText: (content: string) => content,
}));

vi.mock("../../src/lib/mediaUtils", () => ({
  canShowMedia: () => false,
  extractMediaFromMessage: () => [],
  mediaLevelToSettings: () => ({
    showSafeMedia: true,
    showTrustedSourcesMedia: false,
    showExternalContent: false,
  }),
}));

vi.mock("../../src/lib/messageFormatter", () => ({
  stripIrcFormatting: (content: string) => content,
}));

vi.mock("../../src/store", () => {
  const useStore = Object.assign(
    (selector: (state: typeof mockState) => unknown) => selector(mockState),
    { getState: () => mockState },
  );

  return {
    __esModule: true,
    default: useStore,
    loadSavedMetadata: () => ({}),
  };
});

vi.mock("../../src/components/mobile/MessageBottomSheet", () => ({
  default: () => null,
}));

vi.mock("../../src/components/ui/LinkWrapper", () => ({
  EnhancedLinkWrapper: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("../../src/components/message/InviteMessage", () => ({
  InviteMessage: () => null,
}));

vi.mock("../../src/components/message/MediaPreview", () => ({
  MediaPreview: () => null,
}));

vi.mock("../../src/components/message/index", async () => {
  const ReactModule = await import("react");

  return {
    ActionMessage: () => null,
    CollapsibleMessage: ReactModule.forwardRef(
      ({ content }: { content: React.ReactNode }, _ref) => <div>{content}</div>,
    ),
    DateSeparator: () => null,
    EventMessage: () => null,
    JsonLogMessage: () => null,
    LinkPreview: () => null,
    MessageAvatar: () => null,
    MessageHeader: () => null,
    MessageReply: () => null,
    ReactionsWithActions: ({
      onTranslateClick,
    }: {
      onTranslateClick?: () => void;
    }) => (
      <button type="button" onClick={onTranslateClick}>
        Translate from actions
      </button>
    ),
    StandardReplyNotification: () => null,
    SystemMessage: () => null,
    WhisperMessage: () => null,
  };
});

import { MessageItem } from "../../src/components/message/MessageItem";
import type { MessageType } from "../../src/types";

const message: MessageType = {
  id: "msg-1",
  msgid: "abc123",
  type: "message",
  content: "hello world",
  timestamp: new Date("2026-04-22T12:00:00Z"),
  userId: "alice",
  channelId: "channel-1",
  serverId: "server-1",
  reactions: [],
  replyMessage: null,
  mentioned: [],
};

describe("MessageItem translation", () => {
  beforeEach(() => {
    mockAvailability.mockReset();
    mockTranslate.mockReset();
    mockTargetLanguage.mockReset();
    mockState.globalSettings.translationTargetLanguage = "es";
    mockAvailability.mockResolvedValue("available");
    mockTranslate.mockResolvedValue("hola mundo");
    mockTargetLanguage.mockReturnValue("es");
  });

  test("uses the explicit target language setting and renders translated output", async () => {
    render(
      <MessageItem
        message={message}
        showDate={false}
        showHeader={false}
        setReplyTo={vi.fn()}
        onUsernameContextMenu={vi.fn()}
        onReactClick={vi.fn()}
        onReactionUnreact={vi.fn()}
        onOpenReactionModal={vi.fn()}
        onDirectReaction={vi.fn()}
        serverId="server-1"
        channelId="channel-1"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /translate from actions/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("hola mundo")).toBeInTheDocument();
    });

    expect(mockTargetLanguage).toHaveBeenCalledWith("es");
    expect(mockTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: "en",
        targetLanguage: "es",
        text: "hello world",
      }),
    );
  });
});
