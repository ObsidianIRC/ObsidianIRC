import { useCallback } from "react";
import useStore from "../store";

/**
 * Hook that provides a function to join a channel and immediately select it.
 *
 * joinChannel adds the channel to the Zustand store synchronously, so we can
 * look it up and select it in the same tick — no polling needed.
 */
export const useJoinAndSelectChannel = () => {
  const joinAndSelectChannel = useCallback(
    (serverId: string, channelName: string) => {
      // Send JOIN and add channel to the store (synchronous)
      useStore.getState().joinChannel(serverId, channelName);

      // Channel is in the store now; select it immediately
      const server = useStore.getState().servers.find((s) => s.id === serverId);
      const channel = server?.channels.find(
        (c) => c.name.toLowerCase() === channelName.toLowerCase(),
      );

      if (channel) {
        useStore.getState().selectChannel(channel.id, { navigate: true });
      }
    },
    [],
  );

  return joinAndSelectChannel;
};
