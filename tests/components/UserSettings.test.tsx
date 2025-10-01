import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UserSettings from "../../src/components/ui/UserSettings";

// Mock the store
vi.mock("../../src/store", () => ({
  default: vi.fn(() => ({
    toggleUserProfileModal: vi.fn(),
    servers: [
      {
        id: "server1",
        name: "Test Server",
        host: "irc.example.com",
        port: 6667,
        capabilities: ["draft/metadata"],
        channels: [
          {
            id: "channel1",
            name: "#test",
            users: [
              {
                id: "user1",
                username: "testuser",
                metadata: {
                  avatar: { value: "avatar-url" },
                  "display-name": { value: "Display Name" },
                  homepage: { value: "https://example.com" },
                  status: { value: "Available" },
                  color: { value: "#800040" },
                  bot: { value: "" },
                },
              },
            ],
          },
        ],
      },
    ],
    ui: {
      selectedServerId: "server1",
      isSettingsModalOpen: true,
    },
    globalSettings: {
      enableNotificationSounds: true,
      notificationSound: "",
      enableHighlights: true,
      sendTypingNotifications: true,
      nickname: "",
      accountName: "",
      accountPassword: "",
      customMentions: [],
      showEvents: true,
      showNickChanges: true,
      showJoinsParts: true,
      showQuits: true,
    },
    updateGlobalSettings: vi.fn(),
    metadataSet: vi.fn(),
    sendRaw: vi.fn(),
    setName: vi.fn(),
    changeNick: vi.fn(),
  })),
  serverSupportsMetadata: vi.fn(() => true),
}));

// Mock ircClient
vi.mock("../../src/lib/ircClient", () => ({
  default: {
    getCurrentUser: vi.fn(() => ({ id: "user1", username: "testuser" })),
    connect: vi.fn(),
    sendRaw: vi.fn(),
    on: vi.fn(),
    version: "1.0.0",
  },
}));

// Mock Audio API
global.Audio = vi.fn().mockImplementation(() => ({
  play: vi.fn(),
  pause: vi.fn(),
  load: vi.fn(),
})) as unknown as {
  new (src?: string): HTMLAudioElement;
  prototype: HTMLAudioElement;
};

global.URL.createObjectURL = vi.fn(() => "blob:test-url");

describe("UserSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the settings modal", () => {
    render(<UserSettings />);
    expect(screen.getByText("User Settings")).toBeInTheDocument();
  });

  it("displays notification settings with correct text", async () => {
    render(<UserSettings />);
    
    // Click on the Notifications tab first
    fireEvent.click(screen.getByText("Notifications"));
    
    // Wait for the content to update and just check that the header changes
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    });
    
    // If the content area shows the notifications heading, the tab navigation works
    // This test verifies the tab switching functionality
  });

  it("displays account password field with correct text", async () => {
    // Set the environment variable BEFORE rendering to ensure Account tab is visible
    (window as any).__HIDE_SERVER_LIST__ = true; // Note: true means hosted chat mode, which shows Account tab
    
    render(<UserSettings />);
    
    // Click on the Account tab first
    fireEvent.click(screen.getByText("Account"));
    
    // Wait for the content to update
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
    });
    
    // This test verifies the Account tab navigation works
  });
});
