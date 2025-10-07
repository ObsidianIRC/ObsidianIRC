import React from "react";
import { FaExclamationTriangle, FaTimes } from "react-icons/fa";
import useStore from "../../store";

export const LinkSecurityWarningModal: React.FC = () => {
  const {
    toggleLinkSecurityWarningModal,
    proceedWithLinkSecurityWarning,
    cancelLinkSecurityWarning,
    servers,
    ui,
  } = useStore();
  const [rememberChoice, setRememberChoice] = React.useState(false);

  const server = servers.find((s) => s.id === ui.linkSecurityWarningServerId);
  const serverName = server
    ? server.name || `${server.host}:${server.port}`
    : "Unknown Server";

  const handleCancel = () => {
    cancelLinkSecurityWarning();
  };

  const handleProceed = () => {
    proceedWithLinkSecurityWarning(rememberChoice);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-discord-dark-200 rounded-lg w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <FaExclamationTriangle
              className="text-discord-yellow mr-2"
              size={20}
            />
            <h2 className="text-white text-xl font-bold">
              Security Warning - {serverName}
            </h2>
          </div>
          <button
            onClick={handleCancel}
            className="text-discord-text-muted hover:text-white"
          >
            <FaTimes />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-discord-text-normal mb-4">
            The IRC server <strong>{serverName}</strong> you're connecting to
            has reported a link security level that indicates potential security
            risks:
          </p>

          <div className="bg-discord-dark-300 rounded p-4 mb-4">
            <h3 className="text-discord-text-normal font-semibold mb-2">
              What this means:
            </h3>
            <ul className="text-discord-text-muted text-sm space-y-1">
              <li>• Server links may not be using TLS encryption</li>
              <li>• Connections between servers may be sent in plaintext</li>
              <li>• Your messages could be intercepted by third parties</li>
              <li>• This violates modern security standards</li>
            </ul>
          </div>

          <div className="bg-discord-red bg-opacity-20 border border-discord-red rounded p-4 mb-4">
            <p className="text-discord-red text-sm">
              <strong>Warning:</strong> Connecting to this network may expose
              your communications to eavesdropping and man-in-the-middle
              attacks.
            </p>
          </div>

          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              id="rememberChoice"
              checked={rememberChoice}
              onChange={(e) => setRememberChoice(e.target.checked)}
              className="mr-2"
            />
            <label
              htmlFor="rememberChoice"
              className="text-discord-text-normal text-sm"
            >
              Remember my choice and don't show this warning again for this
              server
            </label>
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 bg-discord-dark-400 text-discord-text-normal rounded font-medium hover:bg-discord-dark-300"
          >
            Cancel Connection
          </button>
          <button
            type="button"
            onClick={handleProceed}
            className="px-4 py-2 bg-discord-red text-white rounded font-medium hover:bg-opacity-80"
          >
            Proceed Anyway
          </button>
        </div>
      </div>
    </div>
  );
};

export default LinkSecurityWarningModal;
