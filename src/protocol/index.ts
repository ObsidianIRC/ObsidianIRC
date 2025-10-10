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
}
