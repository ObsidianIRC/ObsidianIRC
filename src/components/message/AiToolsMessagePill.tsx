import { Trans } from "@lingui/react/macro";
import type React from "react";
import { useMemo } from "react";
import { FaCog } from "react-icons/fa";
import { AI_TOOLS_TAG, decodeAiToolsValue } from "../../lib/aiTools";
import useStore from "../../store";

interface AiToolsMessagePillProps {
  serverId: string;
  tags?: Record<string, string>;
}

// Renders a small "View workflow" badge under a chat message that
// carries the +obby.world/ai-tools tag (the bot's final reply). Click
// reopens the workflow card in the tray if the workflow is still in
// state -- gracefully degrades to a disabled state otherwise.
export const AiToolsMessagePill: React.FC<AiToolsMessagePillProps> = ({
  serverId,
  tags,
}) => {
  const rawTag = tags?.[AI_TOOLS_TAG];

  // Decode once per message. The tag may be either a `workflow` or
  // `step` envelope; only `workflow.id` is useful here, so anything
  // else short-circuits and we render nothing.
  const workflowId = useMemo(() => {
    if (!rawTag) return undefined;
    const decoded = decodeAiToolsValue(rawTag);
    if (!decoded) return undefined;
    if (decoded.msg === "workflow") return decoded.id;
    if (decoded.msg === "step") return decoded.wid;
    return undefined;
  }, [rawTag]);

  const workflow = useStore((s) =>
    workflowId ? s.aiWorkflows[serverId]?.[workflowId] : undefined,
  );
  const reopen = useStore((s) => s.aiWorkflowReopen);
  const selectServer = useStore((s) => s.selectServer);

  if (!workflowId) return null;

  const available = !!workflow;
  const stepCount = workflow?.steps.length ?? 0;

  return (
    <button
      type="button"
      disabled={!available}
      onClick={() => {
        if (!available || !workflow) return;
        // Make sure the tray containing the card is in view: select the
        // workflow's announce channel before un-dismissing so the card
        // appears immediately, even if the user navigated elsewhere.
        if (workflow.channel?.startsWith("#")) {
          selectServer(workflow.serverId);
        }
        reopen(workflow.serverId, workflow.id);
      }}
      className={`mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
        available
          ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
          : "border-discord-dark-400 bg-discord-dark-400/30 text-discord-text-muted cursor-not-allowed"
      }`}
      title={
        available
          ? "Reopen the workflow that produced this message"
          : "The workflow that produced this message is no longer in state"
      }
    >
      <FaCog className="text-[9px]" />
      {available ? (
        <Trans>View workflow ({stepCount} steps)</Trans>
      ) : (
        <Trans>Workflow not available</Trans>
      )}
    </button>
  );
};

export default AiToolsMessagePill;
