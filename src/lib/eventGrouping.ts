import type { Message } from "../types";

export interface EventGroup {
  type: "message" | "eventGroup";
  messages: Message[];
  eventType?: string;
  usernames?: string[];
  timestamp: Date;
}

/**
 * Groups consecutive event messages (join, part, quit) into collapsed groups
 * while preserving regular messages and other event types as individual items
 */
export function groupConsecutiveEvents(messages: Message[]): EventGroup[] {
  const result: EventGroup[] = [];
  const collapsibleEventTypes = ["join", "part", "quit"];

  let i = 0;
  while (i < messages.length) {
    const currentMessage = messages[i];

    // If it's not a collapsible event, add as individual message
    if (!collapsibleEventTypes.includes(currentMessage.type)) {
      result.push({
        type: "message",
        messages: [currentMessage],
        timestamp: new Date(currentMessage.timestamp),
      });
      i++;
      continue;
    }

    // Start a new event group
    const eventGroup: Message[] = [currentMessage];
    const eventType = currentMessage.type;
    const startTime = new Date(currentMessage.timestamp);

    // Look ahead for consecutive events of the same type within 5 minutes
    let j = i + 1;
    while (j < messages.length) {
      const nextMessage = messages[j];
      const timeDiff =
        new Date(nextMessage.timestamp).getTime() -
        new Date(eventGroup[eventGroup.length - 1].timestamp).getTime();

      // Stop if it's not the same event type, or if there's more than 5 minutes gap
      if (nextMessage.type !== eventType || timeDiff > 5 * 60 * 1000) {
        break;
      }

      eventGroup.push(nextMessage);
      j++;
    }

    // If we have multiple events of the same type, create a group
    if (eventGroup.length > 1) {
      const usernames = eventGroup.map((msg) => msg.userId.split("-")[0]);
      result.push({
        type: "eventGroup",
        messages: eventGroup,
        eventType,
        usernames,
        timestamp: startTime,
      });
    } else {
      // Single event, add as individual message
      result.push({
        type: "message",
        messages: [currentMessage],
        timestamp: startTime,
      });
    }

    i = j;
  }

  return result;
}

/**
 * Creates a summary text for collapsed event groups
 */
export function getEventGroupSummary(
  eventGroup: EventGroup,
  currentUsername?: string,
): string {
  if (
    eventGroup.type !== "eventGroup" ||
    !eventGroup.usernames ||
    !eventGroup.eventType
  ) {
    return "";
  }

  const { usernames, eventType } = eventGroup;
  const uniqueUsernames = Array.from(new Set(usernames));

  // Replace current user's username with "You"
  const displayNames = uniqueUsernames.map((username) =>
    username === currentUsername ? "You" : username,
  );

  let action = "";
  switch (eventType) {
    case "join":
      action = "joined";
      break;
    case "part":
      action = "left";
      break;
    case "quit":
      action = "quit";
      break;
    default:
      action = eventType;
  }

  if (displayNames.length === 1) {
    const count = usernames.filter((u) => u === uniqueUsernames[0]).length;
    return count > 1
      ? `${displayNames[0]} ${action} ${count} times`
      : `${displayNames[0]} ${action}`;
  }
  if (displayNames.length === 2) {
    return `${displayNames[0]} and ${displayNames[1]} ${action}`;
  }
  if (displayNames.length === 3) {
    return `${displayNames[0]}, ${displayNames[1]} and ${displayNames[2]} ${action}`;
  }
  const others = displayNames.length - 2;
  return `${displayNames[0]}, ${displayNames[1]} and ${others} others ${action}`;
}

/**
 * Creates detailed tooltip information for event groups
 */
export function getEventGroupTooltip(eventGroup: EventGroup): string {
  if (eventGroup.type !== "eventGroup" || !eventGroup.usernames) {
    return "";
  }

  const userCounts = eventGroup.usernames.reduce(
    (acc, username) => {
      acc[username] = (acc[username] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return Object.entries(userCounts)
    .map(
      ([username, count]) =>
        `${username}: ${count} time${count > 1 ? "s" : ""}`,
    )
    .join("\n");
}
