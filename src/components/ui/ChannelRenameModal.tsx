import type React from "react";
import { useState } from "react";
import BaseModal from "../../lib/modal/BaseModal";
import {
  Button,
  Input,
  ModalBody,
  ModalFooter,
} from "../../lib/modal/components";
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
    <BaseModal
      isOpen={ui.isChannelRenameModalOpen}
      onClose={() => toggleChannelRenameModal(false)}
      title="Rename Channel"
      maxWidth="md"
    >
      <ModalBody>
        <div className="space-y-4">
          <Input
            type="text"
            label="Current Name"
            value={selectedChannel.name}
            disabled
          />

          <Input
            type="text"
            label="New Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Enter new channel name"
          />

          <Input
            type="text"
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for renaming"
          />
        </div>
      </ModalBody>

      <ModalFooter>
        <Button
          variant="primary"
          onClick={handleRename}
          disabled={!newName.trim() || newName === selectedChannel.name}
          className="w-full"
        >
          Rename Channel
        </Button>
      </ModalFooter>
    </BaseModal>
  );
};

export default ChannelRenameModal;
