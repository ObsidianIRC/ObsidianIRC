import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaArrowDown,
  FaExclamationTriangle,
  FaShieldAlt,
  FaSpinner,
} from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import useStore, {
  loadSavedServers,
  saveServersToLocalStorage,
} from "../../store";

interface WarningModalProps {
  serverId: string;
  timestamp: number;
}

const SingleWarningModal: React.FC<WarningModalProps> = ({
  serverId,
  timestamp,
}) => {
  const [timerExpired, setTimerExpired] = useState(false);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);
  const [hasScrollbar, setHasScrollbar] = useState(false);
  const [skipLocalhostWarning, setSkipLocalhostWarning] = useState(false);
  const [skipLinkSecurityWarning, setSkipLinkSecurityWarning] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timerStartedRef = useRef(false);

  // Scroll detection and scrollbar check
  useEffect(() => {
    const checkScroll = () => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const hasScroll = container.scrollHeight > container.clientHeight;
      const isAtBottom =
        Math.abs(
          container.scrollHeight - container.scrollTop - container.clientHeight,
        ) < 5;

      setHasScrollbar(hasScroll);
      setIsScrolledToBottom(isAtBottom);

      // Start timer only when scrolled to bottom (or no scrollbar)
      if (!timerStartedRef.current && (!hasScroll || isAtBottom)) {
        timerStartedRef.current = true;
        setTimeout(() => {
          setTimerExpired(true);
        }, 2000);
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      // Check initially
      checkScroll();

      // Add scroll listener
      container.addEventListener("scroll", checkScroll);

      // Check on resize
      const resizeObserver = new ResizeObserver(checkScroll);
      resizeObserver.observe(container);

      return () => {
        container.removeEventListener("scroll", checkScroll);
        resizeObserver.disconnect();
      };
    }
  }, []);

  const server = useStore.getState().servers.find((s) => s.id === serverId);
  const savedServers = loadSavedServers();
  const serverConfig = savedServers.find((s) => s.id === serverId);

  if (!server) return null;

  const serverName =
    server.name || serverConfig?.name || server.host || "Unknown Server";
  const securityLevel = server.linkSecurity || 0;
  const isLocalhost =
    server.host === "localhost" || server.host === "127.0.0.1";
  const isLinkSecurityWarning =
    server.linkSecurity !== undefined && server.linkSecurity < 2;

  const removeWarning = () => {
    useStore.setState((state) => ({
      ui: {
        ...state.ui,
        linkSecurityWarnings: state.ui.linkSecurityWarnings.filter(
          (w) => w.serverId !== serverId,
        ),
      },
    }));
  };

  const buttonsEnabled = timerExpired && isScrolledToBottom;

  const handleContinue = () => {
    if (!buttonsEnabled) return;

    // Reload saved servers to get the latest data
    const currentSavedServers = loadSavedServers();

    // Update server configuration based on checkboxes
    const updatedServers = currentSavedServers.map((s) => {
      if (s.id === serverId) {
        return {
          ...s,
          ...(skipLocalhostWarning &&
            isLocalhost && { skipLocalhostWarning: true }),
          ...(skipLinkSecurityWarning &&
            isLinkSecurityWarning && { skipLinkSecurityWarning: true }),
        };
      }
      return s;
    });
    saveServersToLocalStorage(updatedServers);

    // Remove this warning from the array
    removeWarning();

    // Resume connection by sending CAP END
    ircClient.sendRaw(serverId, "CAP END");
    ircClient.userOnConnect(serverId);
  };

  const handleCancel = () => {
    // Disconnect from the server since user cancelled the insecure connection
    const state = useStore.getState();
    state.disconnect(serverId);

    // Remove the server from the server list completely
    const savedServers = loadSavedServers();

    // Remove from localStorage by ID
    const updatedServers = savedServers.filter((s) => s.id !== serverId);
    saveServersToLocalStorage(updatedServers);

    // Remove from state
    useStore.setState((state) => ({
      servers: state.servers.filter((server) => server.id !== serverId),
    }));

    // Remove this warning from the array
    removeWarning();
  };

  const handleScrollToBottom = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      // Play error sound when trying to click away
      try {
        const audio = new Audio("/sounds/error.mp3");
        audio.volume = 0.3;
        audio.play().catch(() => {
          // Ignore errors if audio can't play
        });
      } catch (error) {
        // Ignore errors
      }
      // Don't close the modal
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      // Play error sound when trying to press escape
      try {
        const audio = new Audio("/sounds/error.mp3");
        audio.volume = 0.3;
        audio.play().catch(() => {
          // Ignore errors if audio can't play
        });
      } catch (error) {
        // Ignore errors
      }
      // Don't close the modal
    }
  };

  const showScrollButton = hasScrollbar && !isScrolledToBottom;

  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-discord-dark-400 rounded-lg shadow-xl border border-discord-dark-300 max-w-md w-full flex flex-col max-h-[90vh] h-[600px]">
        {/* Header */}
        <div className="p-4 border-b border-discord-dark-300 flex-shrink-0">
          <div className="flex items-center gap-3">
            <FaExclamationTriangle className="text-yellow-500 text-xl flex-shrink-0" />
            <h2 className="text-lg font-semibold text-white">
              Security Warning
            </h2>
          </div>
        </div>

        {/* Scrollable Content with scroll button */}
        <div className="relative flex-1">
          <div
            ref={scrollContainerRef}
            className="absolute inset-0 overflow-y-auto p-4 space-y-4"
          >
            <p className="text-discord-text">
              The connection to <strong>{serverName}</strong> has the following
              security concerns:
            </p>

            {/* Security Issues List */}
            <div className="space-y-3">
              {isLocalhost && (
                <div className="bg-yellow-500 bg-opacity-10 border border-yellow-500 border-opacity-30 rounded p-3">
                  <div className="flex items-start gap-2">
                    <FaExclamationTriangle className="text-yellow-500 text-sm mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-yellow-200">
                        Unencrypted Connection (Localhost)
                      </p>
                      <p className="text-xs text-yellow-100">
                        This connection uses an unencrypted WebSocket (
                        <code className="bg-black bg-opacity-30 px-1 rounded">
                          ws://
                        </code>
                        ) instead of secure WebSocket (
                        <code className="bg-black bg-opacity-30 px-1 rounded">
                          wss://
                        </code>
                        ). While localhost connections are typically safe for
                        development, any communication could be visible to
                        others on your local network or to malicious software
                        running on your computer.
                      </p>
                      <p className="text-xs text-yellow-100">
                        <strong>Risk:</strong> Messages, passwords, and
                        authentication tokens could be intercepted by network
                        sniffers or malware on your local machine.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isLinkSecurityWarning && (
                <div className="bg-orange-500 bg-opacity-10 border border-orange-500 border-opacity-30 rounded p-3">
                  <div className="flex items-start gap-2">
                    <FaShieldAlt className="text-orange-500 text-sm mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-orange-200">
                        Low Link Security (Level {securityLevel})
                      </p>
                      <p className="text-xs text-orange-100">
                        The IRC server has reported that its server-to-server
                        links have a low security level. This means that when
                        your messages are relayed between IRC servers in the
                        network, they may not be properly encrypted or the
                        SSL/TLS certificates may not be validated correctly.
                      </p>
                      <p className="text-xs text-orange-100">
                        <strong>What this means:</strong>
                      </p>
                      <ul className="text-xs text-orange-100 list-disc list-inside pl-2 space-y-0.5">
                        <li>
                          Server-to-server communication may use unencrypted
                          connections
                        </li>
                        <li>
                          Server operators on the network could potentially read
                          your messages
                        </li>
                        <li>
                          Man-in-the-middle attacks on server links are possible
                        </li>
                        <li>
                          Your messages could be intercepted when relayed
                          between servers
                        </li>
                      </ul>
                      <p className="text-xs text-orange-100">
                        <strong>Risk:</strong> Sensitive information (messages,
                        private conversations, authentication details) could be
                        exposed to network administrators or attackers
                        positioned between IRC servers.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!isLocalhost && !isLinkSecurityWarning && (
                <div className="bg-yellow-500 bg-opacity-10 border border-yellow-500 border-opacity-30 rounded p-3">
                  <p className="text-sm text-yellow-200">
                    <strong>⚠️ Security Risk!</strong> This connection may be
                    vulnerable to interception or man-in-the-middle attacks.
                  </p>
                </div>
              )}
            </div>

            {/* Recommendation */}
            {(isLocalhost || isLinkSecurityWarning) && (
              <div className="bg-blue-500 bg-opacity-10 border border-blue-500 border-opacity-30 rounded p-3">
                <p className="text-xs text-blue-200">
                  <strong>💡 Recommendation:</strong> Only proceed if you trust
                  this server and understand the risks. Avoid sharing sensitive
                  information or passwords over this connection.
                  {isLocalhost &&
                    " For production use, configure your server with SSL/TLS and use wss:// instead of ws://."}
                </p>
              </div>
            )}

            {/* Checkboxes for remembering choice */}
            <div className="space-y-2">
              {isLocalhost && (
                <label className="flex items-center gap-2 text-sm text-discord-text-muted cursor-pointer hover:text-discord-text">
                  <input
                    type="checkbox"
                    checked={skipLocalhostWarning}
                    onChange={(e) => setSkipLocalhostWarning(e.target.checked)}
                    className="rounded border-discord-dark-200"
                  />
                  <span>
                    Don't warn me about localhost connections for this server
                  </span>
                </label>
              )}
              {isLinkSecurityWarning && (
                <label className="flex items-center gap-2 text-sm text-discord-text-muted cursor-pointer hover:text-discord-text">
                  <input
                    type="checkbox"
                    checked={skipLinkSecurityWarning}
                    onChange={(e) =>
                      setSkipLinkSecurityWarning(e.target.checked)
                    }
                    className="rounded border-discord-dark-200"
                  />
                  <span>
                    Don't warn me about low link security for this server
                  </span>
                </label>
              )}
            </div>

            {/* Continue Button - Inside scrollable area at bottom */}
            <div className="pt-2">
              <button
                onClick={handleContinue}
                disabled={!buttonsEnabled}
                className={`w-full px-4 py-3 rounded font-medium transition-colors flex items-center justify-center gap-2 ${
                  buttonsEnabled
                    ? "bg-discord-primary hover:bg-opacity-80 text-white cursor-pointer"
                    : "bg-discord-primary text-white cursor-not-allowed opacity-50"
                }`}
              >
                {!timerExpired ? (
                  <>
                    <FaSpinner className="text-sm animate-spin" />
                    <span className="font-semibold">Please wait...</span>
                  </>
                ) : (
                  <>
                    <FaShieldAlt className="text-sm" />
                    <span className="font-semibold">Continue Anyway</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Scroll to Bottom Button - positioned relative to the scrollable container */}
          {showScrollButton && (
            <button
              onClick={handleScrollToBottom}
              className="absolute bottom-4 right-4 bg-discord-primary hover:bg-opacity-80 text-white p-3 rounded-full shadow-lg transition-all transform hover:scale-110 z-10"
              aria-label="Scroll to bottom"
            >
              <FaArrowDown className="text-lg" />
            </button>
          )}
        </div>

        {/* Cancel Button - Outside scrollable area, always visible */}
        <div className="p-4 border-t border-discord-dark-300 flex-shrink-0">
          <button
            onClick={handleCancel}
            className="w-full px-4 py-2 rounded transition-colors bg-discord-dark-300 hover:bg-discord-dark-200 text-white cursor-pointer"
          >
            Cancel Connection
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// Main component that renders all active warnings
const LinkSecurityWarningModal: React.FC = () => {
  const { linkSecurityWarnings } = useStore((state) => state.ui);

  return (
    <>
      {linkSecurityWarnings.map((warning) => (
        <SingleWarningModal
          key={`${warning.serverId}-${warning.timestamp}`}
          serverId={warning.serverId}
          timestamp={warning.timestamp}
        />
      ))}
    </>
  );
};

export default LinkSecurityWarningModal;
