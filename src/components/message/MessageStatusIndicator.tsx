import { useEffect, useState } from "react";
import { RefreshIcon, SpinnerIcon } from "./icons";

// Delay before a still-pending message shows the spinner. Short enough
// to feel responsive on a slow echo, long enough that the common case
// (echo arrives in <500ms) never flashes a spinner.
const SPINNER_DELAY_MS = 500;

interface MessageStatusIndicatorProps {
  status: "pending" | "failed";
  onRetry?: () => void;
}

export function MessageStatusIndicator({
  status,
  onRetry,
}: MessageStatusIndicatorProps) {
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    if (status !== "pending") {
      setShowSpinner(false);
      return;
    }
    const timer = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === "pending") {
    if (!showSpinner) return null;
    return (
      <span
        role="status"
        className="ml-2 inline-flex items-center text-discord-text-muted align-middle"
        aria-label="Sending"
      >
        <SpinnerIcon className="animate-spin h-3 w-3" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onRetry}
      className="ml-2 inline-flex items-center text-discord-text-muted hover:text-discord-red cursor-pointer bg-transparent border-none p-0 align-middle"
      aria-label="Retry sending"
      title="Retry sending"
    >
      <RefreshIcon className="h-3.5 w-3.5" />
    </button>
  );
}
