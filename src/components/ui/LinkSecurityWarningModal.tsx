import type React from "react";
import { createPortal } from "react-dom";
import { FaExclamationTriangle, FaShieldAlt } from "react-icons/fa";
import useStore from "../../store";
import { loadSavedServers } from "../../store";
import { saveServersToLocalStorage } from "../../store";

const LinkSecurityWarningModal: React.FC = () => {
  const {
    ui: { isLinkSecurityWarningModalOpen, linkSecurityWarningServerId },
  } = useStore();

  if (!isLinkSecurityWarningModalOpen || !linkSecurityWarningServerId) return null;

  const server = useStore.getState().servers.find(s => s.id === linkSecurityWarningServerId);
  const savedServers = loadSavedServers();
  const serverConfig = savedServers.find(s => s.id === linkSecurityWarningServerId);

  const handleContinue = () => {
    // Mark that the user has seen and accepted the warning for this server
    const updatedServers = savedServers.map(s =>
      s.id === linkSecurityWarningServerId
        ? { ...s, skipLinkSecurityWarning: true }
        : s
    );
    saveServersToLocalStorage(updatedServers);
    useStore.setState(state => ({
      ui: {
        ...state.ui,
        isLinkSecurityWarningModalOpen: false,
        linkSecurityWarningServerId: null,
      },
    }));
  };

  const handleCancel = () => {
    useStore.setState(state => ({
      ui: {
        ...state.ui,
        isLinkSecurityWarningModalOpen: false,
        linkSecurityWarningServerId: null,
      },
    }));
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancel();
    }
  };

  const serverName = server?.name || serverConfig?.name || server?.host || 'Unknown Server';
  const securityLevel = server?.linkSecurity || 0;
  const isLocalhost = server?.host === 'localhost' || server?.host === '127.0.0.1';
  const isLinkSecurityWarning = server?.linkSecurity !== undefined && server.linkSecurity < 2;

  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-discord-dark-400 rounded-lg shadow-xl border border-discord-dark-300 max-w-md w-full mx-4">
        {/* Header */}
        <div className="p-4 border-b border-discord-dark-300">
          <div className="flex items-center gap-3">
            <FaExclamationTriangle className="text-yellow-500 text-xl flex-shrink-0" />
            <h2 className="text-lg font-semibold text-white">
              Link Security Warning
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-discord-text">
            {isLocalhost ? (
              <>The server <strong>{serverName}</strong> is running on localhost and uses an unencrypted connection.</>
            ) : isLinkSecurityWarning ? (
              <>The server <strong>{serverName}</strong> has a low link security level ({securityLevel}).</>
            ) : (
              <>The connection to <strong>{serverName}</strong> may not be secure.</>
            )}
          </p>

          <div className="bg-yellow-500 bg-opacity-10 border border-yellow-500 border-opacity-30 rounded p-3">
            <p className="text-sm text-yellow-200">
              <strong>⚠️ Security Risk!</strong> {isLocalhost ? (
                <>This connection uses unencrypted WebSocket (ws://) instead of secure WebSocket (wss://). 
                Your communication may be visible to others on the local network.</>
              ) : isLinkSecurityWarning ? (
                <>This server may not have proper SSL/TLS encryption or certificate validation for server-to-server links.
                Your connection may be vulnerable to interception or man-in-the-middle attacks.</>
              ) : (
                <>This connection may be vulnerable to interception or man-in-the-middle attacks.</>
              )}
            </p>
          </div>

          <p className="text-sm text-discord-text-muted">
            Do you want to continue connecting to this server? You can skip this warning for future connections.
          </p>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-discord-dark-300 flex gap-3 justify-end">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded bg-discord-dark-300 hover:bg-discord-dark-200 text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleContinue}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-2"
          >
            <FaShieldAlt className="text-sm" />
            Continue
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default LinkSecurityWarningModal;