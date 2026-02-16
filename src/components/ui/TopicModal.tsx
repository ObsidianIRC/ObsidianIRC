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
  const [isEditing, setIsEditing] = useState(false);

  const currentUserInChannel = channel.users.find(
    (u) => u.username === currentUser?.username,
  );
  const canEdit = hasOpPermission(currentUserInChannel?.status);

  const handleSave = () => {
    if (serverId && channel) {
      ircClient.setTopic(serverId, channel.name, editedTopic);
      setIsEditing(false);
      onClose();
    }
  };

  const handleCancel = () => {
    setEditedTopic(channel.topic || "");
    setIsEditing(false);
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Channel Topic"
      maxWidth="md"
    >
      <ModalBody>
        <div className="space-y-4">
          <div>
            <label className="block text-white mb-2">{channel.name}</label>
            {isEditing ? (
              <TextArea
                value={editedTopic}
                onChange={(e) => setEditedTopic(e.target.value)}
                className="w-full p-2 bg-discord-dark-400 text-white rounded min-h-[100px] resize-y focus:outline-none focus:ring-1 focus:ring-discord-primary"
                placeholder="Enter channel topic..."
                autoFocus
              />
            ) : (
              <div className="w-full p-2 bg-discord-dark-400 text-white rounded min-h-[100px] whitespace-pre-wrap break-words">
                {channel.topic || (
                  <span className="text-discord-text-muted">No topic set</span>
                )}
              </div>
            )}
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        {canEdit && !isEditing && (
          <Button
            variant="primary"
            onClick={() => {
              setEditedTopic(channel.topic || "");
              setIsEditing(true);
            }}
            className="flex-1"
          >
            Edit Topic
          </Button>
        )}
        {isEditing && (
          <>
            <Button variant="primary" onClick={handleSave} className="flex-1">
              Save
            </Button>
            <Button
              variant="secondary"
              onClick={handleCancel}
              className="flex-1"
            >
              Cancel
            </Button>
          </>
        )}
        {!isEditing && (
          <Button
            variant="secondary"
            onClick={onClose}
            className={canEdit ? "flex-1" : "w-full"}
          >
            Close
          </Button>
        )}
      </ModalFooter>
    </BaseModal>
  );
};

export default TopicModal;
