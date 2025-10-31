import type React from "react";
import { useState } from "react";
import useStore from "../../store";
import { SimpleModal } from "../modals";

const ChannelRenameModal: React.FC = () => {
  const { servers, ui, renameChannel, closeModal } = useStore();

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
      closeModal("channelRename");
    }
  };

  const isOpen = ui.modals.channelRename?.isOpen || false;

  if (!selectedChannel) return null;

  const footerContent = (
    <button
      onClick={handleRename}
      disabled={!newName.trim() || newName === selectedChannel.name}
      className="w-full bg-discord-primary hover:bg-discord-primary-hover text-white py-2 rounded disabled:opacity-50"
    >
      Rename Channel
    </button>
  );

  return (
    <SimpleModal
      isOpen={isOpen}
      onClose={() => closeModal("channelRename")}
      title="Rename Channel"
      footer={footerContent}
      maxWidth="md"
    >
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
      </div>
    </SimpleModal>
  );
};

export default ChannelRenameModal;
