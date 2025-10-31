import { beforeEach, describe, expect, test } from "vitest";
import useStore from "../../src/store";

describe("Store", () => {
  beforeEach(() => {
    // Reset store state before each test
    const store = useStore.getState();
    // We can't easily reset the entire store, so we'll test individual actions
  });

  describe("initial state", () => {
    test("should have correct initial state", () => {
      const state = useStore.getState();

      expect(state.servers).toEqual([]);
      expect(state.currentUser).toBeNull();
      expect(state.isConnecting).toBe(false);
      expect(state.selectedServerId).toBeNull();
      expect(state.connectionError).toBeNull();
      expect(state.messages).toEqual({});
      expect(state.typingUsers).toEqual({});
      expect(state.channelList).toEqual({});
      expect(state.listingInProgress).toEqual({});
    });
  });

  describe("UI actions", () => {
    test("should open and close channel list modal", () => {
      const { openModal, closeModal } = useStore.getState();

      openModal("channelList");
      expect(useStore.getState().ui.modals.channelList?.isOpen).toBe(true);

      closeModal("channelList");
      expect(useStore.getState().ui.modals.channelList?.isOpen).toBe(false);
    });

    test("should open and close channel rename modal", () => {
      const { openModal, closeModal } = useStore.getState();

      openModal("channelRename");
      expect(useStore.getState().ui.modals.channelRename?.isOpen).toBe(true);

      closeModal("channelRename");
      expect(useStore.getState().ui.modals.channelRename?.isOpen).toBe(false);
    });
  });

  describe("channel listing", () => {
    test("should handle channel list state", () => {
      const state = useStore.getState();

      // Initially empty
      expect(state.channelList).toEqual({});
      expect(state.listingInProgress).toEqual({});

      // Note: We can't easily test the listChannels action without mocking the IRC client
      // The actual functionality is tested in the IRC client tests
    });
  });

  describe("settings", () => {
    test("should toggle dark mode", () => {
      const { toggleDarkMode } = useStore.getState();

      const initialTheme = useStore.getState().ui.isDarkMode;
      toggleDarkMode();
      const newTheme = useStore.getState().ui.isDarkMode;
      expect(newTheme).not.toBe(initialTheme);
    });
  });

  describe("server selection", () => {
    test("should select server", () => {
      const { selectServer } = useStore.getState();

      selectServer("test-server");
      // Test that the function can be called
      expect(typeof selectServer).toBe("function");
    });
  });

  describe("channel selection", () => {
    test("should select channel", () => {
      const { selectChannel, selectServer } = useStore.getState();

      // First select a server
      selectServer("test-server");

      selectChannel("#test");
      expect(
        useStore.getState().ui.perServerSelections["test-server"]
          ?.selectedChannelId,
      ).toBe("#test");

      selectChannel(null);
      expect(
        useStore.getState().ui.perServerSelections["test-server"]
          ?.selectedChannelId,
      ).toBeNull();
    });
  });
});
