import type { StoreApi } from "zustand";
import ircClient from "../../lib/ircClient";
import type { BatchInfo } from "../helpers";
import type { AppState } from "../index";

function processBatchedNetsplit(
  store: StoreApi<AppState>,
  serverId: string,
  batchId: string,
  batch: BatchInfo,
) {
  const storeState = store.getState();
  const batch_info = storeState.activeBatches[serverId]?.[batchId];
  if (!batch_info) return;

  const quitEvents = batch_info.events;
  const [server1, server2] = batch_info.parameters || ["*.net", "*.split"];

  // Create a single netsplit message
  const netsplitMessage = {
    id: `netsplit-${batchId}`,
    content: "Oops! The net split! ⚠️",
    timestamp: new Date(),
    userId: "system",
    channelId: "", // Will be set per channel
    serverId,
    type: "netsplit" as const,
    batchId,
    quitUsers: quitEvents.map((e) => e.data.username),
    server1,
    server2,
    reactions: [],
    replyMessage: null,
    mentioned: [],
  };

  // Group affected channels and add the netsplit message to each
  const affectedChannels = new Set<string>();

  // Process each quit event to remove users and track affected channels
  quitEvents.forEach((event) => {
    const { username } = event.data;

    // Find which channels this user was in and remove them
    store.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((channel) => {
            const userIndex = channel.users.findIndex(
              (u) => u.username === username,
            );
            if (userIndex !== -1) {
              affectedChannels.add(channel.id);
              // Remove the user from the channel
              const updatedUsers = channel.users.filter(
                (u) => u.username !== username,
              );
              return { ...channel, users: updatedUsers };
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

  // Add netsplit message to each affected channel
  affectedChannels.forEach((channelId) => {
    const channelMessage = { ...netsplitMessage, channelId };
    store.getState().addMessage(channelMessage);
  });
}

function processBatchedNetjoin(
  store: StoreApi<AppState>,
  serverId: string,
  batchId: string,
  batch: BatchInfo,
) {
  const storeState = store.getState();
  const batch_info = storeState.activeBatches[serverId]?.[batchId];
  if (!batch_info) return;

  const joinEvents = batch_info.events;
  const [server1, server2] = batch_info.parameters || ["*.net", "*.join"];

  // Process each join event normally first
  joinEvents.forEach((event) => {
    // Re-trigger the JOIN event to add users back
    if (event.type === "JOIN") {
      ircClient.triggerEvent("JOIN", event.data);
    }
  });

  // Find and update any existing netsplit messages to show rejoin
  store.setState((state) => {
    const updatedMessages = { ...state.messages };

    Object.keys(updatedMessages).forEach((channelKey) => {
      const messages = updatedMessages[channelKey];
      const updatedChannelMessages = messages.map((message) => {
        if (
          message.type === "netsplit" &&
          message.serverId === serverId &&
          message.server1 === server1 &&
          message.server2 === server2
        ) {
          // Update the netsplit message to show rejoin
          return {
            ...message,
            content: "The network split and rejoined. ✅",
            type: "netjoin" as const,
          };
        }
        return message;
      });
      updatedMessages[channelKey] = updatedChannelMessages;
    });

    return { messages: updatedMessages };
  });
}

export function registerBatchHandlers(store: StoreApi<AppState>): void {
  ircClient.on("BATCH_START", ({ serverId, batchId, type }) => {
    const state = store.getState();

    if (!state.metadataBatches[batchId]) {
      store.setState((state) => ({
        metadataBatches: {
          ...state.metadataBatches,
          [batchId]: { type, messages: [] },
        },
      }));
    }
  });

  ircClient.on("BATCH_END", ({ serverId, batchId }) => {
    // End a batch - process all messages in the batch
    store.setState((state) => {
      const batch = state.metadataBatches[batchId];
      if (batch) {
        // Process batch messages (they should have been collected during the batch)
        // For metadata batches, the individual METADATA_KEYVALUE events should have updated the state
      }
      const { [batchId]: _, ...remainingBatches } = state.metadataBatches;
      return {
        metadataBatches: remainingBatches,
      };
    });
  });

  ircClient.on("BATCH_START", ({ serverId, batchId, type, parameters }) => {
    store.setState((state) => {
      const serverBatches = state.activeBatches[serverId] || {};
      return {
        activeBatches: {
          ...state.activeBatches,
          [serverId]: {
            ...serverBatches,
            [batchId]: {
              type,
              parameters: parameters || [],
              events: [],
              startTime: new Date(),
            },
          },
        },
      };
    });
  });

  ircClient.on("BATCH_END", ({ serverId, batchId }) => {
    store.setState((state) => {
      const serverBatches = state.activeBatches[serverId];
      if (!serverBatches || !serverBatches[batchId]) {
        return state;
      }

      const batch = serverBatches[batchId];

      // Process the batch based on its type
      if (batch.type === "netsplit") {
        processBatchedNetsplit(store, serverId, batchId, batch);
      } else if (batch.type === "netjoin") {
        processBatchedNetjoin(store, serverId, batchId, batch);
      } else if (
        batch.type === "draft/multiline" ||
        batch.type === "multiline"
      ) {
        // Multiline batches are handled by the IRC client directly via MULTILINE_MESSAGE events
        // Don't process individual events here, the IRC client already combined them
      } else if (batch.type === "metadata") {
        // Metadata batches are handled by the IRC client directly via individual METADATA events
        // Don't process individual events here, metadata updates are already processed
      } else if (batch.type === "chathistory") {
        // Chathistory batch completed - turn off loading state for the channel

        // Try to determine the channel from batch parameters
        // Chathistory batch parameters typically include the channel name
        const channelName =
          batch.parameters && batch.parameters.length > 0
            ? batch.parameters[0]
            : null;

        if (channelName) {
          // Trigger event to turn off loading state
          ircClient.triggerEvent("CHATHISTORY_LOADING", {
            serverId,
            channelName,
            isLoading: false,
          });
        }
      } else {
        // For unknown batch types, process events individually
        batch.events.forEach((event) => {
          // Re-trigger the event without batch context based on its type
          switch (event.type) {
            case "JOIN":
              ircClient.triggerEvent("JOIN", event.data);
              break;
            case "QUIT":
              ircClient.triggerEvent("QUIT", event.data);
              break;
            case "PART":
              ircClient.triggerEvent("PART", event.data);
              break;
          }
        });
      }

      // Remove the completed batch
      const { [batchId]: removed, ...remainingBatches } = serverBatches;
      return {
        activeBatches: {
          ...state.activeBatches,
          [serverId]: remainingBatches,
        },
      };
    });
  });
}
