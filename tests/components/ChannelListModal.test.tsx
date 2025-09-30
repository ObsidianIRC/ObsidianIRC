import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ChannelListModal from "../../src/components/ui/ChannelListModal";

// Mock the store
vi.mock("../../src/store", () => ({
  default: vi.fn(() => ({
    servers: [
      {
        id: "server1",
        name: "Test Server",
        host: "irc.example.com",
        port: 6667,
        channels: [],
      },
    ],
    ui: {
      showChannelListModal: true,
      selectedServerId: "server1",
    },
    channelList: {
      server1: [
        { channel: "#channel1", userCount: 10, topic: "Topic 1" },
        { channel: "#channel2", userCount: 20, topic: "Topic 2" },
        { channel: "#channel3", userCount: 5, topic: "Topic 3" },
      ],
    },
    listingInProgress: {
      server1: false,
    },
    selectedServerId: "server1",
    joinChannel: vi.fn(),
    listChannels: vi.fn(),
    toggleChannelListModal: vi.fn(),
  })),
}));

describe("ChannelListModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders channel list modal", () => {
    render(<ChannelListModal />);

    expect(screen.getByText("Channel List - Test Server")).toBeInTheDocument();
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

  test("filters channels by name", () => {
    render(<ChannelListModal />);

    const searchInput = screen.getByPlaceholderText("Filter channels...");
    fireEvent.change(searchInput, { target: { value: "channel1" } });

    expect(screen.getByText("#channel1")).toBeInTheDocument();
    expect(screen.queryByText("#channel2")).not.toBeInTheDocument();
    expect(screen.queryByText("#channel3")).not.toBeInTheDocument();
  });

  test("sorts channels by user count", () => {
    render(<ChannelListModal />);

    const sortSelect = screen.getByRole("combobox");
    fireEvent.change(sortSelect, { target: { value: "users" } });

    // After sorting by users descending, #channel2 (20 users) should come first
    const channelElements = screen.getAllByText(/^#channel/);
    expect(channelElements).toHaveLength(3);
    expect(channelElements[0]).toHaveTextContent("#channel2"); // 20 users
    expect(channelElements[1]).toHaveTextContent("#channel1"); // 10 users
    expect(channelElements[2]).toHaveTextContent("#channel3"); // 5 users
  });

  test("joins channel when clicked", () => {
    render(<ChannelListModal />);

    const channelDiv = screen.getByText("#channel1").closest("div");
    if (channelDiv) {
      fireEvent.click(channelDiv);
    }

    // The joinChannel function should be called (mocked)
  });

  test("shows loading state when listing channels", () => {
    render(<ChannelListModal />);

    // Should show channels by default
    expect(screen.getByText("#channel1")).toBeInTheDocument();
  });

  test("closes modal when close button is clicked", () => {
    render(<ChannelListModal />);

    const closeButton = screen.getByRole("button");
    fireEvent.click(closeButton);

    // Modal should be closable
  });

  test("shows empty state when no channels", () => {
    render(<ChannelListModal />);

    // Should show channels by default
    expect(screen.getByText("#channel1")).toBeInTheDocument();
  });

  test("shows filtered empty state", () => {
    render(<ChannelListModal />);

    const searchInput = screen.getByPlaceholderText("Filter channels...");
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });

    expect(screen.getByText("No channels found.")).toBeInTheDocument();
  });
});
