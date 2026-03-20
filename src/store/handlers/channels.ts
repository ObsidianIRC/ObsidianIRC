import { v4 as uuidv4 } from "uuid";
import type { StoreApi } from "zustand";
import ircClient from "../../lib/ircClient";
import type { Message } from "../../types";
import { serverSupportsMetadata } from "../helpers";
import type { AppState } from "../index";
import * as storage from "../localStorage";

export function registerChannelHandlers(store: StoreApi<AppState>): void {
  ircClient.on("MODE", ({ serverId, sender, target, modestring, modeargs }) => {
    // Handle channel mode responses
    if (target.startsWith("#")) {
      // This is a channel mode change - let the protocol handler deal with it
      // The protocol handler will update the store with list changes
      // We still update the basic mode info for the channel
      store.setState((state) => {
        const updatedServers = state.servers.map((server) => {
          if (server.id === serverId) {
            const updatedChannels = server.channels.map((channel) => {
              if (channel.name.toLowerCase() === target.toLowerCase()) {
                // Parse the modestring and modeargs to update channel modes
                // For now, we'll store the raw modestring
                return {
                  ...channel,
                  modes: modestring,
                  modeArgs: modeargs,
                };
              }
              return channel;
            });
            return { ...server, channels: updatedChannels };
          }
          return server;
        });
        return { servers: updatedServers };
      });
    } else {
      // This is a user mode change
      store.setState((state) => {
        // Check if this is the current user
        const currentUser = state.currentUser;
        if (
          currentUser &&
          currentUser.username.toLowerCase() === target.toLowerCase()
        ) {
          // Check if this is an IRC operator mode change
          const isIrcOp = modestring.includes("o");
          // Update current user's modes and IRC operator status
          return {
            currentUser: {
              ...currentUser,
              modes: modestring,
              isIrcOp: isIrcOp,
            },
          };
        }

        // If no currentUser in store, check if this MODE is for the IRC current user
        const ircCurrentUser = ircClient.getCurrentUser(serverId);
        if (
          !currentUser &&
          ircCurrentUser &&
          ircCurrentUser.username.toLowerCase() === target.toLowerCase()
        ) {
          // Check if this is an IRC operator mode change
          const isIrcOp = modestring.includes("o");
          // Set the current user with modes and IRC operator status
          return {
            currentUser: {
              ...ircCurrentUser,
              modes: modestring,
              isIrcOp: isIrcOp,
            },
          };
        }

        // Update user in server users list
        const updatedServers = state.servers.map((server) => {
          if (server.id === serverId) {
            const updatedUsers = server.users.map((user) => {
              if (user.username.toLowerCase() === target.toLowerCase()) {
                console.log(
                  "Updated user",
                  user.username,
                  "modes to",
                  modestring,
                );
                return {
                  ...user,
                  modes: modestring,
                };
              }
              return user;
            });
            return { ...server, users: updatedUsers };
          }
          return server;
        });

        return { servers: updatedServers };
      });
    }
  });

  ircClient.on(
    "RPL_BANLIST",
    ({ serverId, channel, mask, setter, timestamp }) => {
      console.log(
        `RPL_BANLIST received: serverId=${serverId}, channel=${channel}, mask=${mask}, setter=${setter}, timestamp=${timestamp}`,
      );
      store.setState((state) => {
        const updatedServers = state.servers.map((server) => {
          if (server.id === serverId) {
            const updatedChannels = server.channels.map((ch) => {
              if (ch.name === channel) {
                const bans = ch.bans || [];
                // Add the ban if it doesn't already exist
                if (!bans.some((ban) => ban.mask === mask)) {
                  bans.push({ mask, setter, timestamp });
                  console.log(`Added ban to channel ${channel}:`, {
                    mask,
                    setter,
                    timestamp,
                  });
                } else {
                  console.log(
                    `Ban already exists for channel ${channel}:`,
                    mask,
                  );
                }
                return { ...ch, bans };
              }
              return ch;
            });
            return { ...server, channels: updatedChannels };
          }
          return server;
        });
        return { servers: updatedServers };
      });
    },
  );

  ircClient.on(
    "RPL_INVITELIST",
    ({ serverId, channel, mask, setter, timestamp }) => {
      console.log(
        `RPL_INVITELIST received: serverId=${serverId}, channel=${channel}, mask=${mask}, setter=${setter}, timestamp=${timestamp}`,
      );
      store.setState((state) => {
        const updatedServers = state.servers.map((server) => {
          if (server.id === serverId) {
            const updatedChannels = server.channels.map((ch) => {
              if (ch.name === channel) {
                const invites = ch.invites || [];
                // Add the invite if it doesn't already exist
                if (!invites.some((invite) => invite.mask === mask)) {
                  invites.push({ mask, setter, timestamp });
                  console.log(`Added invite to channel ${channel}:`, {
                    mask,
                    setter,
                    timestamp,
                  });
                } else {
                  console.log(
                    `Invite already exists for channel ${channel}:`,
                    mask,
                  );
                }
                return { ...ch, invites };
              }
              return ch;
            });
            return { ...server, channels: updatedChannels };
          }
          return server;
        });
        return { servers: updatedServers };
      });
    },
  );

  ircClient.on(
    "RPL_EXCEPTLIST",
    ({ serverId, channel, mask, setter, timestamp }) => {
      console.log(
        `RPL_EXCEPTLIST received: serverId=${serverId}, channel=${channel}, mask=${mask}, setter=${setter}, timestamp=${timestamp}`,
      );
      store.setState((state) => {
        const updatedServers = state.servers.map((server) => {
          if (server.id === serverId) {
            const updatedChannels = server.channels.map((ch) => {
              if (ch.name === channel) {
                const exceptions = ch.exceptions || [];
                // Add the exception if it doesn't already exist
                if (!exceptions.some((exception) => exception.mask === mask)) {
                  exceptions.push({ mask, setter, timestamp });
                  console.log(`Added exception to channel ${channel}:`, {
                    mask,
                    setter,
                    timestamp,
                  });
                } else {
                  console.log(
                    `Exception already exists for channel ${channel}:`,
                    mask,
                  );
                }
                return { ...ch, exceptions };
              }
              return ch;
            });
            return { ...server, channels: updatedChannels };
          }
          return server;
        });
        return { servers: updatedServers };
      });
    },
  );

  ircClient.on("RPL_ENDOFBANLIST", ({ serverId, channel }) => {
    // Ban list loading is complete - could trigger UI updates if needed
    console.log(`Ban list loaded for ${channel} on server ${serverId}`);
  });

  ircClient.on("RPL_ENDOFINVITELIST", ({ serverId, channel }) => {
    // Invite list loading is complete - could trigger UI updates if needed
    console.log(`Invite list loaded for ${channel} on server ${serverId}`);
  });

  ircClient.on("RPL_YOUREOPER", ({ serverId, message }) => {
    // Show notification that user is now an IRC operator
    store.getState().addGlobalNotification({
      type: "note",
      command: "Oper",
      code: "OPER",
      message: "You are an IRC Operator",
      serverId,
    });
  });

  ircClient.on("RPL_YOURHOST", ({ serverId, serverName, version }) => {
    // Check if the server is running UnrealIRCd
    const isUnrealIRCd = version.includes("UnrealIRCd");

    // Update the server with the UnrealIRCd information
    store.setState((state) => ({
      servers: state.servers.map((server) =>
        server.id === serverId ? { ...server, isUnrealIRCd } : server,
      ),
    }));
  });

  // Topic handlers
  ircClient.on("TOPIC", ({ serverId, channelName, topic, sender }) => {
    store.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((channel) => {
            if (channel.name.toLowerCase() === channelName.toLowerCase()) {
              return { ...channel, topic };
            }
            return channel;
          });
          return { ...server, channels: updatedChannels };
        }
        return server;
      });
      return { servers: updatedServers };
    });

    // Optionally add a system message showing the topic change
    const server = store.getState().servers.find((s) => s.id === serverId);
    const channel = server?.channels.find((c) => c.name === channelName);
    if (channel) {
      const topicMessage: Message = {
        id: `topic-${Date.now()}`,
        channelId: channel.id,
        userId: sender,
        content: `changed the topic to: ${topic}`,
        timestamp: new Date(),
        serverId: serverId,
        reactions: [],
        type: "system",
        replyMessage: null,
        mentioned: [],
      };

      const key = `${serverId}-${channel.id}`;
      store.setState((state) => ({
        messages: {
          ...state.messages,
          [key]: [...(state.messages[key] || []), topicMessage],
        },
      }));
    }
  });

  ircClient.on("RPL_TOPIC", ({ serverId, channelName, topic }) => {
    // Skip entirely when the topic hasn't changed — servers.map() always returns a new
    // array reference, so calling setState unconditionally floods React with no-op updates.
    const existing = store
      .getState()
      .servers.find((s) => s.id === serverId)
      ?.channels.find(
        (ch) => ch.name.toLowerCase() === channelName.toLowerCase(),
      );
    if (existing?.topic === topic) return;

    store.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((channel) => {
            if (channel.name.toLowerCase() === channelName.toLowerCase()) {
              return { ...channel, topic };
            }
            return channel;
          });
          return { ...server, channels: updatedChannels };
        }
        return server;
      });
      return { servers: updatedServers };
    });
  });

  ircClient.on(
    "RPL_TOPICWHOTIME",
    ({ serverId, channelName, setter, timestamp }) => {
      // This provides metadata about who set the topic and when
      // We could store this if we extend the Channel interface
      console.log(
        `Topic for ${channelName} was set by ${setter} at ${new Date(
          timestamp * 1000,
        ).toISOString()}`,
      );
    },
  );

  ircClient.on("RPL_NOTOPIC", ({ serverId, channelName }) => {
    store.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((channel) => {
            if (channel.name.toLowerCase() === channelName.toLowerCase()) {
              return { ...channel, topic: undefined };
            }
            return channel;
          });
          return { ...server, channels: updatedChannels };
        }
        return server;
      });
      return { servers: updatedServers };
    });
  });

  ircClient.on("LIST_CHANNEL", ({ serverId, channel, userCount, topic }) => {
    store.setState((state) => {
      if (!state.listingInProgress[serverId]) {
        // Not currently listing, ignore
        return {};
      }
      const currentBuffer = state.channelListBuffer[serverId] || [];
      const updatedBuffer = [...currentBuffer, { channel, userCount, topic }];
      return {
        channelListBuffer: {
          ...state.channelListBuffer,
          [serverId]: updatedBuffer,
        },
      };
    });
  });

  ircClient.on("LIST_END", ({ serverId }) => {
    // Move buffered channels to the main list and set listing as complete
    store.setState((state) => ({
      channelList: {
        ...state.channelList,
        [serverId]: state.channelListBuffer[serverId] || [],
      },
      channelListBuffer: {
        ...state.channelListBuffer,
        [serverId]: [],
      },
      listingInProgress: {
        ...state.listingInProgress,
        [serverId]: false,
      },
    }));
  });

  ircClient.on("NAMES", ({ serverId, channelName, users }) => {
    store.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((channel) => {
            if (channel.name.toLowerCase() === channelName.toLowerCase()) {
              // Add users from NAMES reply to the channel
              const existingUsernames = new Set(
                channel.users.map((u) => u.username.toLowerCase()),
              );

              const newUsers = users
                .filter(
                  (user) => !existingUsernames.has(user.username.toLowerCase()),
                )
                .map((user) => {
                  // Check if we already have metadata for this user from localStorage or other channels
                  let existingMetadata = {};

                  // First check localStorage
                  const savedMetadata = storage.metadata.load();
                  const serverMetadata = savedMetadata[serverId];
                  if (serverMetadata?.[user.username]) {
                    existingMetadata = { ...serverMetadata[user.username] };
                  }

                  // Then check if user exists in other channels and has metadata
                  if (Object.keys(existingMetadata).length === 0) {
                    for (const otherChannel of server.channels) {
                      if (
                        otherChannel.name.toLowerCase() !==
                        channelName.toLowerCase()
                      ) {
                        const existingUser = otherChannel.users.find(
                          (u) =>
                            u.username.toLowerCase() ===
                            user.username.toLowerCase(),
                        );
                        if (
                          existingUser?.metadata &&
                          Object.keys(existingUser.metadata).length > 0
                        ) {
                          existingMetadata = { ...existingUser.metadata };
                          break;
                        }
                      }
                    }
                  }

                  return {
                    ...user,
                    id: uuidv4(),
                    isOnline: true,
                    metadata: existingMetadata,
                  };
                });

              return {
                ...channel,
                users: [...channel.users, ...newUsers],
              };
            }
            return channel;
          });

          return {
            ...server,
            channels: updatedChannels,
          };
        }
        return server;
      });

      // Request metadata for users who don't have it yet
      if (serverSupportsMetadata(state, serverId)) {
        const serverData = state.servers.find((s) => s.id === serverId);
        const channelData = serverData?.channels.find(
          (c) => c.name.toLowerCase() === channelName.toLowerCase(),
        );

        if (channelData) {
          // Request metadata for users who don't have it
          channelData.users.forEach((user) => {
            const hasMetadata =
              user.metadata && Object.keys(user.metadata).length > 0;
            if (!hasMetadata) {
              store.getState().metadataList(serverId, user.username);
            }
          });
        }
      }

      // Check if current user has operator status in this channel and update their modes
      const currentUser = state.currentUser;
      if (currentUser) {
        const currentUserInChannel = users.find(
          (user) =>
            user.username.toLowerCase() === currentUser.username.toLowerCase(),
        );
        if (currentUserInChannel?.status) {
          // Check if user has operator status (contains '@' or other operator prefixes)
          const hasOperatorStatus =
            currentUserInChannel.status.includes("@") ||
            currentUserInChannel.status.includes("~") ||
            currentUserInChannel.status.includes("&");
          if (
            hasOperatorStatus &&
            (!currentUser.modes || !currentUser.modes.includes("o"))
          ) {
            // Update currentUser with operator modes
            return {
              servers: updatedServers,
              currentUser: {
                ...currentUser,
                modes: currentUser.modes ? `${currentUser.modes}o` : "o",
              },
            };
          }
        }
      }

      return { servers: updatedServers };
    });
  });
}
