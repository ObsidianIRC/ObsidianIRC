import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatArea } from "../../src/components/layout/ChatArea";
import ircClient from "../../src/lib/ircClient";
import useStore from "../../src/store";
import type { Channel, Server, User } from "../../src/types";

vi.mock("../../src/lib/ircClient", () => ({
  default: {
    sendRaw: vi.fn(),
    sendTyping: vi.fn(),
    on: vi.fn(),
    getCurrentUser: vi.fn(() => ({ id: "test-user", username: "tester" })),
    getNick: vi.fn(() => "tester"),
    version: "1.0.0",
  },
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn().mockResolvedValue("linux"),
}));

Object.defineProperty(HTMLInputElement.prototype, "setSelectionRange", {
  value: vi.fn(),
  writable: true,
});

const mockUsers: User[] = [
  { id: "1", username: "alice", isOnline: true },
  { id: "2", username: "bob", isOnline: true },
  { id: "3", username: "charlie", isOnline: false },
  { id: "4", username: "admin", isOnline: true },
];

const mockChannel: Channel = {
  id: "channel1",
  name: "#general",
  topic: "General discussion",
  isPrivate: false,
  serverId: "server1",
  unreadCount: 0,
  isMentioned: false,
  messages: [],
  users: mockUsers,
};

const mockServer: Server = {
  id: "server1",
  name: "Test Server",
  host: "irc.test.com",
  port: 6667,
  channels: [mockChannel],
  privateChats: [],
  isConnected: true,
  users: mockUsers,
};

describe("ChatArea Tab Completion Integration", () => {
  beforeEach(() => {
    useStore.setState({
      servers: [mockServer],
      currentUser: { id: "user1", username: "testuser", isOnline: true },
      ui: {
        selectedServerId: "server1",
        perServerSelections: {
          server1: {
            selectedChannelId: "channel1",
            selectedPrivateChatId: null,
          },
        },
        isMemberListVisible: true,
        isChannelListVisible: true,
        isDarkMode: true,
        isMobileMenuOpen: false,
        linkSecurityWarnings: [],
        mobileViewActiveColumn: "serverList",
        isServerMenuOpen: false,
        contextMenu: {
          isOpen: false,
          x: 0,
          y: 0,
          type: "server",
          itemId: null,
        },
        prefillServerDetails: null,
        inputAttachments: [],
        // Server notices popup state
        isServerNoticesPopupOpen: false,
        serverNoticesPopupMinimized: false,
        profileViewRequest: null,
        // Modal manager state
        modals: {},
        modalHistory: [],
      },
      messages: {},
      typingUsers: {},
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should complete nicknames with Tab key", async () => {
    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "al");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });

    expect(input).toHaveValue("alice: ");
  });

  it("should cycle through multiple matches on subsequent Tab presses", async () => {
    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "a");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });
    expect(input).toHaveValue("admin: ");

    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });
    expect(input).toHaveValue("alice: ");

    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });
    expect(input).toHaveValue("admin: ");
  });

  it("should add colon when completing at message start", async () => {
    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "bo");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });

    expect(input).toHaveValue("bob: ");
  });

  it("should add space when completing in middle of message", async () => {
    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "hello bo");

    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });

    expect(input).toHaveValue("hello bob ");
  });

  it("should reset completion on other key presses", async () => {
    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "al");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });

    await userEvent.type(input, "x");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });

    expect(input).toHaveValue("alice: x");
  });

  it("should not complete if no matches found", async () => {
    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "xyz");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });

    expect(input).toHaveValue("xyz");
  });

  it("should send message on Enter key", async () => {
    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "Hello everyone!");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(ircClient.sendRaw).toHaveBeenCalledWith(
      "server1",
      expect.stringContaining("PRIVMSG #general :Hello everyone!"),
    );

    expect(input).toHaveValue("");
  });

  it("should handle case-insensitive matching", async () => {
    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "BO");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });

    expect(input).toHaveValue("bob: ");
  });

  it("should handle empty channel users gracefully", async () => {
    const emptyChannel = { ...mockChannel, users: [] };
    const emptyServer = { ...mockServer, channels: [emptyChannel] };

    useStore.setState({
      servers: [emptyServer],
    });

    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "test");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });

    expect(input).toHaveValue("test");
  });

  it("should focus input after tab completion", async () => {
    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "bo");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });

    expect(input).toHaveFocus();
  });

  it("should not interfere with typing when no matches found", async () => {
    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "xyz");

    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });

    expect(input).toHaveValue("xyz");
  });

  it("should not fill input with completion when Enter is pressed while dropdown is visible", async () => {
    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "hello bo");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });

    expect(input).toHaveValue("hello bob ");

    await userEvent.type(input, "how are you?");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(input).toHaveValue("");
    expect(ircClient.sendRaw).toHaveBeenCalledWith(
      "server1",
      expect.stringContaining("PRIVMSG #general :hello bob how are you?"),
    );
  });

  it("should not move cursor when arrow keys are pressed with dropdown visible", async () => {
    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "a");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });

    expect(input).toHaveValue("admin: ");

    const initialCursorPosition = (input as HTMLInputElement).selectionStart;

    fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });

    expect((input as HTMLInputElement).selectionStart).toBe(
      initialCursorPosition,
    );

    fireEvent.keyDown(input, { key: "Up", code: "ArrowUp" });

    expect((input as HTMLInputElement).selectionStart).toBe(
      initialCursorPosition,
    );
  });

  it("should handle Enter key properly during tab completion", async () => {
    render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

    const input = screen.getByPlaceholderText(/Message #general/i);

    await userEvent.type(input, "a");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });

    expect(input).toHaveValue("admin: ");

    // Type additional text and then send message normally
    await userEvent.type(input, "hello");

    // Clear any previous calls to sendRaw
    vi.clearAllMocks();

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    // Should send the complete message
    expect(ircClient.sendRaw).toHaveBeenCalledWith(
      "server1",
      expect.stringContaining("PRIVMSG #general :admin: hello"),
    );
  });
});
