import type { StoreApi } from "zustand";
import {
  AI_TOOLS_TAG,
  type AiStepMessage,
  type AiWorkflowMessage,
  decodeAiToolsValue,
} from "../../lib/aiTools";
import ircClient from "../../lib/ircClient";
import type { AiStep, AiWorkflow, AppState } from "../index";

function nowMs(): number {
  return Date.now();
}

function emptyWorkflow(
  serverId: string,
  channel: string,
  senderNick: string,
  m: AiWorkflowMessage,
): AiWorkflow {
  return {
    id: m.id,
    serverId,
    channel,
    senderNick,
    name: m.name,
    state: m.state,
    trigger: m.trigger,
    prompt: m.prompt,
    cancelledBy: m["cancelled-by"],
    startedAt: nowMs(),
    updatedAt: nowMs(),
    steps: [],
    collapsed: true,
    dismissed: false,
  };
}

function applyWorkflowUpdate(
  prev: AiWorkflow | undefined,
  serverId: string,
  channel: string,
  senderNick: string,
  m: AiWorkflowMessage,
): AiWorkflow {
  if (!prev) return emptyWorkflow(serverId, channel, senderNick, m);
  return {
    ...prev,
    state: m.state,
    name: m.name ?? prev.name,
    trigger: m.trigger ?? prev.trigger,
    prompt: m.prompt ?? prev.prompt,
    cancelledBy: m["cancelled-by"] ?? prev.cancelledBy,
    updatedAt: nowMs(),
  };
}

function applyStepUpdate(
  prev: AiWorkflow | undefined,
  m: AiStepMessage,
): { workflow: AiWorkflow; created: boolean } | undefined {
  if (!prev) return undefined;
  const idx = prev.steps.findIndex((s) => s.sid === m.sid);
  const baseStep: AiStep =
    idx === -1
      ? {
          sid: m.sid,
          type: m.type,
          state: m.state,
          tool: m.tool,
          label: m.label,
          content: m.content,
          truncated: m.truncated,
          startedAt: nowMs(),
          updatedAt: nowMs(),
        }
      : {
          ...prev.steps[idx],
          type: m.type,
          state: m.state,
          tool: m.tool ?? prev.steps[idx].tool,
          label: m.label ?? prev.steps[idx].label,
          // For string content during a content-stream the spec says
          // concatenate fragments in order; for object content (tool-call
          // args) the latest update wins.
          content:
            typeof m.content === "string" &&
            typeof prev.steps[idx].content === "string"
              ? (prev.steps[idx].content as string) + m.content
              : m.content !== undefined
                ? m.content
                : prev.steps[idx].content,
          truncated: m.truncated ?? prev.steps[idx].truncated,
          updatedAt: nowMs(),
        };
  const steps =
    idx === -1
      ? [...prev.steps, baseStep]
      : prev.steps.map((s, i) => (i === idx ? baseStep : s));
  return {
    workflow: { ...prev, steps, updatedAt: nowMs() },
    created: idx === -1,
  };
}

export function registerAiToolsHandlers(store: StoreApi<AppState>): void {
  const handleTaggedMessage = ({
    serverId,
    mtags,
    sender,
    target,
    fromPrivmsg,
  }: {
    serverId: string;
    mtags?: Record<string, string>;
    sender: string;
    target: string;
    fromPrivmsg: boolean;
  }): void => {
    const raw = mtags?.[AI_TOOLS_TAG];
    if (!raw) return;
    const msg = decodeAiToolsValue(raw);
    if (!msg) return;

    if (msg.msg === "workflow") {
      // The bot's final answer is a PRIVMSG carrying the workflow tag.
      // Stash its msgid so the workflow card can deep-link back to the
      // chat message that closed it ("Responded in chat" footer).
      const finalMsgid = fromPrivmsg ? mtags?.msgid : undefined;
      store.setState((state) => {
        const server = state.aiWorkflows[serverId] ?? {};
        const merged = applyWorkflowUpdate(
          server[msg.id],
          serverId,
          target,
          sender,
          msg,
        );
        if (finalMsgid && !merged.finalMsgid) {
          merged.finalMsgid = finalMsgid;
        }
        return {
          aiWorkflows: {
            ...state.aiWorkflows,
            [serverId]: { ...server, [msg.id]: merged },
          },
        };
      });
      return;
    }

    if (msg.msg === "step") {
      store.setState((state) => {
        const server = state.aiWorkflows[serverId] ?? {};
        const prev = server[msg.wid];
        const result = applyStepUpdate(prev, msg);
        if (!result) return state;
        return {
          aiWorkflows: {
            ...state.aiWorkflows,
            [serverId]: { ...server, [msg.wid]: result.workflow },
          },
        };
      });
      return;
    }

    // "action" messages echoed back from a bot are rare; ignore here.
  };

  ircClient.on("TAGMSG", ({ serverId, mtags, sender, channelName }) => {
    handleTaggedMessage({
      serverId,
      mtags,
      sender,
      target: channelName,
      fromPrivmsg: false,
    });
  });

  // PRIVMSG carrying the ai-tools tag is the bot's final response. We do
  // NOT suppress it from chat -- the user wants to see the answer -- but
  // we mirror its workflow-state update into the workflow record so the
  // card reflects the same lifecycle, and we record the message's msgid
  // so the card can deep-link to it.
  ircClient.on("CHANMSG", ({ serverId, mtags, sender, channelName }) => {
    handleTaggedMessage({
      serverId,
      mtags,
      sender,
      target: channelName,
      fromPrivmsg: true,
    });
  });
  ircClient.on("USERMSG", ({ serverId, mtags, sender, target }) => {
    handleTaggedMessage({
      serverId,
      mtags,
      sender,
      target,
      fromPrivmsg: true,
    });
  });
}
