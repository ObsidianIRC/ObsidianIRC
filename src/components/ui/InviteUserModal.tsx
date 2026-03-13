import type React from "react";
import { useState } from "react";
import ircClient from "../../lib/ircClient";
import BaseModal from "../../lib/modal/BaseModal";
import {
  Button,
  Input,
  ModalBody,
  ModalFooter,
} from "../../lib/modal/components";

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

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Invite User to ${channelName}`}
      maxWidth="md"
    >
      <ModalBody>
        <Input
          id="username"
          type="text"
          label="Username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="Enter username to invite"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          error={error}
          helperText={`The user will receive an invitation to join ${channelName}.`}
          autoFocus
        />
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleInvite}>
          Send Invite
        </Button>
      </ModalFooter>
    </BaseModal>
  );
};

export default InviteUserModal;
