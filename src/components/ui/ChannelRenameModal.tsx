import type React from "react";
import { useState } from "react";
import { FaTimes } from "react-icons/fa";
import useStore from "../../store";

const ChannelRenameModal: React.FC = () => {
  const { servers, ui, renameChannel, toggleChannelRenameModal } = useStore();

  const selectedServerId = ui.selectedServerId;
  const currentSelection = selectedServerId
    ? ui.perServerSelections[selectedServerId] || {
        selectedChannelId: null,
        selectedPrivateChatId: null,
      }
    : {
        selectedChannelId: null,
        selectedPrivateChatId: null,
      };
  const { selectedChannelId } = currentSelection;

  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const selectedChannel = selectedServer?.channels.find(
    (c) => c.id === selectedChannelId,
  );

  const [newName, setNewName] = useState(selectedChannel?.name || "");
  const [reason, setReason] = useState("");

  const handleRename = () => {
    if (selectedServer && selectedChannel && newName.trim()) {
      renameChannel(
        selectedServer.id,
        selectedChannel.name,
        newName.trim(),
        reason.trim() || undefined,
      );
      toggleChannelRenameModal(false);
    }
  };

  if (!selectedChannel) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 modal-container">
      <div className="bg-discord-dark-200 rounded-lg w-full max-w-md p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-xl font-bold">Rename Channel</h2>
          <button
            onClick={() => toggleChannelRenameModal(false)}
            className="text-gray-400 hover:text-white"
          >
            <FaTimes size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-white mb-2">Current Name</label>
            <input
              type="text"
              value={selectedChannel.name}
              disabled
              className="w-full p-2 bg-discord-dark-300 text-white rounded"
            />
          </div>

          <div>
            <label className="block text-white mb-2">New Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full p-2 bg-discord-dark-300 text-white rounded"
              placeholder="Enter new channel name"
            />
          </div>

          <div>
            <label className="block text-white mb-2">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-2 bg-discord-dark-300 text-white rounded"
              placeholder="Reason for renaming"
            />
          </div>

          <button
            onClick={handleRename}
            disabled={!newName.trim() || newName === selectedChannel.name}
            className="w-full bg-discord-primary hover:bg-discord-primary-hover text-white py-2 rounded disabled:opacity-50"
          >
            Rename Channel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChannelRenameModal;
