import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ircClient from "../../src/lib/ircClient";
import type { AppState } from "../../src/store";
import useStore from "../../src/store";

describe("server connection flow", () => {
  beforeEach(() => {
    useStore.setState({
      servers: [
        {
          id: "srv-1",
          name: "h4ks.com",
          host: "irc.h4ks.com",
          port: 6697,
          channels: [],
          privateChats: [],
          isConnected: false,
          connectionState: "connecting",
          users: [],
        },
      ],
      isConnecting: true,
      connectingServerId: null,
      ui: {
        ...useStore.getState().ui,
        selectedServerId: "srv-1",
      },
    } as unknown as Partial<AppState>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("deleteServer clears connecting state for a connecting server", () => {
    const removeServerSpy = vi
      .spyOn(ircClient, "removeServer")
      .mockImplementation(() => {});

    useStore.getState().deleteServer("srv-1");

    const state = useStore.getState();
    expect(removeServerSpy).toHaveBeenCalledWith("srv-1");
    expect(state.servers).toEqual([]);
    expect(state.isConnecting).toBe(false);
    expect(state.connectingServerId).toBeNull();
    expect(state.ui.selectedServerId).toBeNull();
  });
});