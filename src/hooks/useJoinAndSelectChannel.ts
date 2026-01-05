import { useCallback } from "react";
import useStore from "../store";

/**
 * Hook that provides a function to join a channel and automatically select it
 * once the IRC JOIN event has been processed and the channel appears in the store.
 *
 * This ensures users get immediate visual feedback when joining channels from
 * various UI components (modal, quick actions, sidebar input).
 */
export const useJoinAndSelectChannel = () => {
  const { joinChannel, selectChannel, servers } = useStore();

  const joinAndSelectChannel = useCallback(
    (serverId: string, channelName: string) => {
      // Send the JOIN command
      joinChannel(serverId, channelName);

      // Poll for the channel to appear in the store after JOIN event is processed
      const pollForChannel = (attempts = 0) => {
        // Give up after 2 seconds (20 attempts × 100ms)
        if (attempts > 20) {
          console.warn(
            `Failed to find channel ${channelName} after joining (gave up after 2s)`,
          );
          return;
        }

        // Get current servers state via getState if available (for production),
        // or fall back to the servers from the hook (for tests)
        const currentServers =
          typeof useStore.getState === "function"
            ? useStore.getState().servers
            : servers;

        const server = currentServers.find((s) => s.id === serverId);
        const channel = server?.channels.find((c) => c.name === channelName);

        if (channel) {
          // Channel found! Select it to open in the UI
          selectChannel(channel.id);
        } else {
          // Channel not found yet, poll again in 100ms
          setTimeout(() => pollForChannel(attempts + 1), 100);
        }
      };

      // Start polling
      pollForChannel();
    },
    [joinChannel, selectChannel, servers],
  );

  return joinAndSelectChannel;
};
