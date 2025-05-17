import type { IRCClient } from "../lib/ircClient";
import { AppState }  from "../store/";
import { registerISupportHandler } from "./isupport";
import type { StoreApi } from "zustand";
import type { UseBoundStore } from "zustand";

export function registerAllProtocolHandlers(
  ircClient: IRCClient,
  useStore: UseBoundStore<StoreApi<AppState>>,
) {
  registerISupportHandler(ircClient, useStore);
}
