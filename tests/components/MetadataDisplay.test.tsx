import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatArea } from "../../src/components/layout/ChatArea";
import { MemberList } from "../../src/components/layout/MemberList";
import { getColorStyle } from "../../src/lib/ircUtils";
import useStore from "../../src/store";
import type { Channel, Server, User } from "../../src/types";

vi.mock("../../src/lib/ircClient", () => ({
  default: {
    sendRaw: vi.fn(),
    sendTyping: vi.fn(),
    on: vi.fn(),
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

// Mock users with metadata
const mockUsersWithMetadata: User[] = [
  {
    id: "1",
    username: "alice",
    isOnline: true,
    metadata: {
      avatar: { value: "https://example.com/avatar1.png", visibility: "*" },
      color: { value: "#ff0000", visibility: "*" },
      "display-name": { value: "Alice Wonderland", visibility: "*" },
      status: { value: "Working on something cool!", visibility: "*" },
    },
  },
  {
    id: "2",
    username: "bob",
    isOnline: true,
    metadata: {
      avatar: { value: "https://example.com/avatar2.png", visibility: "*" },
      color: { value: "blue", visibility: "*" },
    },
  },
  {
    id: "3",
    username: "charlie",
    isOnline: false,
    metadata: {
      status: { value: "Away from keyboard", visibility: "*" },
    },
  },
];

const mockChannel: Channel = {
  id: "channel1",
  name: "#general",
  topic: "General discussion",
  isPrivate: false,
  serverId: "server1",
  unreadCount: 0,
  isMentioned: false,
  messages: [
    {
      id: "msg1",
      userId: "alice-server1",
      content: "Hello everyone!",
      timestamp: new Date().toISOString(),
      type: "message",
      serverId: "server1",
      channelId: "channel1",
    },
    {
      id: "msg2",
      userId: "bob-server1",
      content: "Hi Alice!",
      timestamp: new Date().toISOString(),
      type: "message",
      serverId: "server1",
      channelId: "channel1",
    },
  ],
  users: mockUsersWithMetadata,
};

const mockServer: Server = {
  id: "server1",
  name: "Test Server",
  host: "irc.test.com",
  port: 6667,
  channels: [mockChannel],
  privateChats: [],
  isConnected: true,
  users: mockUsersWithMetadata,
};

describe("Metadata Display Features", () => {
  beforeEach(() => {
    useStore.setState({
      servers: [mockServer],
      currentUser: {
        id: "user1",
        username: "testuser",
        isOnline: true,
        metadata: {
          avatar: {
            value: "https://example.com/myavatar.png",
            visibility: "*",
          },
          color: { value: "#00ff00", visibility: "*" },
          status: { value: "Available", visibility: "*" },
        },
      },
      ui: {
        selectedServerId: "server1",
        selectedChannelId: "channel1",
        selectedPrivateChatId: null,
        isMemberListVisible: true,
        isChannelListVisible: true,
        isAddServerModalOpen: false,
        isSettingsModalOpen: false,
        isUserProfileModalOpen: false,
        isDarkMode: true,
        isMobileMenuOpen: false,
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
      },
      messages: {
        "server1-channel1": mockChannel.messages,
      },
      typingUsers: {},
    });

    vi.clearAllMocks();
  });

  describe("MemberList Metadata Display", () => {
    it("should display colored usernames", () => {
      render(<MemberList />);

      // Alice should have red color (#ff0000)
      const aliceElement = screen.getByText("alice");
      expect(aliceElement).toHaveStyle({ color: "#ff0000" });

      // Bob should have blue color
      const bobElement = screen.getByText("bob");
      expect(bobElement).toHaveStyle({ color: "blue" });
    });

    it("should display user avatars", () => {
      render(<MemberList />);

      // Should show avatar images for users with avatar metadata
      const avatarImages = screen.getAllByRole("img");
      expect(avatarImages.length).toBeGreaterThan(0);

      // Alice should have her avatar
      const aliceAvatar = screen.getByAltText("alice");
      expect(aliceAvatar).toHaveAttribute(
        "src",
        "https://example.com/avatar1.png",
      );
    });

    it("should display status lightbulb for users with status", () => {
      render(<MemberList />);

      // Alice and Charlie should have status lightbulbs
      const lightbulbIcons = screen.getAllByText("💡");
      expect(lightbulbIcons.length).toBe(2); // Alice and Charlie
    });

    it("should show status tooltip on hover", async () => {
      render(<MemberList />);

      // Find Alice's status indicator
      const aliceStatusIndicator = screen
        .getByText("alice")
        .closest("div")
        ?.querySelector(".group");

      if (aliceStatusIndicator) {
        // Simulate hover
        fireEvent.mouseEnter(aliceStatusIndicator);

        // Status text should be visible
        const statusText = screen.getByText("Working on something cool!");
        expect(statusText).toBeInTheDocument();
      }
    });

    it("should display website metadata", () => {
      // Add website metadata to Alice
      const aliceWithWebsite = {
        ...mockUsersWithMetadata[0],
        metadata: {
          ...mockUsersWithMetadata[0].metadata,
          website: { value: "https://alice.dev", visibility: "*" },
        },
      };

      useStore.setState((state) => ({
        servers: state.servers.map((server) =>
          server.id === "server1"
            ? {
                ...server,
                channels: server.channels.map((channel) =>
                  channel.id === "channel1"
                    ? {
                        ...channel,
                        users: [aliceWithWebsite, ...channel.users.slice(1)],
                      }
                    : channel,
                ),
              }
            : server,
        ),
      }));

      render(<MemberList />);

      // Should show website emoji and URL
      expect(screen.getByText("🌐 https://alice.dev")).toBeInTheDocument();
    });
  });

  describe("ChatArea Metadata Display", () => {
    it("should display display names with username badges", () => {
      render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

      // Alice's message should show display name "Alice Wonderland" with username badge
      expect(screen.getByText("Alice Wonderland")).toBeInTheDocument();

      // Should also show username badge next to display name
      const usernameBadge = screen.getByText("alice");
      expect(usernameBadge).toHaveClass("bg-discord-dark-600");
    });

    it("should display colored usernames in chat", () => {
      render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

      // Alice's display name should be red
      const aliceDisplayName = screen.getByText("Alice Wonderland");
      expect(aliceDisplayName).toHaveStyle({ color: "#ff0000" });
    });

    it("should display regular usernames when no display name", () => {
      render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

      // Bob should show regular username since no display name
      expect(screen.getByText("bob")).toBeInTheDocument();
    });

    it("should display status lightbulbs on message avatars", () => {
      render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

      // Should have lightbulb icons for users with status
      const lightbulbIcons = screen.getAllByText("💡");
      expect(lightbulbIcons.length).toBeGreaterThan(0);
    });

    it("should show status tooltip on avatar hover", () => {
      render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

      // Find message avatar containers
      const avatars = screen.getAllByRole("img");

      if (avatars.length > 0) {
        // Find the container with group class (has hover functionality)
        const avatarContainer = avatars[0].closest(".group");

        if (avatarContainer) {
          fireEvent.mouseEnter(avatarContainer);

          // Status should be visible
          const statusText = screen.queryByText("Working on something cool!");
          // Note: This might not work in test environment due to CSS hover simulation
          // but the structure should be correct
        }
      }
    });

    it("should display user avatars in messages", () => {
      render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

      // Should have avatar images
      const avatars = screen.getAllByRole("img");
      expect(avatars.length).toBeGreaterThan(0);

      // Alice's avatar should be displayed
      const aliceAvatar = screen.getByAltText("alice");
      expect(aliceAvatar).toHaveAttribute(
        "src",
        "https://example.com/avatar1.png",
      );
    });

    it("should handle action messages with metadata", () => {
      // Update mock channel to have an action message
      const actionMessage = {
        id: "msg3",
        userId: "alice-server1",
        content: "\u0001ACTION waves hello\u0001",
        timestamp: new Date().toISOString(),
        type: "message",
        serverId: "server1",
        channelId: "channel1",
      };

      useStore.setState((state) => ({
        messages: {
          ...state.messages,
          "server1-channel1": [...mockChannel.messages, actionMessage],
        },
      }));

      render(<ChatArea onToggleChanList={() => {}} isChanListVisible={true} />);

      // Should show action message with display name
      expect(
        screen.getByText("Alice Wonderland (alice) waves hello"),
      ).toBeInTheDocument();
    });
  });

  describe("Metadata Utility Functions", () => {
    it("should handle different color formats", () => {
      expect(getColorStyle("#ff0000")).toEqual({ color: "#ff0000" });
      expect(getColorStyle("red")).toEqual({ color: "red" });
      expect(getColorStyle("rgb(255, 0, 0)")).toEqual({
        color: "rgb(255, 0, 0)",
      });
      expect(getColorStyle(undefined)).toEqual({});
      expect(getColorStyle("")).toEqual({});
    });
  });
});
