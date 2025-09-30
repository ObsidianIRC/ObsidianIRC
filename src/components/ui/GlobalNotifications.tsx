import type React from "react";
import { FaExclamationTriangle, FaTimesCircle } from "react-icons/fa";
import { mircToHtml } from "../../lib/ircUtils";
import useStore from "../../store";

export const GlobalNotifications: React.FC = () => {
  const { globalNotifications, removeGlobalNotification } = useStore();

  if (globalNotifications.length === 0) {
    return null;
  }

  const getIcon = (type: "fail" | "warn" | "note") => {
    switch (type) {
      case "fail":
        return <FaTimesCircle className="text-red-500 flex-shrink-0" />;
      case "warn":
        return (
          <FaExclamationTriangle className="text-yellow-500 flex-shrink-0" />
        );
      case "note":
        return null; // Notes don't need global notification treatment
      default:
        return null;
    }
  };

  const getBackgroundColor = (type: "fail" | "warn" | "note") => {
    switch (type) {
      case "fail":
        return "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800";
      case "warn":
        return "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800";
      case "note":
        return "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800";
      default:
        return "bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800";
    }
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // Only show FAIL and WARN notifications globally
  const visibleNotifications = globalNotifications.filter(
    (n: { type: "fail" | "warn" | "note" }) =>
      n.type === "fail" || n.type === "warn",
  );

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {visibleNotifications.map(
        (notification: {
          id: string;
          type: "fail" | "warn" | "note";
          command: string;
          code: string;
          message: string;
          target?: string;
          serverId: string;
          timestamp: Date;
        }) => (
          <div
            key={notification.id}
            className={`p-3 rounded-lg border shadow-lg ${getBackgroundColor(notification.type)} animate-in slide-in-from-right-2 fade-in duration-300`}
          >
            <div className="flex items-start gap-2">
              {getIcon(notification.type)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {notification.type.toUpperCase()} {notification.command}{" "}
                    {notification.code}
                    {notification.target && ` ${notification.target}`}
                  </div>
                  <button
                    onClick={() => removeGlobalNotification(notification.id)}
                    className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                    aria-label="Dismiss notification"
                  >
                    ×
                  </button>
                </div>
                <div
                  className="text-sm text-gray-700 dark:text-gray-300 mt-1"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: IRC formatting is sanitized by mircToHtml
                  dangerouslySetInnerHTML={{
                    __html: mircToHtml(notification.message),
                  }}
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {formatTime(notification.timestamp)}
                </div>
              </div>
            </div>
          </div>
        ),
      )}
    </div>
  );
};
