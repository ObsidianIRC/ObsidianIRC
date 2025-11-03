import { v4 as uuidv4 } from "uuid";
import type { StoreApi } from "zustand";
import { isUserIgnored } from "../../lib/ignoreUtils";
import ircClient from "../../lib/ircClient";
import {
  playNotificationSound,
  shouldPlayNotificationSound,
} from "../../lib/notificationSounds";
import {
  checkForMention,
  extractMentions,
  showMentionNotification,
} from "../../lib/notifications";
import type { AppState } from "../index";
import { findChannelMessageById } from "../index";

/**
 * IRC Event Handler Adapter
 *
 * This module separates IRC protocol handling from state management.
 * All IRC event handlers are registered here and update the store via actions.
 *
 * Benefits:
 * - Clear separation of concerns
 * - Easier to test
 * - Centralized IRC logic
 * - No protocol details in store slices
 */

// Helper to get current UI selection
function getCurrentSelection(state: AppState) {
  const serverId = state.ui.selectedServerId;
  if (!serverId)
    return { selectedChannelId: null, selectedPrivateChatId: null };

  return (
    state.ui.perServerSelections[serverId] || {
      selectedChannelId: null,
      selectedPrivateChatId: null,
    }
  );
}

// Helper to get server selection
function getServerSelection(state: AppState, serverId: string) {
  return (
    state.ui.perServerSelections[serverId] || {
      selectedChannelId: null,
      selectedPrivateChatId: null,
    }
  );
}

// Helper to set server selection
function setServerSelection(
  state: AppState,
  serverId: string,
  selection: {
    selectedChannelId: string | null;
    selectedPrivateChatId: string | null;
  },
) {
  return {
    ...state.ui.perServerSelections,
    [serverId]: selection,
  };
}

export function initializeIRCEventHandlers(store: StoreApi<AppState>) {
  const { getState } = store;

  console.log("IRC Adapter: Initializing event handlers...");

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  ircClient.on("connectionStateChange", ({ serverId, connectionState }) => {
    const state = getState();

    // Update connection state
    state.setConnectionState(serverId, connectionState);

    // If a server just connected and we have no selected server (showing welcome screen),
    // switch back to this server to maintain continuity during reconnection
    if (connectionState === "connected" && state.ui.selectedServerId === null) {
      const reconnectedServer = state.getServer(serverId);
      if (reconnectedServer) {
        const serverSelection = getServerSelection(state, serverId);
        state.setSelectedServerId(serverId);
        state.setPerServerSelection(serverId, serverSelection);
      }
    }
  });

  ircClient.on("ready", async ({ serverId, serverName, nickname }) => {
    // Note: restoreServerMetadata() will be called here once we migrate that function
    console.log(`Server ready: ${serverName} (${serverId}) as ${nickname}`);
  });

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  ircClient.on("CHANMSG", (response) => {
    const { mtags, channelName, message, timestamp } = response;
    const state = getState();

    // Check for duplicate messages based on msgid
    if (mtags?.msgid && state.isMessageProcessed(mtags.msgid)) {
      console.log(`Skipping duplicate message with msgid: ${mtags.msgid}`);
      return;
    }

    // Check if sender is ignored
    if (
      isUserIgnored(
        response.sender,
        undefined,
        undefined,
        state.globalSettings.ignoreList,
      )
    ) {
      return;
    }

    // Find the server and channel
    const server = state.getServer(response.serverId);
    if (!server) return;

    const channel = state.getChannelByName(response.serverId, channelName);
    if (!channel) return;

    // Handle reply messages
    const replyId = mtags?.["+draft/reply"]?.trim() || null;
    const replyMessage = replyId
      ? findChannelMessageById(server.id, channel.id, replyId) || null
      : null;

    // Check for mentions
    const currentServerUser = ircClient.getCurrentUser(response.serverId);
    const isOwnMessage = response.sender === currentServerUser?.username;
    const hasMention =
      !isOwnMessage &&
      checkForMention(message, currentServerUser, state.globalSettings);
    const mentions = !isOwnMessage
      ? extractMentions(message, currentServerUser, state.globalSettings)
      : [];

    const newMessage = {
      id: uuidv4(),
      msgid: mtags?.msgid,
      content: message,
      timestamp,
      userId: response.sender,
      channelId: channel.id,
      serverId: server.id,
      type: "message" as const,
      reactions: [],
      replyMessage: replyMessage,
      mentioned: mentions,
      tags: mtags,
    };

    // Update channel unread count and mention flag if not the active channel
    const currentSelection = getCurrentSelection(state);
    const isActiveChannel =
      currentSelection.selectedChannelId === channel.id &&
      state.ui.selectedServerId === server.id;

    // Don't count unread/mentions for historical messages (batch tag indicates chathistory playback)
    const isHistoricalMessage = mtags?.batch !== undefined;

    if (
      !isActiveChannel &&
      response.sender !== currentServerUser?.username &&
      !isHistoricalMessage
    ) {
      state.updateChannel(server.id, channel.id, {
        unreadCount: channel.unreadCount + 1,
        isMentioned: hasMention || channel.isMentioned,
      });

      // Show browser notification for mentions
      if (hasMention && state.globalSettings.enableNotifications) {
        showMentionNotification(
          server.id,
          channelName,
          response.sender,
          message,
          (serverId, msg) => {
            state.addGlobalNotification({
              type: "note",
              command: "MENTION",
              code: "HIGHLIGHT",
              message: msg,
              serverId,
            });
          },
        );
      }
    }

    // If message has bot tag, mark user as bot
    if (mtags?.bot !== undefined) {
      state.updateUserInChannel(
        response.serverId,
        channelName,
        response.sender,
        {
          isBot: true,
          metadata: {
            ...state.getUserInChannel(
              response.serverId,
              channelName,
              response.sender,
            )?.metadata,
            bot: { value: "true", visibility: "public" },
          },
        },
      );
    }

    // Add the message
    state.addMessage(newMessage);

    // Play notification sound if appropriate (but not for historical messages)
    if (!isHistoricalMessage) {
      const serverCurrentUser = ircClient.getCurrentUser(response.serverId);
      if (
        shouldPlayNotificationSound(
          newMessage,
          serverCurrentUser,
          state.globalSettings,
        )
      ) {
        playNotificationSound(state.globalSettings);
      }
    }

    // Mark this message ID as processed to prevent duplicates
    if (mtags?.msgid) {
      state.markMessageAsProcessed(mtags.msgid);
    }

    // Remove any typing users from the state
    state.removeTypingUser(`${server.id}-${channel.id}`, response.sender);
  });

  ircClient.on("USERMSG", (response) => {
    const { mtags, sender, target, message, timestamp } = response;
    const state = getState();

    // Check for duplicate messages
    if (mtags?.msgid && state.isMessageProcessed(mtags.msgid)) {
      console.log(
        `Skipping duplicate private message with msgid: ${mtags.msgid}`,
      );
      return;
    }

    // Check if sender is ignored
    if (
      isUserIgnored(
        sender,
        undefined,
        undefined,
        state.globalSettings.ignoreList,
      )
    ) {
      return;
    }

    const server = state.getServer(response.serverId);
    if (!server) return;

    const currentServerUser = ircClient.getCurrentUser(response.serverId);
    const isOwnMessage = sender === currentServerUser?.username;

    // Determine the other party in the conversation
    const otherParty = isOwnMessage ? target : sender;

    // Find or create private chat
    let privateChat = state.getPrivateChatByUsername(
      response.serverId,
      otherParty,
    );
    if (!privateChat) {
      privateChat = {
        id: uuidv4(),
        username: otherParty,
        serverId: response.serverId,
        unreadCount: 0,
        isMentioned: false,
        isPinned: false,
        order: 0,
      };
      state.addPrivateChatToServer(response.serverId, privateChat);
    }

    // Check for mentions and replies (similar to channel messages)
    const hasMention =
      !isOwnMessage &&
      checkForMention(message, currentServerUser, state.globalSettings);
    const mentions = !isOwnMessage
      ? extractMentions(message, currentServerUser, state.globalSettings)
      : [];

    const replyId = mtags?.["+draft/reply"]?.trim() || null;
    const replyMessage = null; // TODO: implement reply lookup for private messages

    const newMessage = {
      id: uuidv4(),
      msgid: mtags?.msgid,
      content: message,
      timestamp,
      userId: sender,
      channelId: privateChat.id, // For private messages, channelId is the privateChatId
      serverId: server.id,
      type: "message" as const,
      reactions: [],
      replyMessage: replyMessage,
      mentioned: mentions,
      tags: mtags,
    };

    // Update unread count if not the active private chat
    const currentSelection = getCurrentSelection(state);
    const isActivePrivateChat =
      currentSelection.selectedPrivateChatId === privateChat.id &&
      state.ui.selectedServerId === server.id;

    const isHistoricalMessage = mtags?.batch !== undefined;

    if (
      !isActivePrivateChat &&
      sender !== currentServerUser?.username &&
      !isHistoricalMessage
    ) {
      state.updatePrivateChat(server.id, privateChat.id, {
        unreadCount: (privateChat.unreadCount || 0) + 1,
        isMentioned: hasMention || privateChat.isMentioned,
      });

      // Show browser notification
      if (state.globalSettings.enableNotifications) {
        showMentionNotification(
          server.id,
          sender,
          sender,
          message,
          (serverId, msg) => {
            state.addGlobalNotification({
              type: "note",
              command: "PRIVMSG",
              code: "PM",
              message: msg,
              serverId,
            });
          },
        );
      }
    }

    // Add the message
    state.addMessage(newMessage);

    // Play notification sound if appropriate
    if (!isHistoricalMessage) {
      const serverCurrentUser = ircClient.getCurrentUser(response.serverId);
      if (
        shouldPlayNotificationSound(
          newMessage,
          serverCurrentUser,
          state.globalSettings,
        )
      ) {
        playNotificationSound(state.globalSettings);
      }
    }

    // Mark as processed
    if (mtags?.msgid) {
      state.markMessageAsProcessed(mtags.msgid);
    }

    // Remove typing indicator
    if (privateChat) {
      state.removeTypingUser(`${server.id}-${privateChat.id}`, sender);
    }
  });

  // ============================================================================
  // USER MANAGEMENT
  // ============================================================================

  ircClient.on(
    "JOIN",
    ({ serverId, username, channelName, batchTag, account, realname }) => {
      const state = getState();
      const server = state.getServer(serverId);
      if (!server) return;

      const channel = state.getChannelByName(serverId, channelName);
      if (!channel) return;

      // If this event is part of a batch, store it for later processing
      if (batchTag) {
        const batch = state.getActiveBatch(serverId, batchTag);
        if (batch) {
          // Store the event for batch processing
          // TODO: implement batch event storage
        }
        return;
      }

      // Check if user already exists
      const existingUser = state.getUserInChannel(
        serverId,
        channelName,
        username,
      );
      if (existingUser) {
        // User already exists, possibly update their info
        return;
      }

      // Add the user to the channel
      const newUser = {
        id: uuidv4(),
        username,
        modes: "",
        account: account || undefined,
        realname: realname || undefined,
        isBot: false,
        isOnline: true,
        metadata: {},
      };

      state.addUserToChannel(serverId, channelName, newUser);

      // Add system message
      const joinMessage = {
        id: uuidv4(),
        content: `${username} has joined ${channelName}`,
        timestamp: new Date(Date.now()),
        userId: username,
        channelId: channel.id,
        serverId: server.id,
        type: "join" as const,
        reactions: [],
        replyMessage: null,
        mentioned: [],
      };

      state.addMessage(joinMessage);
    },
  );

  ircClient.on("PART", ({ serverId, username, channelName, reason }) => {
    const state = getState();
    const server = state.getServer(serverId);
    if (!server) return;

    const channel = state.getChannelByName(serverId, channelName);
    if (!channel) return;

    // Remove user from channel
    state.removeUserFromChannel(serverId, channelName, username);

    // Add system message
    const partMessage = {
      id: uuidv4(),
      content: `${username} has left ${channelName}${reason ? ` (${reason})` : ""}`,
      timestamp: new Date(Date.now()),
      userId: username,
      channelId: channel.id,
      serverId: server.id,
      type: "part" as const,
      reactions: [],
      replyMessage: null,
      mentioned: [],
    };

    state.addMessage(partMessage);
  });

  ircClient.on("QUIT", ({ serverId, username, reason, batchTag }) => {
    const state = getState();
    const server = state.getServer(serverId);
    if (!server) return;

    // If this event is part of a batch, store it for later processing
    if (batchTag) {
      const batch = state.getActiveBatch(serverId, batchTag);
      if (batch) {
        // TODO: Store batch event
      }
      return;
    }

    // Remove user from all channels on this server
    for (const channel of server.channels) {
      const user = state.getUserInChannel(serverId, channel.name, username);
      if (user) {
        state.removeUserFromChannel(serverId, channel.name, username);

        // Add system message
        const quitMessage = {
          id: uuidv4(),
          content: `${username} has quit${reason ? ` (${reason})` : ""}`,
          timestamp: new Date(Date.now()),
          userId: username,
          channelId: channel.id,
          serverId: server.id,
          type: "quit" as const,
          reactions: [],
          replyMessage: null,
          mentioned: [],
        };

        state.addMessage(quitMessage);
      }
    }
  });

  ircClient.on("NICK", ({ serverId, oldNick, newNick }) => {
    const state = getState();
    const server = state.getServer(serverId);
    if (!server) return;

    // Update username in all channels
    for (const channel of server.channels) {
      const user = state.getUserInChannel(serverId, channel.name, oldNick);
      if (user) {
        // Add new user with updated username
        state.addUserToChannel(serverId, channel.name, {
          ...user,
          username: newNick,
        });

        // Remove old user
        state.removeUserFromChannel(serverId, channel.name, oldNick);

        // Add system message
        const nickMessage = {
          id: uuidv4(),
          content: `${oldNick} is now known as ${newNick}`,
          timestamp: new Date(Date.now()),
          userId: oldNick,
          channelId: channel.id,
          serverId: server.id,
          type: "nick" as const,
          reactions: [],
          replyMessage: null,
          mentioned: [],
        };

        state.addMessage(nickMessage);
      }
    }

    // Update private chats
    const privateChat = state.getPrivateChatByUsername(serverId, oldNick);
    if (privateChat) {
      state.updatePrivateChat(serverId, privateChat.id, {
        username: newNick,
      });
    }
  });

  ircClient.on(
    "KICK",
    ({ serverId, username, target, channelName, reason }) => {
      const state = getState();
      const server = state.getServer(serverId);
      if (!server) return;

      const channel = state.getChannelByName(serverId, channelName);
      if (!channel) return;

      // Remove user from channel
      state.removeUserFromChannel(serverId, channelName, target);

      // Add system message
      const kickMessage = {
        id: uuidv4(),
        content: `${target} was kicked by ${username}${reason ? ` (${reason})` : ""}`,
        timestamp: new Date(Date.now()),
        userId: username,
        channelId: channel.id,
        serverId: server.id,
        type: "kick" as const,
        reactions: [],
        replyMessage: null,
        mentioned: [],
      };

      state.addMessage(kickMessage);
    },
  );

  // ============================================================================
  // TODO: Additional handlers to be implemented
  // ============================================================================

  // The following handlers still need to be migrated from the old store:
  // - MULTILINE_MESSAGE
  // - CHANNNOTICE, USERNOTICE
  // - TOPIC, RPL_TOPIC, RPL_NOTOPIC, RPL_TOPICWHOTIME
  // - MODE, RPL_CHANNELMODEIS
  // - NAMES, WHO_END
  // - WHOIS_* (USER, SERVER, IDLE, CHANNELS, ACCOUNT, SECURE, SPECIAL, END, BOT)
  // - INVITE
  // - LIST_CHANNEL, LIST_END
  // - TAGMSG (typing notifications, reactions)
  // - REDACT (message deletion)
  // - METADATA, METADATA_*, KEYVALUE, KEYNOTSET, SUBOK, UNSUBOK, SUBS
  // - BATCH_START, BATCH_END
  // - CAP_*, AUTHENTICATE
  // - FAIL, WARN, NOTE
  // - NICK_ERROR
  // - REGISTER_SUCCESS, REGISTER_VERIFICATION_REQUIRED, VERIFY_SUCCESS
  // - RPL_YOURHOST, RPL_YOUREOPER
  // - RPL_AWAY, RPL_NOWAWAY, RPL_UNAWAY
  // - RPL_BANLIST, RPL_INVITELIST, RPL_EXCEPTLIST, RPL_ENDOFBANLIST, RPL_ENDOFINVITELIST
  // - MONOFFLINE, MONONLINE
  // - AWAY, CHGHOST, SETNAME, RENAME
  // - CHATHISTORY_LOADING
  // - EXTJWT

  console.log("IRC Adapter: Core event handlers initialized");
  console.log(
    "TODO: Additional handlers (MULTILINE, notices, metadata, etc.) to be implemented",
  );
}
