import { render, screen } from "@testing-library/react";
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
    off: vi.fn(),
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
      vi.mocked(ircClient.connect).mockResolvedValueOnce();

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
        "irc.test.com",
        443,
        "tester",
        "",
        "",
        "c3VwZXIgYXdlc29tZSBwYXNzd29yZCBsbWFvIDEyMyAhPyE/IQ==",
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

      // Verify error message
      expect(screen.getByText("Connection failed")).toBeInTheDocument();
    });
  });

  describe("User Settings", () => {
    it("Can open and close user settings modal", async () => {
      render(<App />);
      const user = userEvent.setup();

      // Setup initial state with a user
      useStore.setState({
        currentUser: { id: "user1", username: "testuser" },
      });

      // Open settings
      await user.click(screen.getByTestId("user-settings-button"));
      expect(screen.getByText(/User Settings/i)).toBeInTheDocument();

      // Close settings
      await user.click(screen.getByRole("button", { name: /close/i }));
      expect(screen.queryByText(/User Settings/i)).not.toBeInTheDocument();
    });
  });
});
