// draft/read-marker: cache the per-target marker on the matching
// Channel / PrivateChat in the Zustand store.  The marker is what the
// rest of the UI uses to decide which messages to count as unread,
// and what to clear notifications for.
//
// Channel matches: the target case-insensitively equals the channel
// name.
// PrivateChat matches: the target case-insensitively equals the
// other participant's username.

import type { StoreApi } from "zustand";
import ircClient from "../../lib/ircClient";
import type { AppState } from "../index";

function eqIC(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function registerReadMarkerHandlers(store: StoreApi<AppState>): void {
  ircClient.on("MARKREAD", ({ serverId, target, timestamp }) => {
    store.setState((state) => {
      let touched = false;
      const updatedServers = state.servers.map((server) => {
        if (server.id !== serverId) return server;
        let serverTouched = false;

        const channels = server.channels.map((channel) => {
          if (!eqIC(channel.name, target)) return channel;
          if (channel.readMarker === timestamp) return channel;
          serverTouched = true;
          return { ...channel, readMarker: timestamp };
        });

        const privateChats = (server.privateChats || []).map((pc) => {
          if (!eqIC(pc.username, target)) return pc;
          const same = pc.readMarker === timestamp;
          if (same && pc.readMarkerFetched) return pc;
          serverTouched = true;
          return { ...pc, readMarker: timestamp, readMarkerFetched: true };
        });

        if (!serverTouched) return server;
        touched = true;
        return { ...server, channels, privateChats };
      });

      if (!touched) return {};
      return { servers: updatedServers };
    });
  });
}
