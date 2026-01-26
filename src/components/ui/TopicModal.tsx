import type React from "react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { FaTimes } from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import { hasOpPermission } from "../../lib/ircUtils";
import type { Channel, User } from "../../types";

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

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 modal-container px-4">
      <div className="bg-discord-dark-200 rounded-lg w-full max-w-md p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-xl font-bold">Channel Topic</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <FaTimes size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-white mb-2">{channel.name}</label>
            {isEditing ? (
              <textarea
                value={editedTopic}
                onChange={(e) => setEditedTopic(e.target.value)}
                className="w-full p-2 bg-discord-dark-300 text-white rounded min-h-[100px] resize-y"
                placeholder="Enter channel topic..."
                autoFocus
              />
            ) : (
              <div className="w-full p-2 bg-discord-dark-300 text-white rounded min-h-[100px] whitespace-pre-wrap break-words">
                {channel.topic || (
                  <span className="text-discord-text-muted">No topic set</span>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {canEdit && !isEditing && (
              <button
                onClick={() => {
                  setEditedTopic(channel.topic || "");
                  setIsEditing(true);
                }}
                className="flex-1 bg-discord-primary hover:bg-discord-primary-hover text-white py-2 rounded"
              >
                Edit Topic
              </button>
            )}
            {isEditing && (
              <>
                <button
                  onClick={handleSave}
                  className="flex-1 bg-discord-primary hover:bg-discord-primary-hover text-white py-2 rounded"
                >
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 bg-discord-dark-400 hover:bg-discord-dark-500 text-white py-2 rounded"
                >
                  Cancel
                </button>
              </>
            )}
            {!isEditing && (
              <button
                onClick={onClose}
                className={`${canEdit ? "flex-1" : "w-full"} bg-discord-dark-400 hover:bg-discord-dark-500 text-white py-2 rounded`}
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default TopicModal;
