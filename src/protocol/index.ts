import type { StoreApi, UseBoundStore } from "zustand";
import type { IRCClient } from "../lib/ircClient";
import type { AppState } from "../store/";
import { registerISupportHandler } from "./isupport";
import { registerModeHandler } from "./mode";

export function registerAllProtocolHandlers(
  ircClient: IRCClient,
  useStore: UseBoundStore<StoreApi<AppState>>,
) {
  registerISupportHandler(ircClient, useStore);
  registerModeHandler(ircClient, useStore);

  // Register ready event handler for shimmer effect
  ircClient.on("ready", ({ serverId }) => {
    useStore.getState().triggerServerShimmer(serverId);
  });

  // Register connection state change handler
  ircClient.on("connectionStateChange", ({ serverId, connectionState }) => {
    useStore.setState((state) => ({
      servers: state.servers.map((server) =>
        server.id === serverId ? { ...server, connectionState } : server,
      ),
    }));
  });
}
