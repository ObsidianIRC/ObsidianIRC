import { beforeEach, describe, expect, test } from "vitest";
import useStore from "../../src/store";
import type { Message } from "../../src/types";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    type: "message",
    content: "line 1\nline 2\nline 3",
    timestamp: new Date("2026-02-17T14:21:29.576Z"),
    userId: "testuser",
    channelId: "chan-1",
    serverId: "server-1",
    reactions: [],
    replyMessage: null,
    mentioned: [],
    ...overrides,
  };
}

describe("Multiline message deduplication", () => {
  beforeEach(() => {
    // Reset messages and processedMessageIds
    useStore.setState({
      messages: {},
      processedMessageIds: new Set(),
    });
  });

  describe("addMessage timestamp dedup", () => {
    test("should deduplicate messages with same content/user but different Date objects for same timestamp", () => {
      const { addMessage } = useStore.getState();
      const channelKey = "server-1-chan-1";

      const msg1 = makeMessage({
        id: "msg-1",
        timestamp: new Date("2026-02-17T14:21:29.576Z"),
      });

      const msg2 = makeMessage({
        id: "msg-2",
        timestamp: new Date("2026-02-17T14:21:29.576Z"),
      });

      // Different Date objects, same value — should be deduped
      expect(msg1.timestamp).not.toBe(msg2.timestamp);

      addMessage(msg1);
      addMessage(msg2);

      const messages = useStore.getState().messages[channelKey];
      expect(messages).toHaveLength(1);
      expect(messages?.[0].id).toBe("msg-1");
    });

    test("should allow messages with different timestamps", () => {
      const { addMessage } = useStore.getState();
      const channelKey = "server-1-chan-1";

      addMessage(
        makeMessage({
          id: "msg-1",
          timestamp: new Date("2026-02-17T14:21:29.000Z"),
        }),
      );
      addMessage(
        makeMessage({
          id: "msg-2",
          timestamp: new Date("2026-02-17T14:21:30.000Z"),
        }),
      );

      const messages = useStore.getState().messages[channelKey];
      expect(messages).toHaveLength(2);
    });
  });

  describe("processedMessageIds with batch msgid", () => {
    test("should track batch msgid when messageIds array is empty", () => {
      const batchMsgId = "dmsurc3xgc5v3nufdga8ag2xnw";

      // Simulate what MULTILINE_MESSAGE handler does:
      // When messageIds is empty, track mtags.msgid instead
      const messageIds: string[] = [];
      const mtags = { msgid: batchMsgId };

      const idsToTrack =
        messageIds.length > 0 ? messageIds : mtags?.msgid ? [mtags.msgid] : [];

      useStore.setState((state) => ({
        processedMessageIds: new Set([
          ...state.processedMessageIds,
          ...idsToTrack,
        ]),
      }));

      const state = useStore.getState();
      expect(state.processedMessageIds.has(batchMsgId)).toBe(true);
    });

    test("should detect duplicate via batch msgid on second call", () => {
      const batchMsgId = "dmsurc3xgc5v3nufdga8ag2xnw";

      // First call: track the batch msgid
      useStore.setState((state) => ({
        processedMessageIds: new Set([
          ...state.processedMessageIds,
          batchMsgId,
        ]),
      }));

      // Second call: check dedup
      const currentState = useStore.getState();
      const messageIds: string[] = [];
      const mtags = { msgid: batchMsgId };

      let shouldSkip = false;
      if (messageIds.length > 0) {
        shouldSkip = messageIds.some((id) =>
          currentState.processedMessageIds.has(id),
        );
      } else if (
        mtags?.msgid &&
        currentState.processedMessageIds.has(mtags.msgid)
      ) {
        shouldSkip = true;
      }

      expect(shouldSkip).toBe(true);
    });

    test("should not skip when batch msgid is new", () => {
      const currentState = useStore.getState();
      const messageIds: string[] = [];
      const mtags = { msgid: "brand-new-id" };

      let shouldSkip = false;
      if (messageIds.length > 0) {
        shouldSkip = messageIds.some((id) =>
          currentState.processedMessageIds.has(id),
        );
      } else if (
        mtags?.msgid &&
        currentState.processedMessageIds.has(mtags.msgid)
      ) {
        shouldSkip = true;
      }

      expect(shouldSkip).toBe(false);
    });
  });

  describe("full multiline message flow", () => {
    test("two identical multiline messages with same batch msgid should result in one stored message", () => {
      const { addMessage } = useStore.getState();
      const channelKey = "server-1-chan-1";
      const batchMsgId = "dmsurc3xgc5v3nufdga8ag2xnw";

      // Simulate first MULTILINE_MESSAGE event
      const emptyMessageIds: string[] = [];
      const mtags = { msgid: batchMsgId };

      // First call: dedup check passes (new id)
      let state = useStore.getState();
      const shouldSkip1 =
        emptyMessageIds.length > 0
          ? emptyMessageIds.some((id) => state.processedMessageIds.has(id))
          : mtags.msgid
            ? state.processedMessageIds.has(mtags.msgid)
            : false;
      expect(shouldSkip1).toBe(false);

      // Track and add message
      const idsToTrack1 =
        emptyMessageIds.length > 0
          ? emptyMessageIds
          : mtags.msgid
            ? [mtags.msgid]
            : [];
      if (idsToTrack1.length > 0) {
        useStore.setState((s) => ({
          processedMessageIds: new Set([
            ...s.processedMessageIds,
            ...idsToTrack1,
          ]),
        }));
      }
      addMessage(makeMessage({ id: "msg-1", msgid: batchMsgId }));

      // Simulate second MULTILINE_MESSAGE event (same batch)
      state = useStore.getState();
      const shouldSkip2 =
        emptyMessageIds.length > 0
          ? emptyMessageIds.some((id) => state.processedMessageIds.has(id))
          : mtags.msgid
            ? state.processedMessageIds.has(mtags.msgid)
            : false;
      expect(shouldSkip2).toBe(true);

      // Since shouldSkip2 is true, handler would return early — don't add
      const messages = useStore.getState().messages[channelKey];
      expect(messages).toHaveLength(1);
    });
  });
});
