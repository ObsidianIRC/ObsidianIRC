// Canonical list of slash commands the client itself handles before
// (or instead of) sending them on the wire.  Kept centralized so the
// suggestion popover (src/components/ui/SlashCommandPopover.tsx) and
// the dispatcher (src/hooks/useMessageSending.ts) can't drift apart.
//
// Each entry mirrors the fields a draft/bot-cmds schema would publish,
// so the popover + param-hint can render them with the same code path
// as PushBot commands.
//
// To add a new client-only command:
//   1. add an entry here
//   2. add the matching `commandName === "..."` branch to handleCommand
//      in src/hooks/useMessageSending.ts
//   3. that's it — the popover and param hint pick it up automatically

import type { BotCommandOption } from "../types";

export interface ClientCommand {
  name: string;
  description: string;
  options?: BotCommandOption[];
  /** Where the command makes sense.  Channel-only commands won't
   *  show in DM views. */
  scope?: "anywhere" | "channel-only";
}

export const CLIENT_COMMANDS: ClientCommand[] = [
  {
    name: "me",
    description: "Send an action / emote",
    options: [
      {
        name: "action",
        type: "string",
        required: true,
        description: "What you're doing",
      },
    ],
  },
  {
    name: "msg",
    description: "Open a private message to a user",
    options: [
      { name: "user", type: "user", required: true },
      {
        name: "message",
        type: "string",
        required: true,
        description: "First message to send",
      },
    ],
  },
  {
    name: "whisper",
    description: "Whisper to a user in the current channel context",
    scope: "channel-only",
    options: [
      { name: "user", type: "user", required: true },
      { name: "message", type: "string", required: true },
    ],
  },
  {
    name: "join",
    description: "Join a channel",
    options: [
      {
        name: "channel",
        type: "channel",
        required: true,
        description: "Channel to join (#name)",
      },
    ],
  },
  {
    name: "part",
    description: "Leave a channel",
    options: [
      {
        name: "channel",
        type: "channel",
        required: false,
        description: "Channel to leave (defaults to current)",
      },
    ],
  },
  {
    name: "nick",
    description: "Change your nickname on this server",
    options: [
      {
        name: "newnick",
        type: "string",
        required: true,
        description: "New nickname",
      },
    ],
  },
  {
    name: "away",
    description: "Mark yourself as away",
    options: [
      {
        name: "reason",
        type: "string",
        required: false,
        description: "Away message",
      },
    ],
  },
  {
    name: "back",
    description: "Mark yourself as back",
  },
];

export const CLIENT_COMMAND_NAMES: Set<string> = new Set(
  CLIENT_COMMANDS.map((c) => c.name),
);
