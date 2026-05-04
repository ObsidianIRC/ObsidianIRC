import type React from "react";
import { useState } from "react";
import ircClient from "../../lib/ircClient";
import { hasOpPermission } from "../../lib/ircUtils";
import BaseModal from "../../lib/modal/BaseModal";
import { Button, ModalBody, ModalFooter } from "../../lib/modal/components";
import type { Channel, User } from "../../types";
import { TextArea } from "./TextInput";

interface TopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
  serverId: string;
  currentUser: User | null;
}

export const TopicModal: React.FC<TopicModalProps> = ({
  isOpen,
  onClose,
  channel,
  serverId,
  currentUser,
}) => {
  const [editedTopic, setEditedTopic] = useState(channel.topic || "");

  const currentUserInChannel = channel.users.find(
    (u) => u.username === currentUser?.username,
  );
  const canEdit = hasOpPermission(currentUserInChannel?.status);
  const isDirty = editedTopic !== (channel.topic || "");

  const handleSave = () => {
    ircClient.setTopic(serverId, channel.name, editedTopic);
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={channel.name}
      maxWidth="md"
    >
      <ModalBody>
        <TextArea
          value={editedTopic}
          onChange={(e) => setEditedTopic(e.target.value)}
          readOnly={!canEdit}
          className={`w-full p-3 rounded min-h-[120px] resize-y text-sm leading-relaxed focus:outline-none transition-colors ${
            canEdit
              ? "bg-discord-dark-400 text-white focus:ring-1 focus:ring-discord-primary"
              : "bg-discord-dark-400/60 text-discord-text-muted cursor-default select-all"
          }`}
          placeholder={canEdit ? "Set a topic…" : "No topic set"}
          autoFocus={canEdit}
        />
      </ModalBody>

      {canEdit && (
        <ModalFooter>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!isDirty}
            className="ml-auto"
          >
            Save
          </Button>
        </ModalFooter>
      )}
    </BaseModal>
  );
};

export default TopicModal;
