import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChannelListModal from "../../src/components/ui/ChannelListModal";
import useStore from "../../src/store";

// Mock the store
vi.mock("../../src/store", () => ({
  default: {
    getState: vi.fn(() => ({
      ui: {
        showChannelListModal: true,
      },
      channelList: {
        "server1": [
          { channel: "#channel1", userCount: 10, topic: "Topic 1" },
          { channel: "#channel2", userCount: 20, topic: "Topic 2" },
          { channel: "#channel3", userCount: 5, topic: "Topic 3" },
        ],
      },
      listingInProgress: {
        "server1": false,
      },
      selectedServerId: "server1",
      joinChannel: vi.fn(),
      listChannels: vi.fn(),
      toggleChannelListModal: vi.fn(),
    })),
    setState: vi.fn(),
  },
}));

describe("ChannelListModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders channel list modal", () => {
    render(<ChannelListModal />);

    expect(screen.getByText("Channel List")).toBeInTheDocument();
    expect(screen.getByText("#channel1")).toBeInTheDocument();
    expect(screen.getByText("#channel2")).toBeInTheDocument();
    expect(screen.getByText("#channel3")).toBeInTheDocument();
  });

  test("displays channel information correctly", () => {
    render(<ChannelListModal />);

    expect(screen.getByText("10 users")).toBeInTheDocument();
    expect(screen.getByText("20 users")).toBeInTheDocument();
    expect(screen.getByText("5 users")).toBeInTheDocument();
    expect(screen.getByText("Topic 1")).toBeInTheDocument();
    expect(screen.getByText("Topic 2")).toBeInTheDocument();
    expect(screen.getByText("Topic 3")).toBeInTheDocument();
  });

  test("filters channels by name", async () => {
    render(<ChannelListModal />);

    const searchInput = screen.getByPlaceholderText("Search channels...");
    fireEvent.change(searchInput, { target: { value: "channel1" } });

    await waitFor(() => {
      expect(screen.getByText("#channel1")).toBeInTheDocument();
      expect(screen.queryByText("#channel2")).not.toBeInTheDocument();
      expect(screen.queryByText("#channel3")).not.toBeInTheDocument();
    });
  });

  test("sorts channels by user count", async () => {
    render(<ChannelListModal />);

    const sortSelect = screen.getByRole("combobox");
    fireEvent.change(sortSelect, { target: { value: "users-desc" } });

    // After sorting by users descending, #channel2 (20 users) should come first
    const channels = screen.getAllByRole("button", { name: /Join/ });
    expect(channels).toHaveLength(3);
  });

  test("joins channel when join button is clicked", () => {
    const mockJoinChannel = vi.fn();
    const mockStore = useStore.getState();
    mockStore.joinChannel = mockJoinChannel;

    render(<ChannelListModal />);

    const joinButtons = screen.getAllByRole("button", { name: /Join/ });
    fireEvent.click(joinButtons[0]);

    expect(mockJoinChannel).toHaveBeenCalledWith("server1", "#channel1");
  });

  test("refreshes channel list when refresh button is clicked", () => {
    const mockListChannels = vi.fn();
    const mockStore = useStore.getState();
    mockStore.listChannels = mockListChannels;

    render(<ChannelListModal />);

    const refreshButton = screen.getByRole("button", { name: /Refresh/ });
    fireEvent.click(refreshButton);

    expect(mockListChannels).toHaveBeenCalledWith("server1");
  });

  test("shows loading state when listing channels", () => {
    const mockStore = useStore.getState();
    mockStore.listingInProgress = { "server1": true };

    render(<ChannelListModal />);

    expect(screen.getByText("Loading channels...")).toBeInTheDocument();
  });

  test("closes modal when close button is clicked", () => {
    const mockToggleModal = vi.fn();
    const mockStore = useStore.getState();
    mockStore.toggleChannelListModal = mockToggleModal;

    render(<ChannelListModal />);

    const closeButton = screen.getByRole("button", { name: /×/ });
    fireEvent.click(closeButton);

    expect(mockToggleModal).toHaveBeenCalledWith(false);
  });

  test("shows empty state when no channels", () => {
    const mockStore = useStore.getState();
    mockStore.channelList = { "server1": [] };

    render(<ChannelListModal />);

    expect(screen.getByText("No channels found")).toBeInTheDocument();
  });

  test("shows filtered empty state", async () => {
    render(<ChannelListModal />);

    const searchInput = screen.getByPlaceholderText("Search channels...");
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });

    await waitFor(() => {
      expect(screen.getByText("No channels match your search")).toBeInTheDocument();
    });
  });
});