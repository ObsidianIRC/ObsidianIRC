import type React from "react";
import {
  FaExclamationTriangle,
  FaInfoCircle,
  FaTimesCircle,
} from "react-icons/fa";
import { mircToHtml } from "../../lib/ircUtils";
import { EnhancedLinkWrapper } from "../ui/LinkWrapper";

interface StandardReplyNotificationProps {
  type: "FAIL" | "WARN" | "NOTE";
  command: string;
  code: string;
  message: string;
  target?: string;
  timestamp: Date;
  onIrcLinkClick?: (url: string) => void;
}

export const StandardReplyNotification: React.FC<
  StandardReplyNotificationProps
> = ({ type, command, code, message, target, timestamp, onIrcLinkClick }) => {
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getIcon = () => {
    switch (type) {
      case "FAIL":
        return <FaTimesCircle className="text-red-500 flex-shrink-0" />;
      case "WARN":
        return (
          <FaExclamationTriangle className="text-yellow-500 flex-shrink-0" />
        );
      case "NOTE":
        return <FaInfoCircle className="text-blue-500 flex-shrink-0" />;
      default:
        return null;
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case "FAIL":
        return "bg-red-100 dark:bg-red-950/50 border-red-300 dark:border-red-700";
      case "WARN":
        return "bg-yellow-100 dark:bg-yellow-950/50 border-yellow-300 dark:border-yellow-700";
      case "NOTE":
        return "bg-blue-100 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700";
      default:
        return "bg-gray-100 dark:bg-gray-950/50 border-gray-300 dark:border-gray-700";
    }
  };

  const getTextColor = () => {
    switch (type) {
      case "FAIL":
        return "text-red-800 dark:text-red-200";
      case "WARN":
        return "text-yellow-800 dark:text-yellow-200";
      case "NOTE":
        return "text-blue-800 dark:text-blue-200";
      default:
        return "text-gray-800 dark:text-gray-200";
    }
  };

  const htmlContent = mircToHtml(message);

  return (
    <div
      className={`mx-4 my-2 p-3 rounded-lg border ${getBackgroundColor()} shadow-sm`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{getIcon()}</div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${getTextColor()} mb-1`}>
            {type} {command} {code}
            {target && <span className="font-normal"> • {target}</span>}
          </div>
          <div className={`text-sm ${getTextColor()} leading-relaxed`}>
            <EnhancedLinkWrapper onIrcLinkClick={onIrcLinkClick}>
              {htmlContent}
            </EnhancedLinkWrapper>
          </div>
          <div className={`text-xs ${getTextColor()} opacity-70 mt-2`}>
            {formatTime(timestamp)}
          </div>
        </div>
      </div>
    </div>
  );
};
