import { describe, expect, it } from "vitest";
import {
  getEventGroupSummary,
  getEventGroupTooltip,
  groupConsecutiveEvents,
} from "../../src/lib/eventGrouping";
import type { Message } from "../../src/types";

function makeEvent(
  type: "join" | "part" | "quit",
  userId: string,
  timestamp: string,
  overrides: Partial<Message> = {},
): Message {
  return {
    id: `${userId}-${type}-${timestamp}`,
    type,
    content: "",
    timestamp: new Date(timestamp),
    userId,
    channelId: "chan-1",
    serverId: "srv-1",
    reactions: [],
    replyMessage: null,
    mentioned: [],
    fromHistory: true, // tests exercise the chathistory aggregation path
    ...overrides,
  };
}

function makeMsg(timestamp: string): Message {
  return {
    id: `msg-${timestamp}`,
    type: "message",
    content: "hello",
    timestamp: new Date(timestamp),
    userId: "alice",
    channelId: "chan-1",
    serverId: "srv-1",
    reactions: [],
    replyMessage: null,
    mentioned: [],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// computeUserSummary (via groupConsecutiveEvents)
// ────────────────────────────────────────────────────────────────────────────

describe("computeUserSummary — via groupConsecutiveEvents", () => {
  it("join → join = 'joined 2 times'", () => {
    const msgs = [
      makeEvent("join", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:34:30Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("joined 2 times");
  });

  it("part → part = 'left' (last event wins)", () => {
    const msgs = [
      makeEvent("part", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("part", "berry", "2026-01-01T08:34:30Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("left");
  });

  it("quit → quit = 'quit' (last event wins)", () => {
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("quit", "berry", "2026-01-01T08:34:30Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("quit");
  });

  it("quit → join = 'reconnected'", () => {
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:34:30Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].userSummaries).toHaveLength(1);
    expect(groups[0].userSummaries?.[0].summary).toBe("reconnected");
  });

  it("quit → join → quit → join = 'reconnected 2 times'", () => {
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:34:10Z"),
      makeEvent("quit", "berry", "2026-01-01T08:35:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:35:10Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("reconnected 2 times");
  });

  it("quit → join × 3 = 'reconnected 3 times'", () => {
    const base = new Date("2026-01-01T08:00:00Z").getTime();
    const msgs = Array.from({ length: 6 }, (_, k) =>
      makeEvent(
        k % 2 === 0 ? "quit" : "join",
        "berry",
        new Date(base + k * 30_000).toISOString(),
      ),
    );
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("reconnected 3 times");
  });

  // Part→join is a voluntary rejoin, not a network reconnect
  it("part → join = 'joined' (not 'reconnected')", () => {
    const msgs = [
      makeEvent("part", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:34:30Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("joined");
  });

  it("join → quit = 'joined and quit' (single join immediately followed by quit)", () => {
    const msgs = [
      makeEvent("join", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("quit", "berry", "2026-01-01T08:35:00Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("joined and quit");
  });

  it("quit → quit = 'quit' (was already in channel, not a fresh join)", () => {
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("quit", "berry", "2026-01-01T08:35:00Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("quit");
  });

  it("join → quit → quit = 'quit' (more than 2 events, falls back to last-wins)", () => {
    const msgs = [
      makeEvent("join", "berry", "2026-01-01T08:33:00Z"),
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("quit", "berry", "2026-01-01T08:35:00Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("quit");
  });

  it("join → part = 'left' (last event wins, user is gone)", () => {
    const msgs = [
      makeEvent("join", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("part", "berry", "2026-01-01T08:35:00Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("left");
  });

  it("join → quit → join = 'reconnected' (quit→join cycle present)", () => {
    const msgs = [
      makeEvent("join", "berry", "2026-01-01T08:33:00Z"),
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:34:30Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("reconnected");
  });

  it("quit → join → part = 'left' (last event wins, user departed)", () => {
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:34:10Z"),
      makeEvent("part", "berry", "2026-01-01T08:35:00Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("left");
  });

  it("> 9 reconnects → 'reconnected multiple times'", () => {
    const base = new Date("2026-01-01T08:00:00Z").getTime();
    // 10 quit→join cycles = 20 events
    const msgs = Array.from({ length: 20 }, (_, k) =>
      makeEvent(
        k % 2 === 0 ? "quit" : "join",
        "berry",
        new Date(base + k * 10_000).toISOString(),
      ),
    );
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe(
      "reconnected multiple times",
    );
  });

  it("> 9 joins → 'joined multiple times'", () => {
    const base = new Date("2026-01-01T08:00:00Z").getTime();
    const msgs = Array.from({ length: 10 }, (_, k) =>
      makeEvent("join", "berry", new Date(base + k * 10_000).toISOString()),
    );
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("joined multiple times");
  });

  it("exactly 9 reconnects still shows count", () => {
    const base = new Date("2026-01-01T08:00:00Z").getTime();
    const msgs = Array.from({ length: 18 }, (_, k) =>
      makeEvent(
        k % 2 === 0 ? "quit" : "join",
        "berry",
        new Date(base + k * 10_000).toISOString(),
      ),
    );
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].summary).toBe("reconnected 9 times");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// groupConsecutiveEvents — run boundaries
// ────────────────────────────────────────────────────────────────────────────

describe("groupConsecutiveEvents — run boundaries", () => {
  it("regular message between events breaks the group into two", () => {
    const msgs = [
      makeEvent("join", "berry", "2026-01-01T08:00:00Z"),
      makeMsg("2026-01-01T08:01:00Z"),
      makeEvent("quit", "berry", "2026-01-01T08:02:00Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    // first join is alone (length 1) → individual message
    // regular message → individual
    // last quit is alone → individual
    expect(groups).toHaveLength(3);
    expect(groups[0].type).toBe("message");
    expect(groups[1].type).toBe("message");
    expect(groups[2].type).toBe("message");
  });

  it("any time gap between events does not break the run", () => {
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:00:00Z"),
      makeEvent("join", "berry", "2026-01-01T10:00:00Z"), // 2 hour gap — still same group
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("eventGroup");
    expect(groups[0].userSummaries?.[0].summary).toBe("reconnected");
  });

  it("single event is not collapsed", () => {
    const msgs = [makeEvent("join", "berry", "2026-01-01T08:00:00Z")];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("message");
  });

  it("events separated by a message form two groups regardless of time gap", () => {
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:00:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:01:00Z"),
      makeMsg("2026-01-01T08:02:00Z"),
      makeEvent("quit", "berry", "2026-01-01T08:03:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:04:00Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups).toHaveLength(3);
    expect(groups[0].type).toBe("eventGroup");
    expect(groups[1].type).toBe("message");
    expect(groups[2].type).toBe("eventGroup");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Intermingled multi-user runs
// ────────────────────────────────────────────────────────────────────────────

describe("groupConsecutiveEvents — intermingled multi-user", () => {
  it("berry and mita both quit→join → two independent groups, both 'reconnected'", () => {
    const msgs = [
      makeEvent("quit", "mita", "2026-01-01T05:19:00Z"),
      makeEvent("join", "mita", "2026-01-01T05:20:00Z"),
      makeEvent("quit", "berry", "2026-01-01T05:20:30Z"),
      makeEvent("join", "berry", "2026-01-01T05:20:40Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    // Each user gets their own EventGroup, sorted by last event timestamp
    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe("eventGroup");
    expect(groups[1].type).toBe("eventGroup");

    const mitaGroup = groups.find(
      (g) => g.userSummaries?.[0].username === "mita",
    );
    const berryGroup = groups.find(
      (g) => g.userSummaries?.[0].username === "berry",
    );
    expect(mitaGroup?.userSummaries?.[0].summary).toBe("reconnected");
    expect(berryGroup?.userSummaries?.[0].summary).toBe("reconnected");
  });

  it("berry reconnects 2 times while mita joins once — mita interrupted, becomes individual message", () => {
    const msgs = [
      makeEvent("join", "mita", "2026-01-01T08:33:00Z"),
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:34:10Z"),
      makeEvent("quit", "berry", "2026-01-01T08:35:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:35:10Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    // mita's single join is interrupted by berry → emitted as individual message
    // berry's 4 consecutive events form an eventGroup
    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe("message");
    expect(groups[0].messages[0].userId).toBe("mita");
    expect(groups[1].type).toBe("eventGroup");
    expect(groups[1].userSummaries?.[0].summary).toBe("reconnected 2 times");
  });

  it("each user's group timestamp is their own last event timestamp", () => {
    const msgs = [
      makeEvent("quit", "mita", "2026-01-01T05:19:00Z"),
      makeEvent("join", "mita", "2026-01-01T05:20:00Z"),
      makeEvent("join", "berry", "2026-01-01T05:20:30Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    // mita: 2 consecutive events → eventGroup; berry: single event → individual message
    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe("eventGroup");
    expect(groups[0].userSummaries?.[0].username).toBe("mita");
    expect(groups[0].timestamp).toEqual(new Date("2026-01-01T05:20:00Z"));
    expect(groups[1].type).toBe("message");
    expect(groups[1].timestamp).toEqual(new Date("2026-01-01T05:20:30Z"));
  });

  it("per-user timestamp is the last event for that user", () => {
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:34:30Z"),
      makeEvent("quit", "mita", "2026-01-01T08:35:00Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    // berry: 2 consecutive events → eventGroup; mita: single quit → individual message
    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe("eventGroup");
    expect(groups[0].userSummaries?.[0].username).toBe("berry");
    expect(groups[0].userSummaries?.[0].timestamp).toEqual(
      new Date("2026-01-01T08:34:30Z"),
    );
    expect(groups[1].type).toBe("message");
    expect(groups[1].timestamp).toEqual(new Date("2026-01-01T08:35:00Z"));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// eventSequence is preserved
// ────────────────────────────────────────────────────────────────────────────

describe("eventSequence in UserEventSummary", () => {
  it("records the ordered sequence of event types per user", () => {
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:34:10Z"),
      makeEvent("quit", "berry", "2026-01-01T08:35:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:35:10Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups[0].userSummaries?.[0].eventSequence).toEqual([
      "quit",
      "join",
      "quit",
      "join",
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getEventGroupSummary
// ────────────────────────────────────────────────────────────────────────────

describe("getEventGroupSummary", () => {
  it("returns empty string for non-group items", () => {
    const msgs = [makeEvent("join", "berry", "2026-01-01T08:00:00Z")];
    const groups = groupConsecutiveEvents(msgs);
    expect(getEventGroupSummary(groups[0])).toBe("");
  });

  it("formats single user summary", () => {
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:34:30Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(getEventGroupSummary(groups[0])).toBe("berry reconnected");
  });

  it("replaces current user with 'You'", () => {
    const msgs = [
      makeEvent("quit", "alice", "2026-01-01T08:34:00Z"),
      makeEvent("join", "alice", "2026-01-01T08:34:30Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(getEventGroupSummary(groups[0], "alice")).toBe("You reconnected");
  });

  it("each user's independent group produces its own summary", () => {
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:34:10Z"),
      makeEvent("quit", "mita", "2026-01-01T08:34:20Z"),
      makeEvent("join", "mita", "2026-01-01T08:34:30Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups).toHaveLength(2);
    const berryGroup = groups.find(
      (g) => g.userSummaries?.[0].username === "berry",
    );
    const mitaGroup = groups.find(
      (g) => g.userSummaries?.[0].username === "mita",
    );
    expect(berryGroup).toBeDefined();
    expect(mitaGroup).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined assertions above
    expect(getEventGroupSummary(berryGroup!)).toBe("berry reconnected");
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined assertions above
    expect(getEventGroupSummary(mitaGroup!)).toBe("mita reconnected");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getEventGroupTooltip
// ────────────────────────────────────────────────────────────────────────────

describe("getEventGroupTooltip", () => {
  it("shows event sequence per user", () => {
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:34:10Z"),
      makeEvent("quit", "berry", "2026-01-01T08:35:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:35:10Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(getEventGroupTooltip(groups[0])).toBe(
      "berry: quit → join → quit → join",
    );
  });

  it("each user has their own independent tooltip", () => {
    // Sequential runs — each user has 2+ events, no interleaving
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:34:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:34:10Z"),
      makeEvent("quit", "mita", "2026-01-01T08:34:20Z"),
      makeEvent("join", "mita", "2026-01-01T08:34:30Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups).toHaveLength(2);
    const berryGroup = groups.find(
      (g) => g.userSummaries?.[0].username === "berry",
    );
    const mitaGroup = groups.find(
      (g) => g.userSummaries?.[0].username === "mita",
    );
    expect(berryGroup).toBeDefined();
    expect(mitaGroup).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined assertions above
    expect(getEventGroupTooltip(berryGroup!)).toBe("berry: quit → join");
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined assertions above
    expect(getEventGroupTooltip(mitaGroup!)).toBe("mita: quit → join");
  });

  it("sequence > 4 events is truncated: first 2 → ... → last 2", () => {
    const base = new Date("2026-01-01T08:00:00Z").getTime();
    // 10 quit→join cycles = 20 events
    const msgs = Array.from({ length: 20 }, (_, k) =>
      makeEvent(
        k % 2 === 0 ? "quit" : "join",
        "berry",
        new Date(base + k * 10_000).toISOString(),
      ),
    );
    const groups = groupConsecutiveEvents(msgs);
    expect(getEventGroupTooltip(groups[0])).toBe(
      "berry: quit → join → ... → quit → join",
    );
  });

  it("sequence of exactly 4 events is shown in full", () => {
    const base = new Date("2026-01-01T08:00:00Z").getTime();
    const msgs = Array.from({ length: 4 }, (_, k) =>
      makeEvent(
        k % 2 === 0 ? "quit" : "join",
        "berry",
        new Date(base + k * 10_000).toISOString(),
      ),
    );
    const groups = groupConsecutiveEvents(msgs);
    expect(getEventGroupTooltip(groups[0])).toBe(
      "berry: quit → join → quit → join",
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Mixed messages and events
// ────────────────────────────────────────────────────────────────────────────

describe("groupConsecutiveEvents — mixed messages and events", () => {
  it("preserves message order and type across a mixed list", () => {
    const msgs = [
      makeEvent("join", "berry", "2026-01-01T08:00:00Z"),
      makeEvent("join", "mita", "2026-01-01T08:00:30Z"),
      makeMsg("2026-01-01T08:01:00Z"),
      makeEvent("quit", "berry", "2026-01-01T08:02:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:02:05Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    // berry's first join is interrupted by mita → individual message
    // mita's join is interrupted by chat message → individual message
    // berry's quit→join after the chat message forms an eventGroup
    expect(groups).toHaveLength(4);
    expect(groups[0].type).toBe("message"); // berry's individual join
    expect(groups[0].messages[0].userId).toBe("berry");
    expect(groups[1].type).toBe("message"); // mita's individual join
    expect(groups[1].messages[0].userId).toBe("mita");
    expect(groups[2].type).toBe("message"); // regular message
    expect(groups[3].type).toBe("eventGroup"); // berry reconnected
    expect(groups[3].userSummaries?.[0].username).toBe("berry");
  });

  it("event run before and after a message form separate groups", () => {
    const msgs = [
      makeEvent("quit", "berry", "2026-01-01T08:00:00Z"),
      makeEvent("join", "berry", "2026-01-01T08:00:10Z"),
      makeMsg("2026-01-01T08:01:00Z"),
      makeEvent("quit", "mita", "2026-01-01T08:02:00Z"),
      makeEvent("join", "mita", "2026-01-01T08:02:10Z"),
    ];
    const groups = groupConsecutiveEvents(msgs);
    expect(groups).toHaveLength(3);
    const [g0, g1, g2] = groups;
    expect(g0.type).toBe("eventGroup");
    expect(g0.userSummaries?.[0].username).toBe("berry");
    expect(g1.type).toBe("message");
    expect(g2.type).toBe("eventGroup");
    expect(g2.userSummaries?.[0].username).toBe("mita");
  });
});
