import { useEffect, useState } from "react";

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
        <svg
          className="animate-spin h-3 w-3"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            opacity="0.25"
          />
          <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
        </svg>
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
      <svg
        className="h-3.5 w-3.5"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
      </svg>
    </button>
  );
}
