import type { IRCClient } from "../lib/ircClient";
import type AppState from "../store/";
import type { Server } from "../types/";

export function registerISupportHandler(
  ircClient: IRCClient,
  useStore: typeof AppState,
) {
  ircClient.on("ISUPPORT", ({ serverId, key, value }) => {
    if (key === "FAVICON" || key === "ICON" || key === "draft/ICON") {
      const favicon = value;
      useStore.setState((state) => {
        const updatedServers = state.servers.map((server: Server) => {
          if (server.id === serverId) {
            return { ...server, icon: favicon };
          }
          return server;
        });
        return { servers: updatedServers };
      });
      return;
    }

    if (key === "NETWORK") {
      useStore.setState((state) => {
        const updatedServers = state.servers.map((server: Server) => {
          if (server.id === serverId) {
            return { ...server, networkName: value };
          }
          return server;
        });
        return { servers: updatedServers };
      });
      return;
    }

    if (key === "PREFIX") {
      const prefix = value;
      useStore.setState((state) => {
        const updatedServers = state.servers.map((server: Server) => {
          if (server.id === serverId) {
            return { ...server, prefix };
          }
          return server;
        });
        return { servers: updatedServers };
      });
      return;
    }

    if (key === "BOT") {
      useStore.setState((state) => {
        const updatedServers = state.servers.map((server: Server) => {
          if (server.id === serverId) {
            return { ...server, botMode: value };
          }
          return server;
        });
        return { servers: updatedServers };
      });
      return;
    }

    if (key === "FILEHOST" || key === "draft/FILEHOST") {
      useStore.setState((state) => {
        const updatedServers = state.servers.map((server: Server) => {
          if (server.id === serverId) {
            return { ...server, filehost: value };
          }
          return server;
        });
        return { servers: updatedServers };
      });
      return;
    }
  });
}
