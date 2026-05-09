import type React from "react";
import { useEffect, useState } from "react";
import type { OAuthCallbackMessage } from "../lib/oauth";

// Loaded at /oauth/callback inside the popup window the OAuth flow opened.
// Pulls `code` and `state` (or `error`) from the query string, sends them
// back to the opener via postMessage, then closes itself.
export const OAuthCallback: React.FC = () => {
  const [message, setMessage] = useState("Completing sign-in...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") ?? undefined;
    const state = params.get("state") ?? "";
    const error = params.get("error") ?? undefined;
    const errorDescription = params.get("error_description") ?? undefined;

    const payload: OAuthCallbackMessage = {
      type: "obsidianirc:oauth-callback",
      state,
      code,
      error,
      errorDescription,
    };

    if (window.opener && window.opener !== window) {
      try {
        window.opener.postMessage(payload, window.location.origin);
        setMessage("Sign-in complete. You can close this window.");
        setTimeout(() => {
          try {
            window.close();
          } catch {}
        }, 300);
        return;
      } catch (err) {
        setMessage(
          `Could not return tokens to the main window: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return;
      }
    }
    setMessage(
      "OAuth callback was loaded outside its popup. You can close this tab.",
    );
  }, []);

  return (
    <div className="flex h-screen items-center justify-center bg-discord-dark-200 text-discord-text-normal">
      <div className="max-w-md p-6 text-center">
        <h1 className="text-xl font-bold mb-2">OAuth sign-in</h1>
        <p className="text-discord-text-muted">{message}</p>
      </div>
    </div>
  );
};

export default OAuthCallback;
