import type React from "react";
import { useState } from "react";
import { FaUserPlus } from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import { SimpleModal } from "../modals";

interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  channelName: string;
}

const InviteUserModal: React.FC<InviteUserModalProps> = ({
  isOpen,
  onClose,
  serverId,
  channelName,
}) => {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleInvite = () => {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      setError("Please enter a username");
      return;
    }

    // Send the INVITE command
    ircClient.sendRaw(serverId, `INVITE ${trimmedUsername} ${channelName}`);

    // Close modal and reset
    setUsername("");
    setError("");
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInvite();
    }
  };

  const handleClose = () => {
    setUsername("");
    setError("");
    onClose();
  };

  const modalTitle = (
    <div className="flex items-center gap-2">
      <FaUserPlus className="text-discord-green" />
      <span>Invite User to {channelName}</span>
    </div>
  );

  const footerContent = (
    <>
      <button
        onClick={handleClose}
        className="px-4 py-2 bg-discord-dark-400 text-discord-text-normal rounded font-medium hover:bg-discord-dark-500 transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={handleInvite}
        className="px-4 py-2 bg-discord-green hover:bg-opacity-80 text-white rounded font-medium transition-colors"
      >
        Send Invite
      </button>
    </>
  );

  return (
    <SimpleModal
      isOpen={isOpen}
      onClose={handleClose}
      title={modalTitle}
      footer={footerContent}
      maxWidth="md"
    >
      <div className="mb-4">
        <label
          htmlFor="username"
          className="block text-sm font-medium text-discord-text-normal mb-2"
        >
          Username
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="Enter username to invite"
          className="w-full px-3 py-2 bg-discord-dark-500 text-discord-text-normal rounded border border-discord-dark-400 focus:border-discord-blurple focus:outline-none"
          autoFocus
        />
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>

      <div className="text-sm text-discord-text-muted">
        The user will receive an invitation to join {channelName}.
      </div>
    </SimpleModal>
  );
};

export default InviteUserModal;
