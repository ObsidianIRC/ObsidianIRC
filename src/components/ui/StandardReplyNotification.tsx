import type React from "react";
import {
  FaExclamationTriangle,
  FaInfoCircle,
  FaTimesCircle,
} from "react-icons/fa";
import { processMarkdownInText } from "../../lib/ircUtils";
import { EnhancedLinkWrapper } from "../ui/LinkWrapper";

interface StandardReplyNotificationProps {
  type: "FAIL" | "WARN" | "NOTE";
  command: string;
  code: string;
  message: string;
  target?: string;
  context?: string[];
  timestamp: Date;
  onIrcLinkClick?: (url: string) => void;
}

// IRCv3 standard-replies: only `<description>` is intended for human display.
// `<command>` and `<code>` are computer-readable; we keep them on the row's
// title attribute so power users can hover for the technical detail.
// `<context>` strings are real-world identifiers (channel, nick, account)
// referenced by the description — those are useful to the user, so we render
// them as small chips alongside the message.
export const StandardReplyNotification: React.FC<
  StandardReplyNotificationProps
> = ({
  type,
  command,
  code,
  message,
  target,
  context,
  timestamp,
  onIrcLinkClick,
}) => {
  const formatTime = (date: Date) =>
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);

  const icon =
    type === "FAIL" ? (
      <FaTimesCircle className="text-red-500 flex-shrink-0" />
    ) : type === "WARN" ? (
      <FaExclamationTriangle className="text-yellow-500 flex-shrink-0" />
    ) : (
      <FaInfoCircle className="text-blue-500 flex-shrink-0" />
    );

  const bg =
    type === "FAIL"
      ? "bg-red-100 dark:bg-red-950/50 border-red-300 dark:border-red-700"
      : type === "WARN"
        ? "bg-yellow-100 dark:bg-yellow-950/50 border-yellow-300 dark:border-yellow-700"
        : "bg-blue-100 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700";

  const textColor =
    type === "FAIL"
      ? "text-red-800 dark:text-red-200"
      : type === "WARN"
        ? "text-yellow-800 dark:text-yellow-200"
        : "text-blue-800 dark:text-blue-200";

  const chipBg =
    type === "FAIL"
      ? "bg-red-200/60 dark:bg-red-900/60"
      : type === "WARN"
        ? "bg-yellow-200/60 dark:bg-yellow-900/60"
        : "bg-blue-200/60 dark:bg-blue-900/60";

  // Resolve which context strings to show. Fall back to legacy `target` when
  // `context` isn't provided (older callers).
  const ctx = context && context.length > 0 ? context : target ? [target] : [];

  // Hover tooltip carries the computer-readable bits for power users.
  const hoverTitle = `${type} ${command} ${code}${ctx.length ? ` ${ctx.join(" ")}` : ""}`;

  const description = message.trim();
  const htmlContent = description
    ? processMarkdownInText(
        description,
        true,
        false,
        `standard-reply-${command}-${code}-${timestamp.getTime()}`,
      )
    : "";

  return (
    <div
      className={`mx-4 my-2 p-3 rounded-lg border ${bg} shadow-sm`}
      title={hoverTitle}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div
            className={`text-sm ${textColor} leading-relaxed break-words [overflow-wrap:anywhere]`}
          >
            {ctx.map((c) => (
              <span
                key={c}
                className={`inline-block ${chipBg} ${textColor} text-xs font-mono rounded px-1.5 py-0.5 mr-2 align-middle`}
              >
                {c}
              </span>
            ))}
            {htmlContent ? (
              <EnhancedLinkWrapper onIrcLinkClick={onIrcLinkClick}>
                {htmlContent}
              </EnhancedLinkWrapper>
            ) : (
              <span className="opacity-60 italic">(no description)</span>
            )}
          </div>
          <div className={`text-xs ${textColor} opacity-60 mt-2`}>
            {formatTime(timestamp)}
          </div>
        </div>
      </div>
    </div>
  );
};
