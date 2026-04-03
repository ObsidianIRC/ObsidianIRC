import { v5 as uuidv5 } from "uuid";
import type { Message } from "../types";
import type { AppState } from "./index";

// Namespace UUID for generating deterministic channel/chat IDs
export const CHANNEL_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/**
 * Generate a deterministic UUID for a channel or private chat
 * based on the server ID and channel/chat name
 */
export function generateDeterministicId(
  serverId: string,
  name: string,
): string {
  return uuidv5(`${serverId}:${name}`, CHANNEL_NAMESPACE);
}

/**
 * Normalize host for comparison (extract hostname from URL or return as-is)
 */
export function normalizeHost(host: string): string {
  if (host.includes("://")) {
    // Extract hostname from URL format
    const withoutProtocol = host.replace(/^(irc|ircs|wss):\/\//, "");
    return withoutProtocol.split(":")[0]; // Get just hostname, strip port if present
  }
  return host;
}

/**
 * Ensure host is in URL format
 */
export function ensureUrlFormat(host: string, port: number): string {
  if (host.includes("://")) {
    return host; // Already in URL format
  }
  // Convert old hostname-only format to URL — always wss://
  return `wss://${host}:${port}`;
}

// ============================================================================
// Batch Event Types
// ============================================================================

export interface JoinBatchEvent {
  type: "JOIN";
  data: {
    serverId: string;
    username: string;
    channelName: string;
    account?: string; // From extended-join
    realname?: string; // From extended-join
  };
}

export interface QuitBatchEvent {
  type: "QUIT";
  data: {
    serverId: string;
    username: string;
    reason: string;
  };
}

export interface PartBatchEvent {
  type: "PART";
  data: {
    serverId: string;
    username: string;
    channelName: string;
    reason?: string;
  };
}

export type BatchEvent = JoinBatchEvent | QuitBatchEvent | PartBatchEvent;

export interface BatchInfo {
  type: string;
  parameters?: string[];
  events: BatchEvent[];
  startTime: Date;
  pendingMessages?: Message[];
}

// ============================================================================
// Per-Server Selection Helpers
// ============================================================================

/**
 * Get the selected channel and private chat for a specific server
 */
export function getServerSelection(state: AppState, serverId: string) {
  return (
    state.ui.perServerSelections[serverId] || {
      selectedChannelId: null,
      selectedPrivateChatId: null,
    }
  );
}

/**
 * Set the selected channel and private chat for a specific server
 */
export function setServerSelection(
  state: AppState,
  serverId: string,
  selection: {
    selectedChannelId: string | null;
    selectedChannelName?: string | null;
    selectedPrivateChatId: string | null;
    selectedPrivateChatUsername?: string | null;
  },
) {
  return {
    ...state.ui.perServerSelections,
    [serverId]: selection,
  };
}

/**
 * Get the current selection for the currently selected server
 */
export function getCurrentSelection(state: AppState) {
  if (!state.ui.selectedServerId) {
    return {
      selectedChannelId: null,
      selectedPrivateChatId: null,
    };
  }
  return getServerSelection(state, state.ui.selectedServerId);
}

// ============================================================================
// Server Capability Helpers (pure versions)
// ============================================================================

/**
 * Check if a server supports metadata capability
 */
export function serverSupportsMetadata(
  state: AppState,
  serverId: string,
): boolean {
  const server = state.servers.find((s) => s.id === serverId);
  const supports =
    server?.capabilities?.some(
      (cap) => cap === "draft/metadata-2" || cap.startsWith("draft/metadata"),
    ) ?? false;
  return supports;
}

/**
 * Check if a server supports multiline capability
 */
export function serverSupportsMultiline(
  state: AppState,
  serverId: string,
): boolean {
  const server = state.servers.find((s) => s.id === serverId);
  const supports = server?.capabilities?.includes("draft/multiline") ?? false;
  return supports;
}

// ============================================================================
// Reply Message Resolution (pure version)
// ============================================================================

/**
 * Resolve a reply message from message tags
 * @param mtags Message tags from IRC message
 * @param serverId Server ID for context
 * @param channelId Channel ID for context
 * @param messages Array of messages to search through
 * @returns The referenced message or null if not found
 */
export function resolveReplyMessage(
  mtags: Record<string, string> | undefined,
  serverId: string,
  channelId: string,
  messages: Message[],
): Message | null {
  const replyId = mtags?.["+draft/reply"]?.trim() || null;
  if (!replyId) {
    return null;
  }

  return (
    messages.find(
      (message) =>
        message.msgid === replyId ||
        message.multilineMessageIds?.includes(replyId),
    ) ?? null
  );
}
