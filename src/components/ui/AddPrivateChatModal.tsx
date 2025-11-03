import type React from "react";
import { useMemo } from "react";
import { FaUser } from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import useStore from "../../store";
import { ListModal } from "../modals";

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
    return allUsersArray.filter(
      (user) => user.username !== currentUser?.username,
    );
  }, [serverId, servers]);

  const handleUserSelect = (username: string) => {
    openPrivateChat(serverId, username);
    // Find and select the private chat
    const server = servers.find((s) => s.id === serverId);
    const privateChat = server?.privateChats?.find(
      (pc) => pc.username === username,
    );
    if (privateChat) {
      selectPrivateChat(privateChat.id);
    }
    onClose();
  };

  // Render function for each user item
  const renderUserItem = (user: (typeof availableUsers)[0]) => (
    <button
      onClick={() => handleUserSelect(user.username)}
      className="w-full flex items-center gap-3 p-2 rounded hover:bg-discord-dark-400 text-left text-white"
    >
      <FaUser className="text-discord-channels-default" />
      <span>{user.username}</span>
      {user.isOnline && (
        <div className="ml-auto w-2 h-2 bg-discord-green rounded-full" />
      )}
    </button>
  );

  // Footer content
  const footerContent = (
    <button
      onClick={onClose}
      className="px-4 py-2 bg-discord-dark-400 text-white rounded hover:bg-discord-dark-500"
    >
      Cancel
    </button>
  );

  return (
    <ListModal
      isOpen={isOpen}
      onClose={onClose}
      title="Start Private Message"
      items={availableUsers}
      renderItem={renderUserItem}
      getKey={(user) => user.id}
      getSearchText={(user) => user.username}
      searchPlaceholder="Search users..."
      emptyMessage="No users available"
      footer={footerContent}
      maxWidth="md"
    />
  );
};

export default AddPrivateChatModal;
