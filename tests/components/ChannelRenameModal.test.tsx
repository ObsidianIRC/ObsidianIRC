import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChannelRenameModal from "../../src/components/ui/ChannelRenameModal";
import useStore from "../../src/store";

// Mock the store
vi.mock("../../src/store", () => ({
  default: {
    getState: vi.fn(() => ({
      ui: {
        isChannelRenameModalOpen: true,
        channelToRename: "#oldchannel",
      },
      selectedServerId: "server1",
      renameChannel: vi.fn(),
      toggleChannelRenameModal: vi.fn(),
    })),
    setState: vi.fn(),
  },
}));

describe("ChannelRenameModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders channel rename modal", () => {
    render(<ChannelRenameModal />);

    expect(screen.getByText("Rename Channel")).toBeInTheDocument();
    expect(screen.getByText("#oldchannel")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("New channel name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Reason (optional)")).toBeInTheDocument();
  });

  test("closes modal when cancel button is clicked", () => {
    const mockToggleModal = vi.fn();
    const mockStore = useStore.getState();
    mockStore.toggleChannelRenameModal = mockToggleModal;

    render(<ChannelRenameModal />);

    const cancelButton = screen.getByRole("button", { name: /Cancel/ });
    fireEvent.click(cancelButton);

    expect(mockToggleModal).toHaveBeenCalledWith(false);
  });

  test("closes modal when close button is clicked", () => {
    const mockToggleModal = vi.fn();
    const mockStore = useStore.getState();
    mockStore.toggleChannelRenameModal = mockToggleModal;

    render(<ChannelRenameModal />);

    const closeButton = screen.getByRole("button", { name: /×/ });
    fireEvent.click(closeButton);

    expect(mockToggleModal).toHaveBeenCalledWith(false);
  });

  test("renames channel when form is submitted", () => {
    const mockRenameChannel = vi.fn();
    const mockToggleModal = vi.fn();
    const mockStore = useStore.getState();
    mockStore.renameChannel = mockRenameChannel;
    mockStore.toggleChannelRenameModal = mockToggleModal;

    render(<ChannelRenameModal />);

    const newNameInput = screen.getByPlaceholderText("New channel name");
    const reasonInput = screen.getByPlaceholderText("Reason (optional)");
    const renameButton = screen.getByRole("button", { name: /Rename/ });

    fireEvent.change(newNameInput, { target: { value: "#newchannel" } });
    fireEvent.change(reasonInput, { target: { value: "Channel renamed" } });
    fireEvent.click(renameButton);

    expect(mockRenameChannel).toHaveBeenCalledWith("server1", "#oldchannel", "#newchannel", "Channel renamed");
    expect(mockToggleModal).toHaveBeenCalledWith(false);
  });

  test("renames channel without reason", () => {
    const mockRenameChannel = vi.fn();
    const mockToggleModal = vi.fn();
    const mockStore = useStore.getState();
    mockStore.renameChannel = mockRenameChannel;
    mockStore.toggleChannelRenameModal = mockToggleModal;

    render(<ChannelRenameModal />);

    const newNameInput = screen.getByPlaceholderText("New channel name");
    const renameButton = screen.getByRole("button", { name: /Rename/ });

    fireEvent.change(newNameInput, { target: { value: "#newchannel" } });
    fireEvent.click(renameButton);

    expect(mockRenameChannel).toHaveBeenCalledWith("server1", "#oldchannel", "#newchannel", undefined);
    expect(mockToggleModal).toHaveBeenCalledWith(false);
  });

  test("shows validation error for empty new name", () => {
    render(<ChannelRenameModal />);

    const renameButton = screen.getByRole("button", { name: /Rename/ });
    fireEvent.click(renameButton);

    expect(screen.getByText("New channel name is required")).toBeInTheDocument();
  });

  test("shows validation error for same name", () => {
    render(<ChannelRenameModal />);

    const newNameInput = screen.getByPlaceholderText("New channel name");
    const renameButton = screen.getByRole("button", { name: /Rename/ });

    fireEvent.change(newNameInput, { target: { value: "#oldchannel" } });
    fireEvent.click(renameButton);

    expect(screen.getByText("New channel name must be different")).toBeInTheDocument();
  });

  test("shows validation error for invalid channel name", () => {
    render(<ChannelRenameModal />);

    const newNameInput = screen.getByPlaceholderText("New channel name");
    const renameButton = screen.getByRole("button", { name: /Rename/ });

    fireEvent.change(newNameInput, { target: { value: "invalidchannel" } });
    fireEvent.click(renameButton);

    expect(screen.getByText("Channel name must start with #")).toBeInTheDocument();
  });

  test("clears validation errors when input changes", async () => {
    render(<ChannelRenameModal />);

    const newNameInput = screen.getByPlaceholderText("New channel name");
    const renameButton = screen.getByRole("button", { name: /Rename/ });

    // Trigger validation error
    fireEvent.click(renameButton);
    expect(screen.getByText("New channel name is required")).toBeInTheDocument();

    // Change input
    fireEvent.change(newNameInput, { target: { value: "#newchannel" } });

    await waitFor(() => {
      expect(screen.queryByText("New channel name is required")).not.toBeInTheDocument();
    });
  });

  test("does not render when modal is closed", () => {
    const mockStore = useStore.getState();
    mockStore.ui.isChannelRenameModalOpen = false;

    render(<ChannelRenameModal />);

    expect(screen.queryByText("Rename Channel")).not.toBeInTheDocument();
  });
});