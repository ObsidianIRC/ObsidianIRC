import { useLingui } from "@lingui/react/macro";
import type React from "react";
import { useMemo } from "react";
import { FaProjectDiagram } from "react-icons/fa";
import { AI_TOOLS_TAG, decodeAiToolsValue } from "../../lib/aiTools";
import useStore from "../../store";

interface AiToolsMessagePillProps {
  serverId: string;
  tags?: Record<string, string>;
}

// A compact inline badge for chat messages that carry the
// +obby.world/ai-tools tag (typically the bot's final reply). Icon +
// step count only -- no text -- so it sits cleanly at the start of the
// message body. Click reopens the workflow card if still in state;
// degrades to a muted, disabled chip otherwise.
export const AiToolsMessagePill: React.FC<AiToolsMessagePillProps> = ({
  serverId,
  tags,
}) => {
  const { t } = useLingui();
  const rawTag = tags?.[AI_TOOLS_TAG];

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
        if (workflow.channel?.startsWith("#")) {
          selectServer(workflow.serverId);
        }
        reopen(workflow.serverId, workflow.id);
      }}
      // Borderless, muted chip. Reactions sit on the same row so the
      // old bordered/coloured pill read as another reaction. Drop the
      // border + tint, lean on hover-only to draw attention.
      className={`shrink-0 mt-[3px] inline-flex items-center gap-1 px-1 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
        available
          ? "text-discord-text-muted hover:text-white hover:bg-discord-dark-300/60"
          : "text-discord-text-muted/60 cursor-not-allowed"
      }`}
      title={
        available
          ? t`Reopen the workflow that produced this message (${stepCount} steps)`
          : t`The workflow that produced this message is no longer in state`
      }
    >
      <FaProjectDiagram className="text-[9px]" />
      {available && <span>{stepCount}</span>}
    </button>
  );
};

export default AiToolsMessagePill;
