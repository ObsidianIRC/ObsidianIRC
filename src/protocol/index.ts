import type { StoreApi, UseBoundStore } from "zustand";
import type { IRCClient } from "../lib/ircClient";
import type { AppState } from "../store/";
import { registerISupportHandler } from "./isupport";
import { registerModeHandler } from "./mode";

const CONNECTION_TIMEOUT_MS = 30000;
const connectionTimeouts = new Map<string, NodeJS.Timeout>();

const clearConnectionTimeout = (serverId: string) => {
  const timeout = connectionTimeouts.get(serverId);
  if (timeout) {
    clearTimeout(timeout);
    connectionTimeouts.delete(serverId);
  }
};

export const clearServerConnectionTimeout = clearConnectionTimeout;

export function registerAllProtocolHandlers(
  ircClient: IRCClient,
  useStore: UseBoundStore<StoreApi<AppState>>,
) {
  registerISupportHandler(ircClient, useStore);
  registerModeHandler(ircClient, useStore);

  ircClient.on("ready", ({ serverId }) => {
    clearConnectionTimeout(serverId);

    const state = useStore.getState();
    const isNewlyAdded =
      state.isAddingNewServer && state.connectingServerId === serverId;

    useStore.setState({
      isConnecting: false,
      connectingServerId: null,
      isAddingNewServer: false,
    });

    if (isNewlyAdded) {
      const isNarrowView =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 768px)").matches;

      if (isNarrowView) {
        useStore.setState((state) => ({
          ui: {
            ...state.ui,
            selectedServerId: serverId,
            mobileViewActiveColumn: "chatView",
          },
        }));
      } else {
        useStore.setState((state) => ({
          ui: {
            ...state.ui,
            selectedServerId: serverId,
          },
        }));
      }
    }

    requestAnimationFrame(() => {
      useStore.getState().triggerServerShimmer(serverId);
    });
  });

  ircClient.on("connectionStateChange", ({ serverId, connectionState }) => {
    useStore.setState((state) => ({
      servers: state.servers.map((server) =>
        server.id === serverId ? { ...server, connectionState } : server,
      ),
    }));

    if (connectionState === "connected") {
      const timeout = setTimeout(() => {
        useStore.setState({
          isConnecting: false,
          connectingServerId: null,
        });
        connectionTimeouts.delete(serverId);
      }, CONNECTION_TIMEOUT_MS);

      connectionTimeouts.set(serverId, timeout);
    }

    if (
      connectionState === "disconnected" ||
      connectionState === "reconnecting"
    ) {
      clearConnectionTimeout(serverId);

      const state = useStore.getState();
      if (state.connectingServerId === serverId) {
        useStore.setState({
          isConnecting: false,
          connectingServerId: null,
        });
      }
    }
  });
}
