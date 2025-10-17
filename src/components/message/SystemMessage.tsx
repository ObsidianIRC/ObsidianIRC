import type React from "react";
import { processMarkdownInText } from "../../lib/ircUtils";
import type { MessageType } from "../../types";
import { EnhancedLinkWrapper } from "../ui/LinkWrapper";

interface SystemMessageProps {
  message: MessageType;
  onIrcLinkClick?: (url: string) => void;
}

export const SystemMessage: React.FC<SystemMessageProps> = ({
  message,
  onIrcLinkClick,
}) => {
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const htmlContent = processMarkdownInText(
    message.content,
    true,
    false,
    message.id || message.msgid || "system",
  );

  return (
    <div className="px-4 py-1 text-discord-text-muted text-sm opacity-80">
      <div className="flex items-center gap-2">
        <div className="w-1 h-1 rounded-full bg-discord-text-muted" />
        <EnhancedLinkWrapper onIrcLinkClick={onIrcLinkClick}>
          {htmlContent}
        </EnhancedLinkWrapper>
        <div className="text-xs opacity-70">
          {formatTime(new Date(message.timestamp))}
        </div>
      </div>
    </div>
  );
};
