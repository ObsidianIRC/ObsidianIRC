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
const mockDetectLanguage = vi.fn();
const mockSourceLanguage = vi.fn();
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
  detectMessageSourceLanguage: (...args: unknown[]) =>
    mockDetectLanguage(...args),
  getBrowserTranslationAvailability: (...args: unknown[]) =>
    mockAvailability(...args),
  getMessageSourceLanguage: (...args: unknown[]) => mockSourceLanguage(...args),
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

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
    mockDetectLanguage.mockReset();
    mockSourceLanguage.mockReset();
    mockTranslate.mockReset();
    mockTargetLanguage.mockReset();
    mockState.globalSettings.translationTargetLanguage = "es";
    mockAvailability.mockResolvedValue("available");
    mockDetectLanguage.mockResolvedValue("fr-CA");
    mockSourceLanguage.mockReturnValue("en");
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

  test("detects the source language when the message has no language tag", async () => {
    mockState.globalSettings.translationTargetLanguage = "";
    mockSourceLanguage.mockReturnValue(null);
    mockTargetLanguage.mockReturnValue("pt-BR");

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
      expect(mockDetectLanguage).toHaveBeenCalledWith(
        expect.objectContaining({ text: "hello world" }),
      );
    });
    expect(mockTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: "fr-CA",
        targetLanguage: "pt-BR",
      }),
    );
  });

  test("ignores stale translation results when a newer request starts", async () => {
    const firstTranslation = createDeferred<string>();
    const secondTranslation = createDeferred<string>();

    mockTranslate
      .mockReturnValueOnce(firstTranslation.promise)
      .mockReturnValueOnce(secondTranslation.promise);

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

    const translateButton = screen.getByRole("button", {
      name: /translate from actions/i,
    });

    fireEvent.click(translateButton);

    await waitFor(() => {
      expect(mockTranslate).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(translateButton);

    await waitFor(() => {
      expect(mockTranslate).toHaveBeenCalledTimes(2);
    });

    firstTranslation.resolve("hola viejo");

    await waitFor(() => {
      expect(screen.queryByText("hola viejo")).not.toBeInTheDocument();
    });

    secondTranslation.resolve("hola nuevo");

    await waitFor(() => {
      expect(screen.getByText("hola nuevo")).toBeInTheDocument();
    });

    expect(screen.queryByText("hola viejo")).not.toBeInTheDocument();
  });
});
