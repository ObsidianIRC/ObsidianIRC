import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import ircClient from "../src/lib/ircClient";
import useStore from "../src/store";

// Mock IRC client
vi.mock("../src/lib/ircClient", () => ({
  default: {
    connect: vi.fn(),
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

describe("App", () => {
  beforeAll(() => {
    // Clear any existing event listeners
    vi.mocked(ircClient.on).mockClear();
    vi.mocked(ircClient.deleteHook).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Reset store state to prevent test interference
    useStore.setState({
      servers: [],
      currentUser: null,
      isConnecting: false,
      selectedServerId: null,
      connectionError: null,
      messages: {},
      typingUsers: {},
      ui: {
        selectedServerId: null,
        perServerSelections: {},
        isAddServerModalOpen: false,
        isSettingsModalOpen: false,
        isUserProfileModalOpen: false,
        isDarkMode: true,
        isMobileMenuOpen: false,
        isMemberListVisible: true,
        isChannelListVisible: true,
        isChannelListModalOpen: false,
        isChannelRenameModalOpen: false,
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
      },
      globalNotifications: [],
      globalSettings: {
        enableNotifications: true,
        notificationSound: "pop",
        notificationVolume: 0.8,
        enableNotificationSounds: true,
        enableHighlights: true,
        sendTypingNotifications: true,
        showEvents: true,
        showNickChanges: true,
        showJoinsParts: true,
        showQuits: true,
        showKicks: true,
        customMentions: [],
        ignoreList: ["HistServ!*@*"],
        nickname: "",
        accountName: "",
        accountPassword: "",
        enableMultilineInput: true,
        multilineOnShiftEnter: true,
        autoFallbackToSingleLine: true,
        showSafeMedia: true,
        showExternalContent: false,
      },
    });
  });

  describe("Server Management", () => {
    it("Can open and close add server modal", async () => {
      render(<App />);
      const user = userEvent.setup();

      // Open modal
      await user.click(screen.getByTestId("server-list-options-button"));
      await user.click(screen.getByText(/Add Server/i));
      expect(screen.getByText(/Add IRC Server/i)).toBeInTheDocument();

      // Close modal
      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(screen.queryByText(/Add IRC Server/i)).not.toBeInTheDocument();
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

      // Open modal and fill form
      await user.click(screen.getByTestId("server-list-options-button"));
      await user.click(screen.getByText(/Add Server/i));

      const nameField = screen.getByPlaceholderText(/ExampleNET/i);
      await user.clear(nameField);
      await user.type(nameField, "Test Server");
      const hostField = screen.getByPlaceholderText(/irc.example.com/i);
      await user.clear(hostField);
      await user.type(hostField, "irc.test.com");
      const portField = screen.getByPlaceholderText("443");
      await user.clear(portField);
      await user.type(portField, "443");
      const nicknameField = screen.getByPlaceholderText(/YourNickname/i);
      await user.clear(nicknameField);
      await user.type(nicknameField, "tester");
      const accountCheckbox = screen.getByText(/Login to an account/i);
      await user.click(accountCheckbox);
      const saslPassword = screen.getByPlaceholderText(/Password/i);
      await user.clear(saslPassword);
      await user.type(saslPassword, "super awesome password lmao 123 !?!?!");

      // Submit form
      await user.click(screen.getByRole("button", { name: /^connect$/i }));

      // Verify connection attempt
      expect(ircClient.connect).toHaveBeenCalledWith(
        "Test Server",
        "irc.test.com",
        443,
        "tester",
        "",
        "tester",
        "c3VwZXIgYXdlc29tZSBwYXNzd29yZCBsbWFvIDEyMyAhPyE/IQ==",
        undefined,
      );
    });

    it("Shows error message when server connection fails", async () => {
      render(<App />);
      const user = userEvent.setup();

      // Mock failed connection
      vi.mocked(ircClient.connect).mockRejectedValueOnce(
        new Error("Connection failed"),
      );

      // Open modal and fill form
      await user.click(screen.getByTestId("server-list-options-button"));
      await user.click(screen.getByText(/Add Server/i));

      // Wait for modal to be open
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ExampleNET/i)).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText(/ExampleNET/i),
        "Test Server",
      );
      await user.type(
        screen.getByPlaceholderText(/irc.example.com/i),
        "irc.test.com",
      );
      await user.type(screen.getByPlaceholderText("443"), "443");

      // Submit form
      await user.click(screen.getByRole("button", { name: /^connect$/i }));

      // Verify error message appears after async connection failure
      await waitFor(() => {
        expect(screen.getByText("Connection failed")).toBeInTheDocument();
      });
    });
  });

  describe("User Settings", () => {
    it("Can open and close user settings modal", async () => {
      render(<App />);
      const user = userEvent.setup();

      // Setup initial state with a user
      useStore.setState({
        currentUser: { id: "user1", username: "testuser", isOnline: true },
      });

      // Open settings
      await user.click(screen.getByTestId("user-settings-button"));
      expect(screen.getByText(/User Settings/i)).toBeInTheDocument();

      // Close settings
      const cancelButtons = screen.getAllByRole("button", { name: /cancel/i });
      // Find the cancel button in the User Settings modal (should be the second one)
      const userSettingsCancel =
        cancelButtons.find(
          (button) =>
            button.closest('[data-testid="user-settings-modal"]') ||
            (button.textContent === "Cancel" &&
              button.classList.contains("bg-discord-dark-400")),
        ) || cancelButtons[1]; // fallback to second cancel button
      await user.click(userSettingsCancel);
      expect(screen.queryByText(/User Settings/i)).not.toBeInTheDocument();
    });
  });
});
