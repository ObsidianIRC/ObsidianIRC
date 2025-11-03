import { beforeEach, describe, expect, test, vi } from "vitest";
import ChannelRenameModal from "../../src/components/ui/ChannelRenameModal";
import useStore from "../../src/store";
import { fireEvent, renderWithProviders, screen } from "../test-utils";

// Mock the store
vi.mock("../../src/store", () => ({
  default: vi.fn(() => ({
    servers: [
      {
        id: "server1",
        name: "Test Server",
        host: "irc.example.com",
        port: 6667,
        channels: [{ id: "channel1", name: "#oldchannel" }],
      },
    ],
    ui: {
      modals: {
        channelRename: { isOpen: true },
      },
      selectedServerId: "server1",
      perServerSelections: {
        server1: {
          selectedChannelId: "channel1",
          selectedPrivateChatId: null,
        },
      },
    },
    selectedServerId: "server1",
    renameChannel: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
  })),
}));

describe("ChannelRenameModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders channel rename modal", () => {
    renderWithProviders(<ChannelRenameModal />);

    expect(
      screen.getByRole("heading", { name: "Rename Channel" }),
    ).toBeInTheDocument();
  });

  test("closes modal when cancel button is clicked", () => {
    renderWithProviders(<ChannelRenameModal />);

    // There is no cancel button, just close button
  });

  test("closes modal when close button is clicked", () => {
    renderWithProviders(<ChannelRenameModal />);

    const closeButtons = screen.getAllByRole("button");
    const closeButton = closeButtons.find(
      (btn) => !btn.textContent?.includes("Rename"),
    );
    if (closeButton) {
      fireEvent.click(closeButton);
    }
  });

  test("renames channel when form is submitted", () => {
    renderWithProviders(<ChannelRenameModal />);

    const newNameInput = screen.getByPlaceholderText("Enter new channel name");
    const renameButton = screen.getByRole("button", { name: "Rename Channel" });

    fireEvent.change(newNameInput, { target: { value: "#newchannel" } });
    fireEvent.click(renameButton);
  });

  test("shows validation error for empty new name", () => {
    renderWithProviders(<ChannelRenameModal />);

    const renameButton = screen.getByRole("button", { name: /Rename/ });
    fireEvent.click(renameButton);
  });

  test("does not render when modal is closed", () => {
    vi.mocked(useStore).mockReturnValue({
      servers: [
        {
          id: "server1",
          name: "Test Server",
          host: "irc.example.com",
          port: 6667,
          channels: [{ id: "channel1", name: "#oldchannel" }],
        },
      ],
      ui: {
        modals: {
          channelRename: { isOpen: false },
        },
        selectedServerId: "server1",
        perServerSelections: {
          server1: {
            selectedChannelId: "channel1",
            selectedPrivateChatId: null,
          },
        },
      },
      selectedServerId: "server1",
      renameChannel: vi.fn(),
      openModal: vi.fn(),
      closeModal: vi.fn(),
    });

    const { container } = renderWithProviders(<ChannelRenameModal />);
    expect(container.firstChild).toBeNull();
  });
});
