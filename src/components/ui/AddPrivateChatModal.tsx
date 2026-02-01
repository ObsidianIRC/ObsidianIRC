import type React from "react";
import { useMemo, useState } from "react";
import { FaSearch, FaUser } from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import BaseModal from "../../lib/modal/BaseModal";
import { Button, ModalBody, ModalFooter } from "../../lib/modal/components";
import useStore from "../../store";

interface AddPrivateChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
}

export const AddPrivateChatModal: React.FC<AddPrivateChatModalProps> = ({
  isOpen,
  onClose,
  serverId,
}) => {
  const { openPrivateChat, selectPrivateChat, servers } = useStore();
  const [searchTerm, setSearchTerm] = useState("");

  const availableUsers = useMemo(() => {
    // Get users from the store instead of ircClient directly
    const server = servers.find((s) => s.id === serverId);
    if (!server) return [];

    // Get the current user for this specific server
    const currentUser = ircClient.getCurrentUser(serverId);

    const allUsers = new Map<string, (typeof server.channels)[0]["users"][0]>();

    // Collect users from all channels
    for (const channel of server.channels) {
      for (const user of channel.users) {
        allUsers.set(user.username, user);
      }
    }

    const allUsersArray = Array.from(allUsers.values());
    const filteredUsers = allUsersArray.filter(
      (user) => user.username !== currentUser?.username,
    );

    if (!searchTerm.trim()) {
      return filteredUsers;
    }

    return filteredUsers.filter((user) =>
      user.username.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [serverId, searchTerm, servers]);

  const handleUserSelect = (username: string) => {
    openPrivateChat(serverId, username);
    // Find and select the private chat
    const server = servers.find((s) => s.id === serverId);
    const privateChat = server?.privateChats?.find(
      (pc) => pc.username === username,
    );
    if (privateChat) {
      selectPrivateChat(privateChat.id, { navigate: true });
    }
    setSearchTerm("");
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Start Private Message"
      maxWidth="md"
    >
      <ModalBody scrollable className="max-h-[60vh]">
        {/* Search Input */}
        <div className="relative mb-4">
          <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-discord-channels-default" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full bg-discord-dark-400 border border-discord-dark-500 rounded px-10 py-2 text-white placeholder-discord-channels-default focus:outline-none focus:border-discord-primary"
            autoFocus
          />
        </div>

        {/* User List */}
        <div className="max-h-64 overflow-y-auto">
          {availableUsers.length === 0 ? (
            <div className="text-discord-channels-default text-center py-4">
              {searchTerm
                ? "No users found matching your search"
                : "No users available"}
            </div>
          ) : (
            <div className="space-y-1">
              {availableUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleUserSelect(user.username)}
                  className="w-full flex items-center gap-3 p-2 rounded hover:bg-discord-dark-400 text-left text-white"
                >
                  <FaUser className="text-discord-channels-default" />
                  <span>{user.username}</span>
                  {user.isOnline && (
                    <div className="ml-auto w-2 h-2 bg-discord-green rounded-full" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </BaseModal>
  );
};

export default AddPrivateChatModal;
