import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect, useState } from "react";

interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  error: string | null;
  version: string | null;
}

export function useAutoUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({
    checking: false,
    available: false,
    downloading: false,
    error: null,
    version: null,
  });

  const checkForUpdates = async (silent = false) => {
    try {
      setStatus((prev) => ({ ...prev, checking: true, error: null }));

      const update = await check();

      if (update) {
        setStatus((prev) => ({
          ...prev,
          available: true,
          version: update.version,
          checking: false,
        }));

        if (!silent) {
          const shouldUpdate = await ask(
            `Update to version ${update.version} is available. Would you like to install it now?`,
            {
              title: "Update Available",
              kind: "info",
            },
          );

          if (shouldUpdate) {
            await installUpdate(update);
          }
        }
      } else {
        setStatus((prev) => ({ ...prev, checking: false, available: false }));
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
      setStatus((prev) => ({
        ...prev,
        checking: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }));
    }
  };

  const installUpdate = async (update: any) => {
    try {
      setStatus((prev) => ({ ...prev, downloading: true, error: null }));

      let downloaded = 0;
      let contentLength = 0;

      // Download and install the update
      await update.downloadAndInstall((event: any) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength || 0;
            console.log(`Update download started (${contentLength} bytes)`);
            break;
          case "Progress": {
            downloaded += event.data.chunkLength;
            const progress =
              contentLength > 0 ? (downloaded / contentLength) * 100 : 0;
            console.log(`Download progress: ${progress.toFixed(2)}%`);
            break;
          }
          case "Finished":
            console.log("Update download finished");
            break;
        }
      });

      setStatus((prev) => ({ ...prev, downloading: false }));

      // Ask user to restart the application
      const shouldRelaunch = await ask(
        "Update installed successfully. Restart now to apply the update?",
        {
          title: "Update Ready",
          kind: "info",
        },
      );

      if (shouldRelaunch) {
        await relaunch();
      }
    } catch (error) {
      console.error("Failed to install update:", error);
      setStatus((prev) => ({
        ...prev,
        downloading: false,
        error:
          error instanceof Error ? error.message : "Failed to install update",
      }));
    }
  };

  // Check for updates on mount (only in production)
  useEffect(() => {
    // Only check for updates in Tauri environment
    if (window.__TAURI__) {
      // Check on startup (silently)
      checkForUpdates(true);

      // Check periodically (every 6 hours)
      const interval = setInterval(
        () => {
          checkForUpdates(true);
        },
        6 * 60 * 60 * 1000,
      );

      return () => clearInterval(interval);
    }
  }, []);

  return {
    status,
    checkForUpdates,
  };
}
