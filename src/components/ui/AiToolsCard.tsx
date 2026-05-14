import { Trans, useLingui } from "@lingui/react/macro";
import type React from "react";
import { useMemo } from "react";
import {
  FaCheck,
  FaChevronDown,
  FaChevronUp,
  FaCog,
  FaExclamationTriangle,
  FaSpinner,
  FaTimes,
  FaTimesCircle,
} from "react-icons/fa";
import type { AiStep, AiWorkflow } from "../../store";
import useStore from "../../store";

interface AiToolsCardProps {
  workflow: AiWorkflow;
}

const STEP_TYPE_ACCENT: Record<string, string> = {
  thinking: "bg-purple-400",
  "tool-call": "bg-cyan-400",
  "tool-result": "bg-emerald-400",
  text: "bg-discord-text-muted",
};

function workflowHeaderIcon(state: AiWorkflow["state"]) {
  switch (state) {
    case "complete":
      return <FaCheck className="text-green-400" />;
    case "failed":
      return <FaTimesCircle className="text-red-400" />;
    case "cancelled":
      return <FaExclamationTriangle className="text-yellow-400" />;
    default:
      return <FaSpinner className="text-discord-text-muted animate-spin" />;
  }
}

// Render a single step the way Claude Code does: colored dot at the
// start of the row, terse header line ("Tool: web-search"), then the
// content payload in a monospace box if present.
const Step: React.FC<{ step: AiStep }> = ({ step }) => {
  const accent = STEP_TYPE_ACCENT[step.type] ?? STEP_TYPE_ACCENT.text;

  const headerLabel = useMemo(() => {
    if (step.label) return step.label;
    if (step.type === "tool-call" || step.type === "tool-result")
      return step.tool ? `${step.tool}` : step.type;
    if (step.type === "thinking") return "Thinking";
    return "Text";
  }, [step.label, step.tool, step.type]);

  const contentRendered = useMemo(() => {
    if (step.content === undefined || step.content === null) return null;
    if (typeof step.content === "string") {
      return (
        <pre className="mt-1.5 text-xs leading-snug text-discord-text-normal whitespace-pre-wrap break-words font-mono bg-discord-dark-500/70 rounded px-2.5 py-1.5">
          {step.content}
        </pre>
      );
    }
    // Tool-call args: nested object, pretty-print as JSON.
    return (
      <pre className="mt-1.5 text-xs leading-snug text-discord-text-normal whitespace-pre-wrap break-words font-mono bg-discord-dark-500/70 rounded px-2.5 py-1.5">
        {JSON.stringify(step.content, null, 2)}
      </pre>
    );
  }, [step.content]);

  const stateGlyph = (() => {
    switch (step.state) {
      case "complete":
        return <FaCheck className="text-green-400 text-[10px]" />;
      case "failed":
        return <FaTimesCircle className="text-red-400 text-[10px]" />;
      case "cancelled":
        return <FaTimes className="text-discord-text-muted text-[10px]" />;
      case "pending-approval":
        return (
          <FaExclamationTriangle className="text-yellow-400 text-[10px]" />
        );
      default:
        return (
          <FaSpinner className="text-discord-text-muted text-[10px] animate-spin" />
        );
    }
  })();

  return (
    <div className="flex gap-2.5 py-2 pr-3 pl-2">
      <span
        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${accent}`}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-discord-text-muted">
            {step.type === "tool-call" || step.type === "tool-result" ? (
              <Trans>Tool</Trans>
            ) : step.type === "thinking" ? (
              <Trans>Thinking</Trans>
            ) : (
              <Trans>Text</Trans>
            )}
          </span>
          <span className="text-sm font-medium text-white truncate">
            {headerLabel}
          </span>
          <span className="ml-auto shrink-0">{stateGlyph}</span>
        </div>
        {contentRendered}
        {step.truncated && (
          <div className="mt-1 text-[10px] text-yellow-400">
            <Trans>output truncated</Trans>
          </div>
        )}
      </div>
    </div>
  );
};

export const AiToolsCard: React.FC<AiToolsCardProps> = ({ workflow }) => {
  const { t } = useLingui();
  const setCollapsed = useStore((s) => s.aiWorkflowSetCollapsed);
  const dismiss = useStore((s) => s.aiWorkflowDismiss);
  const sendAction = useStore((s) => s.aiSendAction);

  const isTerminal =
    workflow.state === "complete" ||
    workflow.state === "failed" ||
    workflow.state === "cancelled";

  const onToggle = () =>
    setCollapsed(workflow.serverId, workflow.id, !workflow.collapsed);

  const onCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    sendAction(workflow.serverId, workflow.senderNick, {
      msg: "action",
      action: "cancel",
      target: workflow.id,
    });
  };

  const onApprove = (sid: string) => {
    sendAction(workflow.serverId, workflow.senderNick, {
      msg: "action",
      action: "approve",
      target: sid,
    });
  };

  const onReject = (sid: string) => {
    sendAction(workflow.serverId, workflow.senderNick, {
      msg: "action",
      action: "reject",
      target: sid,
    });
  };

  const pendingApprovals = workflow.steps.filter(
    (s) => s.state === "pending-approval",
  );

  return (
    <div className="w-[340px] max-w-full bg-discord-dark-300/95 backdrop-blur-sm border border-discord-dark-400 rounded-lg shadow-xl overflow-hidden">
      {/* Header — collapsed row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-discord-dark-400/60 transition-colors text-left"
        aria-expanded={!workflow.collapsed}
      >
        <span className="w-6 h-6 flex items-center justify-center shrink-0">
          {workflowHeaderIcon(workflow.state)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
            <FaCog className="text-[10px] text-discord-text-muted shrink-0" />
            {workflow.senderNick}
          </div>
          {workflow.name && (
            <div className="text-xs text-discord-text-muted truncate">
              {workflow.name}
            </div>
          )}
        </div>
        {isTerminal && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismiss(workflow.serverId, workflow.id);
            }}
            className="text-discord-text-muted hover:text-white p-1 rounded"
            aria-label={t`Dismiss`}
          >
            <FaTimes className="text-xs" />
          </button>
        )}
        {!isTerminal && (
          <button
            type="button"
            onClick={onCancel}
            className="text-discord-text-muted hover:text-red-400 px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded"
            aria-label={t`Cancel workflow`}
          >
            <Trans>Stop</Trans>
          </button>
        )}
        <span className="text-discord-text-muted shrink-0 ml-1">
          {workflow.collapsed ? (
            <FaChevronDown className="text-xs" />
          ) : (
            <FaChevronUp className="text-xs" />
          )}
        </span>
      </button>

      {/* Expanded body — step list */}
      {!workflow.collapsed && (
        <div className="border-t border-discord-dark-400 max-h-[420px] overflow-y-auto divide-y divide-discord-dark-400/60">
          {workflow.steps.length === 0 ? (
            <div className="px-3 py-4 text-xs text-discord-text-muted">
              <Trans>Waiting for first step…</Trans>
            </div>
          ) : (
            workflow.steps.map((step) => (
              <div key={step.sid}>
                <Step step={step} />
                {step.state === "pending-approval" && (
                  <div className="flex items-center gap-2 px-3 pb-3 -mt-1">
                    <button
                      type="button"
                      onClick={() => onApprove(step.sid)}
                      className="flex-1 px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white text-xs font-semibold"
                    >
                      <Trans>Approve</Trans>
                    </button>
                    <button
                      type="button"
                      onClick={() => onReject(step.sid)}
                      className="flex-1 px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                    >
                      <Trans>Reject</Trans>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Collapsed-state attention hint when an approval is pending */}
      {workflow.collapsed && pendingApprovals.length > 0 && (
        <div className="px-3 py-1.5 border-t border-discord-dark-400 bg-yellow-500/10 text-yellow-300 text-[11px] flex items-center gap-1.5">
          <FaExclamationTriangle className="shrink-0" />
          <Trans>{pendingApprovals.length} step(s) awaiting approval</Trans>
        </div>
      )}
    </div>
  );
};

export default AiToolsCard;
