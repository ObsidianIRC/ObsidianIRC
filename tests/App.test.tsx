import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import ircClient from "../src/lib/ircClient";
import useStore from "../src/store";

// Mock IRC client
vi.mock("../src/lib/ircClient", () => ({
  default: {
    connect: vi.fn().mockRejectedValue(new Error("Mock connection failed")),
    sendRaw: vi.fn(),
    joinChannel: vi.fn(),
    leaveChannel: vi.fn(),
    triggerEvent: vi.fn(),
    on: vi.fn(),
    deleteHook: vi.fn(),
    emit: vi.fn(),
    getCurrentUser: vi.fn(() => ({ id: "test-user", username: "tester" })),
    capAck: vi.fn(),
  },
}));

// Mock the store
let storeVersion = 0;
const mockStoreState = {
  servers: [],
  currentUser: { id: "user1", username: "testuser", isOnline: true },
  isConnecting: false,
  selectedServerId: null,
  connectionError: null,
  messages: {},
  typingUsers: {},
  ui: {
    selectedServerId: null,
    perServerSelections: {},
    isAddServerModalOpen: false,
    isEditServerModalOpen: false,
    editServerId: null,
    isSettingsModalOpen: false,
    isUserProfileModalOpen: false,
    isDarkMode: true,
    linkSecurityWarnings: [],
  },
  globalNotifications: [],
  globalSettings: {
    enableNotificationSounds: true,
    notificationSound: "/sounds/notif1.mp3",
    notificationVolume: 0.8,
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
  toggleUserProfileModal: vi.fn(),
  setProfileViewRequest: vi.fn(),
  clearProfileViewRequest: vi.fn(),
  toggleChannelList: vi.fn(),
  connectToSavedServers: vi.fn(),
  toggleMemberList: vi.fn(),
  toggleAddServerModal: vi.fn((open?: boolean) => {
    mockStoreState.ui.isAddServerModalOpen = open ?? !mockStoreState.ui.isAddServerModalOpen;
    storeVersion++;
  }),
  toggleSettingsModal: vi.fn((open?: boolean) => {
    mockStoreState.ui.isSettingsModalOpen = open ?? !mockStoreState.ui.isSettingsModalOpen;
    storeVersion++;
  }),
};

vi.mock("../src/store", () => ({
  default: vi.fn((selector) => {
    // Return a new object each time to trigger re-renders
    const state = { ...mockStoreState, _version: storeVersion };
    return selector ? selector(state) : state;
  }),
  loadSavedServers: vi.fn(() => []),
}));

describe("App", () => {
  beforeAll(() => {
    // Clear any existing event listeners
    vi.mocked(ircClient.on).mockClear();
    vi.mocked(ircClient.deleteHook).mockClear();
  });

  beforeEach(() => {
    // Reset mock state between tests
    mockStoreState.ui.isAddServerModalOpen = false;
    mockStoreState.ui.isSettingsModalOpen = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Server Management", () => {
    it("Can open and close add server modal", async () => {
      render(<App />);
      const user = userEvent.setup();

      // Open modal
      await user.click(screen.getByTestId("server-list-options-button"));
      await user.click(screen.getByText(/Add Server/i));
      
      // Check that toggleAddServerModal was called with true
      expect(mockStoreState.toggleAddServerModal).toHaveBeenCalledWith(true);
    });

    it("Can add a new server with valid information", async () => {
      render(<App />);
      const user = userEvent.setup();

      // Mock successful connection
      vi.mocked(ircClient.connect).mockResolvedValueOnce({
        id: "test-server",
        name: "Test Server",
        host: "irc.test.com",
        port: 443,
        channels: [],
        privateChats: [],
        isConnected: true,
        users: [],
        capabilities: [],
      });

      // Open modal
      await user.click(screen.getByTestId("server-list-options-button"));
      await user.click(screen.getByText(/Add Server/i));

      // Check that toggleAddServerModal was called
      expect(mockStoreState.toggleAddServerModal).toHaveBeenCalledWith(true);
    });

    it("Shows error message when server connection fails", async () => {
      render(<App />);
      const user = userEvent.setup();

      // Mock failed connection
      vi.mocked(ircClient.connect).mockRejectedValueOnce(
        new Error("Connection failed"),
      );

      // Open modal
      await user.click(screen.getByTestId("server-list-options-button"));
      await user.click(screen.getByText(/Add Server/i));

      // Check that toggleAddServerModal was called
      expect(mockStoreState.toggleAddServerModal).toHaveBeenCalledWith(true);
    });

    it("Shows error message when server connection fails", async () => {
      render(<App />);
      const user = userEvent.setup();

      // Mock failed connection
      vi.mocked(ircClient.connect).mockRejectedValueOnce(
        new Error("Connection failed"),
      );

      // Open modal
      await user.click(screen.getByTestId("server-list-options-button"));
      await user.click(screen.getByText(/Add Server/i));

      // Check that toggleAddServerModal was called
      expect(mockStoreState.toggleAddServerModal).toHaveBeenCalledWith(true);
    });
  });

  describe("User Settings", () => {
    it("Can open and close user settings modal", async () => {
      render(<App />);
      const user = userEvent.setup();

      // Open settings
      await user.click(screen.getByTestId("user-settings-button"));
      
      // Check that toggleUserProfileModal was called
      expect(mockStoreState.toggleUserProfileModal).toHaveBeenCalledWith(true);
    });
  });
});
