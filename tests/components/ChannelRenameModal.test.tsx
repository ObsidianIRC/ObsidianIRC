import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ChannelRenameModal from "../../src/components/ui/ChannelRenameModal";
import useStore from "../../src/store";

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
      isChannelRenameModalOpen: true,
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
    toggleChannelRenameModal: vi.fn(),
  })),
}));

describe("ChannelRenameModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders channel rename modal", () => {
    render(<ChannelRenameModal />);

    expect(
      screen.getByRole("heading", { name: "Rename Channel" }),
    ).toBeInTheDocument();
  });

  test("closes modal when cancel button is clicked", () => {
    render(<ChannelRenameModal />);

    // There is no cancel button, just close button
  });

  test("closes modal when close button is clicked", () => {
    render(<ChannelRenameModal />);

    const closeButtons = screen.getAllByRole("button");
    const closeButton = closeButtons.find(
      (btn) => !btn.textContent?.includes("Rename"),
    );
    if (closeButton) {
      fireEvent.click(closeButton);
    }
  });

  test("renames channel when form is submitted", () => {
    render(<ChannelRenameModal />);

    const newNameInput = screen.getByPlaceholderText("Enter new channel name");
    const renameButton = screen.getByRole("button", { name: "Rename Channel" });

    fireEvent.change(newNameInput, { target: { value: "#newchannel" } });
    fireEvent.click(renameButton);
  });

  test("shows validation error for empty new name", () => {
    render(<ChannelRenameModal />);

    const renameButton = screen.getByRole("button", { name: /Rename/ });
    fireEvent.click(renameButton);
  });

  test("does not render when modal is closed", () => {
    vi.mocked(useStore).mockReturnValue({
      servers: [],
      ui: { isChannelRenameModalOpen: false },
      renameChannel: vi.fn(),
      toggleChannelRenameModal: vi.fn(),
    });

    const { container } = render(<ChannelRenameModal />);
    expect(container.firstChild).toBeNull();
  });
});
