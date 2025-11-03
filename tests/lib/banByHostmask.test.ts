import { beforeEach, describe, expect, it, vi } from "vitest";
import useStore from "../../src/store";

// Mock the ircClient module
vi.mock("../../src/lib/ircClient", () => {
  const mockSendRaw = vi.fn();
  const mockIrcClient = {
    sendRaw: mockSendRaw,
    connect: vi.fn(),
    disconnect: vi.fn(),
    joinChannel: vi.fn(),
    sendMessage: vi.fn(),
    listChannels: vi.fn(),
    changeNick: vi.fn(),
    setName: vi.fn(),
    renameChannel: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  return {
    ircClient: mockIrcClient,
    default: mockIrcClient,
  };
});

// Import after mocking
import { ircClient } from "../../src/lib/ircClient";

describe("Ban by hostmask functionality", () => {
  beforeEach(() => {
    // Reset the store state before each test
    useStore.setState({
      servers: [],
      messages: {},
    });
    vi.clearAllMocks();
  });

  it("should ban user by hostname when hostname is available in channel user list", () => {
    // Setup a server with a channel and users
    useStore.setState({
      servers: [
        {
          id: "server1",
          name: "Test Server",
          host: "irc.test.com",
          port: 6667,
          channels: [
            {
              id: "channel1",
              name: "#test",
              serverId: "server1",
              isPrivate: false,
              unreadCount: 0,
              isMentioned: false,
              messages: [],
              users: [
                {
                  id: "user1",
                  username: "testuser",
                  hostname: "example.com",
                  isOnline: true,
                },
              ],
            },
          ],
          privateChats: [],
          isConnected: true,
          users: [],
        },
      ],
    });

    // Call banUserByHostmask
    useStore
      .getState()
      .banUserByHostmask("server1", "#test", "testuser", "spam");

    // Verify the correct IRC commands were sent
    expect(ircClient.sendRaw).toHaveBeenCalledWith(
      "server1",
      "MODE #test +b *!*@example.com",
    );
    expect(ircClient.sendRaw).toHaveBeenCalledWith(
      "server1",
      "KICK #test testuser :spam",
    );
  });

  it("should ban user by hostname when hostname is available in server user list", () => {
    // Setup a server with a user in the server user list but not channel list
    useStore.setState({
      servers: [
        {
          id: "server1",
          name: "Test Server",
          host: "irc.test.com",
          port: 6667,
          channels: [
            {
              id: "channel1",
              name: "#test",
              serverId: "server1",
              isPrivate: false,
              unreadCount: 0,
              isMentioned: false,
              messages: [],
              users: [],
            },
          ],
          privateChats: [],
          isConnected: true,
          users: [
            {
              id: "user1",
              username: "testuser",
              hostname: "different.host.net",
              isOnline: true,
            },
          ],
        },
      ],
    });

    // Call banUserByHostmask
    useStore
      .getState()
      .banUserByHostmask("server1", "#test", "testuser", "bad behavior");

    // Verify the correct IRC commands were sent
    expect(ircClient.sendRaw).toHaveBeenCalledWith(
      "server1",
      "MODE #test +b *!*@different.host.net",
    );
    expect(ircClient.sendRaw).toHaveBeenCalledWith(
      "server1",
      "KICK #test testuser :bad behavior",
    );
  });

  it("should fallback to wildcard when hostname is not available", () => {
    // Setup a server with a user that has no hostname
    useStore.setState({
      servers: [
        {
          id: "server1",
          name: "Test Server",
          host: "irc.test.com",
          port: 6667,
          channels: [
            {
              id: "channel1",
              name: "#test",
              serverId: "server1",
              isPrivate: false,
              unreadCount: 0,
              isMentioned: false,
              messages: [],
              users: [
                {
                  id: "user1",
                  username: "testuser",
                  // No hostname field
                  isOnline: true,
                },
              ],
            },
          ],
          privateChats: [],
          isConnected: true,
          users: [],
        },
      ],
    });

    // Call banUserByHostmask
    useStore
      .getState()
      .banUserByHostmask("server1", "#test", "testuser", "no reason");

    // Verify the correct IRC commands were sent with wildcard fallback
    expect(ircClient.sendRaw).toHaveBeenCalledWith(
      "server1",
      "MODE #test +b *!*@*",
    );
    expect(ircClient.sendRaw).toHaveBeenCalledWith(
      "server1",
      "KICK #test testuser :no reason",
    );
  });

  it("should prioritize channel user list over server user list", () => {
    // Setup a server with the same user in both lists but different hostnames
    useStore.setState({
      servers: [
        {
          id: "server1",
          name: "Test Server",
          host: "irc.test.com",
          port: 6667,
          channels: [
            {
              id: "channel1",
              name: "#test",
              serverId: "server1",
              isPrivate: false,
              unreadCount: 0,
              isMentioned: false,
              messages: [],
              users: [
                {
                  id: "user1",
                  username: "testuser",
                  hostname: "channel-host.com", // This should be used
                  isOnline: true,
                },
              ],
            },
          ],
          privateChats: [],
          isConnected: true,
          users: [
            {
              id: "user1",
              username: "testuser",
              hostname: "server-host.com", // This should be ignored
              isOnline: true,
            },
          ],
        },
      ],
    });

    // Call banUserByHostmask
    useStore
      .getState()
      .banUserByHostmask("server1", "#test", "testuser", "test priority");

    // Verify the channel hostname was used, not the server hostname
    expect(ircClient.sendRaw).toHaveBeenCalledWith(
      "server1",
      "MODE #test +b *!*@channel-host.com",
    );
  });
});
