import { v4 as uuidv4 } from "uuid";
import type { StoreApi } from "zustand";
import ircClient from "../../lib/ircClient";
import type { Message, User } from "../../types";
import { generateDeterministicId, getCurrentSelection } from "../helpers";
import type { AppState } from "../index";

export function registerUserHandlers(store: StoreApi<AppState>): void {
  ircClient.on(
    "JOIN",
    ({ serverId, username, channelName, batchTag, account, realname }) => {
      // If part of a netsplit/netjoin batch, defer to batch handler
      if (batchTag) {
        const state = store.getState();
        const batch = state.activeBatches[serverId]?.[batchTag];
        if (batch) {
          batch.events.push({
            type: "JOIN",
            data: { serverId, username, channelName, account, realname },
          });
          return;
        }
      }

      const ourNick = ircClient.getNick(serverId);
      const isOurJoin = username === ourNick;

      if (isOurJoin) {
        // Ensure the channel exists in the store; joinChannel action usually handles this,
        // but this catches cases where the server JOIN confirmation arrives without a prior joinChannel call
        store.setState((state) => {
          const server = state.servers.find((s) => s.id === serverId);
          if (!server) return {};

          const exists = server.channels.some(
            (c) => c.name.toLowerCase() === channelName.toLowerCase(),
          );
          if (exists) return {};

          return {
            servers: state.servers.map((s) => {
              if (s.id !== serverId) return s;
              return {
                ...s,
                channels: [
                  ...s.channels,
                  {
                    id: generateDeterministicId(serverId, channelName),
                    name: channelName,
                    isPrivate: false,
                    serverId,
                    unreadCount: 0,
                    isMentioned: false,
                    messages: [],
                    users: [],
                    needsWhoRequest: true,
                  },
                ],
              };
            }),
          };
        });
        return;
      }

      // Another user joined — add them to the channel
      store.setState((state) => {
        const updatedServers = state.servers.map((server) => {
          if (server.id !== serverId) return server;

          const updatedChannels = server.channels.map((channel) => {
            if (channel.name.toLowerCase() !== channelName.toLowerCase())
              return channel;

            const alreadyIn = channel.users.some(
              (u) => u.username.toLowerCase() === username.toLowerCase(),
            );
            if (alreadyIn) return channel;

            const newUser: User = {
              id: uuidv4(),
              username,
              isOnline: true,
              account: account || undefined,
              realname: realname || undefined,
            };

            return { ...channel, users: [...channel.users, newUser] };
          });

          return { ...server, channels: updatedChannels };
        });

        return { servers: updatedServers };
      });

      // Show join message if enabled
      const state = store.getState();
      if (
        state.globalSettings.showEvents &&
        state.globalSettings.showJoinsParts
      ) {
        const server = state.servers.find((s) => s.id === serverId);
        const channel = server?.channels.find(
          (c) => c.name.toLowerCase() === channelName.toLowerCase(),
        );
        if (channel) {
          const joinMessage: Message = {
            id: uuidv4(),
            type: "join",
            content: `joined ${channelName}`,
            timestamp: new Date(),
            userId: username,
            channelId: channel.id,
            serverId,
            reactions: [],
            replyMessage: null,
            mentioned: [],
          };
          const key = `${serverId}-${channel.id}`;
          store.setState((s) => ({
            messages: {
              ...s.messages,
              [key]: [...(s.messages[key] || []), joinMessage],
            },
          }));
        }
      }
    },
  );

  // Handle user changing their nickname
  ircClient.on("NICK", ({ serverId, oldNick, newNick }) => {
    store.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((channel) => {
            const updatedUsers = channel.users.map((user) => {
              if (user.username === oldNick) {
                return { ...user, username: newNick }; // Update the username
              }
              return user;
            });
            return { ...channel, users: updatedUsers };
          });
          return { ...server, channels: updatedChannels };
        }
        return server;
      });

      // Update currentUser only if this nick change is for the currently selected server
      // and it's our own nick that changed
      let updatedCurrentUser = state.currentUser;
      const isSelectedServer = state.ui.selectedServerId === serverId;
      const serverCurrentUser = ircClient.getCurrentUser(serverId);
      const isOurNick =
        serverCurrentUser?.username === oldNick ||
        serverCurrentUser?.username === newNick;

      if (
        isSelectedServer &&
        isOurNick &&
        state.currentUser &&
        state.currentUser.username === oldNick
      ) {
        updatedCurrentUser = { ...state.currentUser, username: newNick };
      }

      return {
        servers: updatedServers,
        currentUser: updatedCurrentUser,
      };
    });

    // Add nick change messages to all channels where the user was present
    const state = store.getState();
    const server = state.servers.find((s) => s.id === serverId);
    if (
      server &&
      state.globalSettings.showEvents &&
      state.globalSettings.showNickChanges
    ) {
      // Check if this was our own nick change
      const ourNick = ircClient.getNick(serverId);
      const isOurNickChange = oldNick === ourNick || newNick === ourNick;

      // Add message to each channel where the user was present
      server.channels.forEach((channel) => {
        const userWasInChannel = channel.users.some(
          (user) => user.username === newNick,
        );
        if (userWasInChannel) {
          const nickChangeMessage: Message = {
            id: uuidv4(),
            type: "nick",
            content: isOurNickChange
              ? `are now known as **${newNick}**`
              : `is now known as **${newNick}**`,
            timestamp: new Date(),
            userId: oldNick, // Use the old nick as the user ID for nick changes
            channelId: channel.id,
            serverId: serverId,
            reactions: [],
            replyMessage: null,
            mentioned: [],
          };

          const key = `${serverId}-${channel.id}`;
          store.setState((state) => ({
            messages: {
              ...state.messages,
              [key]: [...(state.messages[key] || []), nickChangeMessage],
            },
          }));
        }
      });

      // Also add to private chat if we have one open with this user
      const privateChat = server.privateChats?.find(
        (pc) =>
          pc.username.toLowerCase() === oldNick.toLowerCase() ||
          pc.username.toLowerCase() === newNick.toLowerCase(),
      );
      if (privateChat) {
        // Update the private chat username
        store.setState((state) => {
          const updatedServers = state.servers.map((s) => {
            if (s.id === serverId) {
              const updatedPrivateChats = s.privateChats?.map((pc) => {
                if (pc.username.toLowerCase() === oldNick.toLowerCase()) {
                  return { ...pc, username: newNick };
                }
                return pc;
              });
              return { ...s, privateChats: updatedPrivateChats };
            }
            return s;
          });
          return { servers: updatedServers };
        });

        // Add nick change message to private chat
        const nickChangeMessage: Message = {
          id: uuidv4(),
          type: "nick",
          content: isOurNickChange
            ? `are now known as **${newNick}**`
            : `is now known as **${newNick}**`,
          timestamp: new Date(),
          userId: oldNick,
          channelId: privateChat.id,
          serverId: serverId,
          reactions: [],
          replyMessage: null,
          mentioned: [],
        };

        const key = `${serverId}-${privateChat.id}`;
        store.setState((state) => ({
          messages: {
            ...state.messages,
            [key]: [...(state.messages[key] || []), nickChangeMessage],
          },
        }));
      }

      // Note: IRC client already handles updating its internal nick storage
    }
  });

  ircClient.on("QUIT", ({ serverId, username, reason, batchTag }) => {
    // If this event is part of a batch, store it for later processing
    if (batchTag) {
      const state = store.getState();
      const batch = state.activeBatches[serverId]?.[batchTag];
      if (batch) {
        batch.events.push({
          type: "QUIT",
          data: { serverId, username, reason },
        });
        return;
      }
    }

    // Get the current state to check which channels the user was in before removing them
    const state = store.getState();
    const server = state.servers.find((s) => s.id === serverId);
    const channelsUserWasIn: string[] = [];

    if (server) {
      server.channels.forEach((channel) => {
        const userWasInChannel = channel.users.some(
          (user) => user.username === username,
        );
        if (userWasInChannel) {
          channelsUserWasIn.push(channel.id);
        }
      });
    }

    store.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((channel) => {
            const updatedUsers = channel.users.filter(
              (user) => user.username !== username,
            );
            return { ...channel, users: updatedUsers };
          });

          return { ...server, channels: updatedChannels };
        }
        return server;
      });

      return { servers: updatedServers };
    });

    // Add quit message if settings allow
    if (state.globalSettings.showEvents && state.globalSettings.showQuits) {
      if (server) {
        // Add quit message to all channels where the user was present
        server.channels.forEach((channel) => {
          if (channelsUserWasIn.includes(channel.id)) {
            const quitMessage: Message = {
              id: uuidv4(),
              type: "quit",
              content: reason ? `quit (${reason})` : "quit",
              timestamp: new Date(),
              userId: username,
              channelId: channel.id,
              serverId: serverId,
              reactions: [],
              replyMessage: null,
              mentioned: [],
            };

            const key = `${serverId}-${channel.id}`;
            store.setState((state) => ({
              messages: {
                ...state.messages,
                [key]: [...(state.messages[key] || []), quitMessage],
              },
            }));
          }
        });
      }
    }

    // Remove typing notifications and clear timers for the user who quit from all channels
    if (server) {
      channelsUserWasIn.forEach((channelId) => {
        const key = `${serverId}-${channelId}`;
        store.setState((state) => {
          const currentUsers = state.typingUsers[key] || [];
          const currentTimers = state.typingTimers[key] || {};

          // Clear timer if it exists
          if (currentTimers[username]) {
            clearTimeout(currentTimers[username]);
          }

          const { [username]: removedTimer, ...remainingTimers } =
            currentTimers;

          return {
            typingUsers: {
              ...state.typingUsers,
              [key]: currentUsers.filter((u) => u.username !== username),
            },
            typingTimers: {
              ...state.typingTimers,
              [key]: remainingTimers,
            },
          };
        });
      });
    }
  });

  ircClient.on("PART", ({ serverId, username, channelName, reason }) => {
    store.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((channel) => {
            if (channel.name.toLowerCase() === channelName.toLowerCase()) {
              return {
                ...channel,
                users: channel.users.filter(
                  (user) => user.username !== username,
                ), // Remove the user
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

    // Add part message if settings allow
    const state = store.getState();
    if (
      state.globalSettings.showEvents &&
      state.globalSettings.showJoinsParts
    ) {
      const server = state.servers.find((s) => s.id === serverId);
      if (server) {
        const channel = server.channels.find((c) => c.name === channelName);
        if (channel) {
          const partMessage: Message = {
            id: uuidv4(),
            type: "part",
            content: reason
              ? `left ${channelName} (${reason})`
              : `left ${channelName}`,
            timestamp: new Date(),
            userId: username,
            channelId: channel.id,
            serverId: serverId,
            reactions: [],
            replyMessage: null,
            mentioned: [],
          };

          const key = `${serverId}-${channel.id}`;
          store.setState((state) => ({
            messages: {
              ...state.messages,
              [key]: [...(state.messages[key] || []), partMessage],
            },
          }));
        }
      }
    }

    // Remove typing notification and clear timer for the user who parted
    const server = state.servers.find((s) => s.id === serverId);
    if (server) {
      const channel = server.channels.find((c) => c.name === channelName);
      if (channel) {
        const key = `${serverId}-${channel.id}`;
        store.setState((state) => {
          const currentUsers = state.typingUsers[key] || [];
          const currentTimers = state.typingTimers[key] || {};

          // Clear timer if it exists
          if (currentTimers[username]) {
            clearTimeout(currentTimers[username]);
          }

          const { [username]: removedTimer, ...remainingTimers } =
            currentTimers;

          return {
            typingUsers: {
              ...state.typingUsers,
              [key]: currentUsers.filter((u) => u.username !== username),
            },
            typingTimers: {
              ...state.typingTimers,
              [key]: remainingTimers,
            },
          };
        });
      }
    }
  });

  ircClient.on(
    "KICK",
    ({ serverId, username, target, channelName, reason }) => {
      store.setState((state) => {
        const updatedServers = state.servers.map((server) => {
          const updatedChannels = server.channels.map((channel) => {
            if (channel.name.toLowerCase() === channelName.toLowerCase()) {
              return {
                ...channel,
                users: channel.users.filter((user) => user.username !== target), // Remove the user
              };
            }
            return channel;
          });
          return { ...server, channels: updatedChannels };
        });

        return { servers: updatedServers };
      });

      // Add kick message if settings allow
      const state = store.getState();
      if (state.globalSettings.showEvents && state.globalSettings.showKicks) {
        const server = state.servers.find((s) => s.id === serverId);
        if (server) {
          const channel = server.channels.find((c) => c.name === channelName);
          if (channel) {
            const kickMessage: Message = {
              id: uuidv4(),
              type: "kick",
              content: reason
                ? `was kicked from ${channelName} by ${username} (${reason})`
                : `was kicked from ${channelName} by ${username}`,
              timestamp: new Date(),
              userId: target,
              channelId: channel.id,
              serverId: serverId,
              reactions: [],
              replyMessage: null,
              mentioned: [],
            };

            const key = `${serverId}-${channel.id}`;
            store.setState((state) => ({
              messages: {
                ...state.messages,
                [key]: [...(state.messages[key] || []), kickMessage],
              },
            }));
          }
        }
      }

      // Remove typing notification and clear timer for the kicked user
      const server = state.servers.find((s) => s.id === serverId);
      if (server) {
        const channel = server.channels.find((c) => c.name === channelName);
        if (channel) {
          const key = `${serverId}-${channel.id}`;
          store.setState((state) => {
            const currentUsers = state.typingUsers[key] || [];
            const currentTimers = state.typingTimers[key] || {};

            // Clear timer if it exists
            if (currentTimers[target]) {
              clearTimeout(currentTimers[target]);
            }

            const { [target]: removedTimer, ...remainingTimers } =
              currentTimers;

            return {
              typingUsers: {
                ...state.typingUsers,
                [key]: currentUsers.filter((u) => u.username !== target),
              },
              typingTimers: {
                ...state.typingTimers,
                [key]: remainingTimers,
              },
            };
          });
        }
      }
    },
  );

  ircClient.on("INVITE", ({ serverId, inviter, target, channel }) => {
    const state = store.getState();
    const server = state.servers.find((s) => s.id === serverId);
    if (!server) return;

    // Get current user's nickname to determine the active channel
    const currentUser = ircClient.getCurrentUser(serverId);
    if (!currentUser) return;

    // Determine where to show the invite message
    // Show in the currently selected channel/chat, or fallback to server's first channel
    let targetChannelId: string | null = null;
    let targetChannelName: string | null = null;

    // If we're on this server and have a selected channel, use that
    if (state.ui.selectedServerId === serverId) {
      const currentSelection = getCurrentSelection(state);
      if (currentSelection.selectedChannelId) {
        const selectedChannel = server.channels.find(
          (c) => c.id === currentSelection.selectedChannelId,
        );
        if (selectedChannel) {
          targetChannelId = selectedChannel.id;
          targetChannelName = selectedChannel.name;
        }
      } else if (currentSelection.selectedPrivateChatId) {
        // For private chats, we'll show it there
        targetChannelId = currentSelection.selectedPrivateChatId;
      }
    }

    // If no active channel, use the first channel on the server as fallback
    if (!targetChannelId && server.channels.length > 0) {
      targetChannelId = server.channels[0].id;
      targetChannelName = server.channels[0].name;
    }

    if (!targetChannelId) return;

    // Create the invite message
    const isForCurrentUser =
      target.toLowerCase() === currentUser.username.toLowerCase();
    const content = isForCurrentUser
      ? `${inviter} has invited you to join ${channel}`
      : `${inviter} has invited ${target} to join ${channel}`;

    const inviteMessage: Message = {
      id: uuidv4(),
      type: "invite",
      content,
      timestamp: new Date(),
      userId: inviter,
      channelId: targetChannelId,
      serverId: serverId,
      reactions: [],
      replyMessage: null,
      mentioned: [],
      inviteChannel: channel,
      inviteTarget: target,
    };

    const key = `${serverId}-${targetChannelId}`;
    store.setState((state) => ({
      messages: {
        ...state.messages,
        [key]: [...(state.messages[key] || []), inviteMessage],
      },
    }));
  });

  ircClient.on("INVITE_SENT", ({ serverId, target, channel }) => {
    const state = store.getState();
    const server = state.servers.find((s) => s.id === serverId);
    if (!server) return;

    // Show the confirmation in the currently selected channel on this server
    const selection = state.ui.perServerSelections[serverId];
    const targetChannelId =
      selection?.selectedChannelId ?? server.channels[0]?.id ?? null;
    if (!targetChannelId) return;

    const inviteMessage: Message = {
      id: uuidv4(),
      type: "invite",
      content: `You invited ${target} to join ${channel}`,
      timestamp: new Date(),
      userId: "",
      channelId: targetChannelId,
      serverId,
      reactions: [],
      replyMessage: null,
      mentioned: [],
      inviteChannel: channel,
      inviteTarget: target,
    };

    const key = `${serverId}-${targetChannelId}`;
    store.setState((state) => ({
      messages: {
        ...state.messages,
        [key]: [...(state.messages[key] || []), inviteMessage],
      },
    }));
  });

  // Nick error event handler
  ircClient.on("NICK_ERROR", ({ serverId, code, error, nick, message }) => {
    // Handle 433 (nickname already in use) with automatic retry
    if (code === "433" && nick) {
      const newNick = `${nick}_`;

      // Attempt to change to the nick with underscore appended
      ircClient.changeNick(serverId, newNick);

      // Add a system message about the retry
      const state = store.getState();
      const server = state.servers.find((s) => s.id === serverId);
      if (server && getCurrentSelection(state).selectedChannelId) {
        const channel = server.channels.find(
          (c) => c.id === getCurrentSelection(state).selectedChannelId,
        );
        if (channel) {
          const retryMessage: Message = {
            id: uuidv4(),
            type: "system",
            content: `Nickname '${nick}' already in use, retrying with '${newNick}'`,
            timestamp: new Date(),
            userId: "system",
            channelId: channel.id,
            serverId: serverId,
            reactions: [],
            replyMessage: null,
            mentioned: [],
          };

          const key = `${serverId}-${channel.id}`;
          store.setState((state) => ({
            messages: {
              ...state.messages,
              [key]: [...(state.messages[key] || []), retryMessage],
            },
          }));
        }
      }

      // Don't show error notification for 433 since we're auto-retrying
      return;
    }

    // Add to global notifications for visibility (for other error codes)
    const state = store.getState();
    state.addGlobalNotification({
      type: "fail",
      command: "NICK",
      code,
      message: `${error}: ${message}`,
      target: nick,
      serverId,
    });

    // Also add a system message to the current channel
    const server = state.servers.find((s) => s.id === serverId);
    if (server && getCurrentSelection(state).selectedChannelId) {
      const channel = server.channels.find(
        (c) => c.id === getCurrentSelection(state).selectedChannelId,
      );
      if (channel) {
        const errorMessage: Message = {
          id: uuidv4(),
          type: "system",
          content: `Nick change failed: ${error} ${nick ? `(${nick})` : ""}`,
          timestamp: new Date(),
          userId: "system",
          channelId: channel.id,
          serverId: serverId,
          reactions: [],
          replyMessage: null,
          mentioned: [],
        };

        const key = `${serverId}-${channel.id}`;
        store.setState((state) => ({
          messages: {
            ...state.messages,
            [key]: [...(state.messages[key] || []), errorMessage],
          },
        }));
      }
    }
  });

  // Standard reply event handlers
  ircClient.on("FAIL", ({ serverId, command, code, target, message }) => {
    // Add to global notifications for visibility
    const state = store.getState();
    state.addGlobalNotification({
      type: "fail",
      command,
      code,
      message,
      target,
      serverId,
    });
  });

  ircClient.on("WARN", ({ serverId, command, code, target, message }) => {
    const state = store.getState();
    const server = state.servers.find((s) => s.id === serverId);
    if (server) {
      // Try to add to the currently selected channel first, fallback to first channel
      let channel = server.channels.find(
        (c) => c.id === getCurrentSelection(state).selectedChannelId,
      );
      if (!channel) {
        channel = server.channels[0];
      }
      if (channel) {
        const notificationMessage: Message = {
          id: uuidv4(),
          type: "standard-reply",
          content: `WARN ${command} ${code}${target ? ` ${target}` : ""}: ${message}`,
          timestamp: new Date(),
          userId: "system",
          channelId: channel.id,
          serverId: serverId,
          reactions: [],
          replyMessage: null,
          mentioned: [],
          standardReplyType: "WARN",
          standardReplyCommand: command,
          standardReplyCode: code,
          standardReplyTarget: target,
          standardReplyMessage: message,
        };

        const key = `${serverId}-${channel.id}`;
        store.setState((state) => ({
          messages: {
            ...state.messages,
            [key]: [...(state.messages[key] || []), notificationMessage],
          },
        }));
      }
    }
  });

  ircClient.on("NOTE", ({ serverId, command, code, target, message }) => {
    const state = store.getState();
    const server = state.servers.find((s) => s.id === serverId);
    if (server) {
      // Try to add to the currently selected channel first, fallback to first channel
      let channel = server.channels.find(
        (c) => c.id === getCurrentSelection(state).selectedChannelId,
      );
      if (!channel) {
        channel = server.channels[0];
      }
      if (channel) {
        const notificationMessage: Message = {
          id: uuidv4(),
          type: "standard-reply",
          content: `NOTE ${command} ${code}${target ? ` ${target}` : ""}: ${message}`,
          timestamp: new Date(),
          userId: "system",
          channelId: channel.id,
          serverId: serverId,
          reactions: [],
          replyMessage: null,
          mentioned: [],
          standardReplyType: "NOTE",
          standardReplyCommand: command,
          standardReplyCode: code,
          standardReplyTarget: target,
          standardReplyMessage: message,
        };

        const key = `${serverId}-${channel.id}`;
        store.setState((state) => ({
          messages: {
            ...state.messages,
            [key]: [...(state.messages[key] || []), notificationMessage],
          },
        }));
      }
    }
  });

  ircClient.on("RENAME", ({ serverId, oldName, newName, reason, user }) => {
    store.setState((state) => {
      const server = state.servers.find((s) => s.id === serverId);
      if (!server) return {};

      const channel = server.channels.find((c) => c.name === oldName);
      if (!channel) return {};

      channel.name = newName;

      const renameMessage: Message = {
        id: `rename-${Date.now()}`,
        content: `Channel has been renamed from ${oldName} to ${newName} by ${user}${reason ? ` (${reason})` : ""}`,
        timestamp: new Date(),
        userId: "system",
        channelId: channel.id,
        serverId,
        type: "system",
        reactions: [],
        replyMessage: null,
        mentioned: [],
      };

      const channelKey = `${serverId}-${channel.id}`;
      const currentMessages = state.messages[channelKey] || [];
      return {
        messages: {
          ...state.messages,
          [channelKey]: [...currentMessages, renameMessage],
        },
      };
    });
  });

  ircClient.on("SETNAME", ({ serverId, user, realname }) => {
    store.setState((state) => {
      const server = state.servers.find((s) => s.id === serverId);
      if (!server) return {};

      // Update current user if it's us
      if (user === state.currentUser?.username) {
        return {
          currentUser: {
            ...state.currentUser,
            realname: realname,
          },
        };
      }

      // Update in channels
      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          const updatedChannels = s.channels.map((c) => ({
            ...c,
            users: c.users.map((u) =>
              u.username === user ? { ...u, realname: realname } : u,
            ),
          }));
          return { ...s, channels: updatedChannels };
        }
        return s;
      });

      return { servers: updatedServers };
    });
  });

  // MONITOR event handlers
  ircClient.on("MONONLINE", ({ serverId, targets }) => {
    store.setState((state) => {
      const server = state.servers.find((s) => s.id === serverId);
      if (!server) return {};

      // Update private chats to mark users as online
      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          const updatedPrivateChats = s.privateChats?.map((pm) => {
            const target = targets.find(
              (t) => t.nick.toLowerCase() === pm.username.toLowerCase(),
            );
            if (target) {
              // Correct the stored username to the server-authoritative casing
              return {
                ...pm,
                isOnline: true,
                isAway: false,
                username: target.nick,
              };
            }
            return pm;
          });
          return { ...s, privateChats: updatedPrivateChats };
        }
        return s;
      });

      return { servers: updatedServers };
    });
  });

  ircClient.on("MONOFFLINE", ({ serverId, targets }) => {
    store.setState((state) => {
      const server = state.servers.find((s) => s.id === serverId);
      if (!server) return {};

      // Update private chats to mark users as offline
      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          const updatedPrivateChats = s.privateChats?.map((pm) => {
            const isOffline = targets.some(
              (t) => t.toLowerCase() === pm.username.toLowerCase(),
            );
            if (isOffline) {
              return { ...pm, isOnline: false, isAway: false };
            }
            return pm;
          });
          return { ...s, privateChats: updatedPrivateChats };
        }
        return s;
      });

      return { servers: updatedServers };
    });
  });

  // Handle AWAY notifications for monitored users (extended-monitor)
  ircClient.on("AWAY", ({ serverId, username, awayMessage }) => {
    store.setState((state) => {
      const server = state.servers.find((s) => s.id === serverId);
      if (!server) return {};

      // Update private chats for monitored users
      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          const updatedPrivateChats = s.privateChats?.map((pm) => {
            if (pm.username.toLowerCase() === username.toLowerCase()) {
              return {
                ...pm,
                isAway: awayMessage !== undefined && awayMessage !== null,
                awayMessage: awayMessage || undefined,
                isOnline: true, // They're still online, just away
              };
            }
            return pm;
          });
          return { ...s, privateChats: updatedPrivateChats };
        }
        return s;
      });

      return { servers: updatedServers };
    });
  });

  // Handle RPL_AWAY (301) from WHOIS responses
  ircClient.on("RPL_AWAY", ({ serverId, nick, awayMessage }) => {
    store.setState((state) => {
      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          const updatedPrivateChats = s.privateChats?.map((pm) => {
            if (pm.username.toLowerCase() === nick.toLowerCase()) {
              return {
                ...pm,
                awayMessage: awayMessage || undefined,
                isAway: true,
              };
            }
            return pm;
          });
          return { ...s, privateChats: updatedPrivateChats };
        }
        return s;
      });

      return { servers: updatedServers };
    });
  });

  // AWAY event handler for away-notify extension
  ircClient.on("AWAY", ({ serverId, username, awayMessage }) => {
    store.setState((state) => {
      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          const updatedChannels = s.channels.map((channel) => {
            const updatedUsers = channel.users.map((user) => {
              if (user.username === username) {
                const newIsAway = !!awayMessage;
                const newAwayMessage = awayMessage || undefined;

                if (
                  user.isAway === newIsAway &&
                  user.awayMessage === newAwayMessage
                ) {
                  return user;
                }

                return {
                  ...user,
                  isAway: newIsAway,
                  awayMessage: newAwayMessage,
                };
              }
              return user;
            });

            if (updatedUsers === channel.users) {
              return channel;
            }

            return { ...channel, users: updatedUsers };
          });

          if (updatedChannels === s.channels) {
            return s;
          }

          return { ...s, channels: updatedChannels };
        }
        return s;
      });

      let updatedCurrentUser = state.currentUser;
      if (state.currentUser?.username === username) {
        const newIsAway = !!awayMessage;
        const newAwayMessage = awayMessage || undefined;

        if (
          state.currentUser.isAway !== newIsAway ||
          state.currentUser.awayMessage !== newAwayMessage
        ) {
          updatedCurrentUser = {
            ...state.currentUser,
            isAway: newIsAway,
            awayMessage: newAwayMessage,
          };
        }
      }

      if (
        updatedServers === state.servers &&
        updatedCurrentUser === state.currentUser
      ) {
        return {};
      }

      return { servers: updatedServers, currentUser: updatedCurrentUser };
    });
  });

  // Handle CHGHOST - update user hostname when it changes
  ircClient.on("CHGHOST", ({ serverId, username, newUser, newHost }) => {
    store.setState((state) => {
      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          const updatedChannels = s.channels.map((channel) => {
            const updatedUsers = channel.users.map((user) => {
              if (user.username === username && user.hostname !== newHost) {
                return {
                  ...user,
                  hostname: newHost,
                };
              }
              return user;
            });

            if (updatedUsers === channel.users) {
              return channel;
            }

            return { ...channel, users: updatedUsers };
          });

          const updatedServerUsers = s.users.map((user) => {
            if (user.username === username && user.hostname !== newHost) {
              return {
                ...user,
                hostname: newHost,
              };
            }
            return user;
          });

          if (
            updatedChannels === s.channels &&
            updatedServerUsers === s.users
          ) {
            return s;
          }

          return { ...s, channels: updatedChannels, users: updatedServerUsers };
        }
        return s;
      });

      let updatedCurrentUser = state.currentUser;
      if (
        state.currentUser?.username === username &&
        state.currentUser.hostname !== newHost
      ) {
        updatedCurrentUser = {
          ...state.currentUser,
          hostname: newHost,
        };
      }

      if (
        updatedServers === state.servers &&
        updatedCurrentUser === state.currentUser
      ) {
        return {};
      }

      return { servers: updatedServers, currentUser: updatedCurrentUser };
    });
  });

  // Handle 306 numeric - we are now marked as away
  ircClient.on("RPL_NOWAWAY", ({ serverId, message }) => {
    store.setState((state) => {
      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          return {
            ...s,
            isAway: true,
            awayMessage: message,
          };
        }
        return s;
      });

      // Update current user if this is the selected server
      let updatedCurrentUser = state.currentUser;
      if (state.ui.selectedServerId === serverId && state.currentUser) {
        updatedCurrentUser = {
          ...state.currentUser,
          isAway: true,
          awayMessage: message,
        };
      }

      return { servers: updatedServers, currentUser: updatedCurrentUser };
    });
  });

  // Handle 305 numeric - we are no longer marked as away
  ircClient.on("RPL_UNAWAY", ({ serverId, message }) => {
    store.setState((state) => {
      const updatedServers = state.servers.map((s) => {
        if (s.id === serverId) {
          return {
            ...s,
            isAway: false,
            awayMessage: undefined,
          };
        }
        return s;
      });

      // Update current user if this is the selected server
      let updatedCurrentUser = state.currentUser;
      if (state.ui.selectedServerId === serverId && state.currentUser) {
        updatedCurrentUser = {
          ...state.currentUser,
          isAway: false,
          awayMessage: undefined,
        };
      }

      return { servers: updatedServers, currentUser: updatedCurrentUser };
    });
  });
}
