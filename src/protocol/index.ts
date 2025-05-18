import type { StoreApi } from "zustand";
import type { UseBoundStore } from "zustand";
import type { IRCClient } from "../lib/ircClient";
import type { AppState } from "../store/";
import { registerISupportHandler } from "./isupport";

export function registerAllProtocolHandlers(
  ircClient: IRCClient,
  useStore: UseBoundStore<StoreApi<AppState>>,
) {
  registerISupportHandler(ircClient, useStore);
}
