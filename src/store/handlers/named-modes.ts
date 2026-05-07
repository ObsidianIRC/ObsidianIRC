// Store-side wiring for IRCv3 draft/named-modes.
//
// Maintains the per-server `namedModes` registry from RPL_CHMODELIST /
// RPL_UMODELIST and handles incoming PROP changes by translating them
// into the existing chanmode/usermode store paths so the rest of the
// app keeps working without knowing about PROP.

import type { StoreApi } from "zustand";
import ircClient from "../../lib/ircClient";
import type { NamedModeSpec, Server } from "../../types";
import type { AppState } from "../index";

function applyChannelEntries(
  state: AppState,
  serverId: string,
  entries: NamedModeSpec[],
  isFinal: boolean,
): Pick<AppState, "servers"> {
  const servers = state.servers.map((s: Server) => {
    if (s.id !== serverId) return s;
    const prev = s.namedModes ?? {
      supported: true,
      channelModes: [],
      userModes: [],
    };
    return {
      ...s,
      namedModes: {
        supported: true,
        channelModes: mergeEntries(prev.channelModes, entries, isFinal),
        userModes: prev.userModes,
      },
    };
  });
  return { servers };
}

function applyUserEntries(
  state: AppState,
  serverId: string,
  entries: NamedModeSpec[],
  isFinal: boolean,
): Pick<AppState, "servers"> {
  const servers = state.servers.map((s: Server) => {
    if (s.id !== serverId) return s;
    const prev = s.namedModes ?? {
      supported: true,
      channelModes: [],
      userModes: [],
    };
    return {
      ...s,
      namedModes: {
        supported: true,
        channelModes: prev.channelModes,
        userModes: mergeEntries(prev.userModes, entries, isFinal),
      },
    };
  });
  return { servers };
}

/** Append the current line's entries to the running list. The first
 *  line clears any stale registry; the final line caps the burst. */
function mergeEntries(
  prev: NamedModeSpec[],
  incoming: NamedModeSpec[],
  isFinal: boolean,
): NamedModeSpec[] {
  // The protocol burst comes as `[*] ... [*] ... :final`. Each line is
  // independent; we just concatenate. Callers can rely on isFinal to
  // know when to read the registry.
  // Dedup by name in case the server (or a future re-advertise) sends
  // overlapping entries.
  const merged: NamedModeSpec[] = [...prev];
  for (const entry of incoming) {
    const idx = merged.findIndex((e) => e.name === entry.name);
    if (idx === -1) merged.push(entry);
    else merged[idx] = entry;
  }
  // isFinal could trigger downstream effects (e.g. "registry ready")
  // -- left as a boolean for now since callers can derive from the
  // store directly.
  void isFinal;
  return merged;
}

export function registerNamedModesHandlers(store: StoreApi<AppState>): void {
  ircClient.on(
    "NAMED_MODES_CHANMODE_LIST",
    ({ serverId, entries, isFinal }) => {
      store.setState((state) =>
        applyChannelEntries(state, serverId, entries, isFinal),
      );
    },
  );

  ircClient.on("NAMED_MODES_UMODE_LIST", ({ serverId, entries, isFinal }) => {
    store.setState((state) =>
      applyUserEntries(state, serverId, entries, isFinal),
    );
  });

  // Server-pushed PROP changes are the cap-aware equivalent of MODE.
  // For phase 1 we just log them; the next phase translates them into
  // the existing channel/user mode-state store updates so the chat
  // header / member list / etc. stay consistent.
  ircClient.on("NAMED_MODES_PROP", (event) => {
    // No-op for now -- the existing MODE event still fires for
    // legacy-letter-equivalent changes and drives the UI. We'll
    // route name-only changes through this path in the next phase.
    void event;
  });
}
