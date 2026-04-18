import { plural, t } from "@lingui/core/macro";
import type { Message } from "../types";

export interface UserEventSummary {
  username: string;
  summary: string;
  timestamp: Date;
  // Ordered sequence of event types for this user in the group, e.g. ["quit","join","quit","join"]
  eventSequence: string[];
}

export interface EventGroup {
  type: "message" | "eventGroup";
  messages: Message[];
  eventType?: string;
  usernames?: string[];
  userSummaries?: UserEventSummary[];
  timestamp: Date;
}

const COLLAPSIBLE_EVENT_TYPES = ["join", "part", "quit"];

function computeUserSummary(types: string[]): string {
  // Final departure always wins so the summary is never misleading about current presence.
  const last = types[types.length - 1];
  if (last === "quit")
    return types.length === 2 && types[0] === "join"
      ? t`joined and quit`
      : t`quit`;
  if (last === "part") return t`left`;

  // Last event is join — check for quit→join reconnect cycles.
  let reconnectCount = 0;
  for (let i = 0; i < types.length - 1; i++) {
    if (types[i] === "quit" && types[i + 1] === "join") reconnectCount++;
  }
  if (reconnectCount > 0)
    return plural(reconnectCount, {
      one: "reconnected",
      other: `reconnected ${reconnectCount} times`,
    });

  const joinCount = types.filter((type) => type === "join").length;
  if (joinCount > 0)
    return plural(joinCount, {
      one: "joined",
      other: `joined ${joinCount} times`,
    });

  return t`quit`;
}

/**
 * Groups consecutive same-user events (join, part, quit) into collapsed rows.
 *
 * A run accumulates only while the same user produces back-to-back collapsible
 * events. Any chat message or a different user's event flushes the current run.
 * Single-event runs are emitted as individual messages (no collapse).
 *
 * Live events (fromHistory !== true) are never collapsed — they are always
 * emitted as individual messages so the real-time feed stays unambiguous.
 */
export function groupConsecutiveEvents(messages: Message[]): EventGroup[] {
  const result: EventGroup[] = [];
  let currentUserId: string | null = null;
  let currentRun: Message[] = [];

  const flushRun = () => {
    if (currentRun.length === 0) return;
    // Only aggregate runs where every event came from chathistory replay.
    // Live events always render as individual rows.
    const canAggregate = currentRun.every((m) => m.fromHistory === true);
    if (currentRun.length === 1 || !canAggregate) {
      for (const msg of currentRun) {
        result.push({
          type: "message",
          messages: [msg],
          timestamp: new Date(msg.timestamp),
        });
      }
    } else {
      const username = currentRun[0].userId;
      const types = currentRun.map((m) => m.type);
      const lastTimestamp = new Date(
        currentRun[currentRun.length - 1].timestamp,
      );
      result.push({
        type: "eventGroup",
        messages: currentRun,
        userSummaries: [
          {
            username,
            summary: computeUserSummary(types),
            timestamp: lastTimestamp,
            eventSequence: types,
          },
        ],
        usernames: [username],
        timestamp: lastTimestamp,
      });
    }
    currentUserId = null;
    currentRun = [];
  };

  for (const msg of messages) {
    if (!COLLAPSIBLE_EVENT_TYPES.includes(msg.type)) {
      flushRun();
      result.push({
        type: "message",
        messages: [msg],
        timestamp: new Date(msg.timestamp),
      });
    } else if (msg.userId === currentUserId) {
      currentRun.push(msg);
    } else {
      flushRun();
      currentUserId = msg.userId;
      currentRun = [msg];
    }
  }

  flushRun();
  return result;
}

/**
 * Returns a compact single-line summary for an event group.
 * Used as fallback text (e.g., in accessibility contexts).
 */
export function getEventGroupSummary(
  eventGroup: EventGroup,
  currentUsername?: string,
): string {
  if (eventGroup.type !== "eventGroup") return "";

  if (eventGroup.userSummaries) {
    return eventGroup.userSummaries
      .map((us) => {
        const name = us.username === currentUsername ? "You" : us.username;
        return `${name} ${us.summary}`;
      })
      .join(" · ");
  }

  // Legacy fallback
  const { usernames, eventType } = eventGroup;
  if (!usernames || !eventType) return "";
  const unique = Array.from(new Set(usernames));
  const displayNames = unique.map((u) => (u === currentUsername ? "You" : u));
  const action =
    eventType === "join" ? "joined" : eventType === "part" ? "left" : "quit";
  if (displayNames.length === 1) {
    const count = usernames.filter((u) => u === unique[0]).length;
    return count > 1
      ? `${displayNames[0]} ${action} ${count} times`
      : `${displayNames[0]} ${action}`;
  }
  if (displayNames.length === 2)
    return `${displayNames[0]} and ${displayNames[1]} ${action}`;
  if (displayNames.length === 3)
    return `${displayNames[0]}, ${displayNames[1]} and ${displayNames[2]} ${action}`;
  return `${displayNames[0]}, ${displayNames[1]} and ${displayNames.length - 2} others ${action}`;
}

/**
 * Returns tooltip text showing the detailed event sequence per user.
 */
export function getEventGroupTooltip(eventGroup: EventGroup): string {
  if (eventGroup.type !== "eventGroup") return "";

  if (eventGroup.userSummaries) {
    return eventGroup.userSummaries
      .map((us) => {
        const seq = us.eventSequence;
        const formatted =
          seq.length > 4
            ? `${seq.slice(0, 2).join(" → ")} → ... → ${seq.slice(-2).join(" → ")}`
            : seq.join(" → ");
        return `${us.username}: ${formatted}`;
      })
      .join("\n");
  }

  // Legacy fallback
  const { usernames } = eventGroup;
  if (!usernames) return "";
  const counts = usernames.reduce(
    (acc, u) => {
      acc[u] = (acc[u] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  return Object.entries(counts)
    .map(
      ([u, c]) => `${u}: ${plural(c, { one: "1 time", other: `${c} times` })}`,
    )
    .join("\n");
}
