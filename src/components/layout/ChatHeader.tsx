import { UsersIcon } from "@heroicons/react/24/solid";
import type React from "react";
import {
  FaAt,
  FaBell,
  FaChevronLeft,
  FaChevronRight,
  FaEdit,
  FaHashtag,
  FaList,
  FaPenAlt,
  FaSearch,
  FaUserPlus,
} from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import useStore from "../../store";
import type { Channel, PrivateChat } from "../../types";

interface ChatHeaderProps {
  selectedChannel: Channel | null;
  selectedPrivateChat: PrivateChat | null;
  selectedServerId: string | null;
  isChanListVisible: boolean;
  isMemberListVisible: boolean;
  isNarrowView: boolean;
  onToggleChanList: () => void;
  onToggleMemberList: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  selectedChannel,
  selectedPrivateChat,
  selectedServerId,
  isChanListVisible,
  isMemberListVisible,
  isNarrowView,
  onToggleChanList,
  onToggleMemberList,
}) => {
  const { toggleChannelListModal, toggleChannelRenameModal } = useStore();

  // Check if current user is operator
  const isOperator = (() => {
    if (!selectedChannel || !selectedServerId) return false;
    const serverCurrentUser = ircClient.getCurrentUser(selectedServerId);
    if (!serverCurrentUser) return false;

    const channelUser = selectedChannel.users.find(
      (u) => u.username === serverCurrentUser.username,
    );
    return (
      channelUser?.status?.includes("@") || channelUser?.status?.includes("~")
    );
  })();

  return (
    <div className="h-12 min-h-[48px] px-4 border-b border-discord-dark-400 flex items-center justify-between shadow-sm">
      <div className="flex items-center">
        {!isChanListVisible && (
          <button
            onClick={onToggleChanList}
            className="text-discord-channels-default hover:text-white mr-4"
            aria-label="Expand channel list"
          >
            {isNarrowView ? <FaChevronLeft /> : <FaChevronRight />}
          </button>
        )}
        {selectedChannel && (
          <>
            <FaHashtag className="text-discord-text-muted mr-2" />
            <h2 className="font-bold text-white mr-4">
              {selectedChannel.name.replace(/^#/, "")}
            </h2>
          </>
        )}
        {selectedPrivateChat && (
          <>
            <FaAt className="text-discord-text-muted mr-2" />
            <h2 className="font-bold text-white mr-4">
              {selectedPrivateChat.username}
            </h2>
          </>
        )}
        {selectedChannel?.topic && (
          <>
            <div className="mx-2 text-discord-text-muted">|</div>
            <div className="text-discord-text-muted text-sm truncate max-w-xs">
              {selectedChannel.topic}
            </div>
          </>
        )}
      </div>
      {!!selectedServerId && (
        <div className="flex items-center gap-4 text-discord-text-muted">
          <button className="hover:text-discord-text-normal">
            <FaBell />
          </button>
          <button className="hover:text-discord-text-normal">
            <FaPenAlt />
          </button>
          <button className="hover:text-discord-text-normal">
            <FaUserPlus />
          </button>
          <button
            className="hover:text-discord-text-normal"
            onClick={() => toggleChannelListModal(true)}
            title="List Channels"
          >
            <FaList />
          </button>
          {selectedChannel && isOperator && (
            <button
              className="hover:text-discord-text-normal"
              onClick={() => toggleChannelRenameModal(true)}
              title="Rename Channel"
            >
              <FaEdit />
            </button>
          )}
          {/* Only show member list toggle for channels, not private chats */}
          {selectedChannel && (
            <button
              className="hover:text-discord-text-normal"
              onClick={() => onToggleMemberList()}
              aria-label={
                isMemberListVisible
                  ? "Collapse member list"
                  : "Expand member list"
              }
              data-testid="toggle-member-list"
            >
              {isMemberListVisible ? (
                <UsersIcon className="w-4 h-4 text-white" />
              ) : (
                <UsersIcon className="w-4 h-4 text-gray" />
              )}
            </button>
          )}
          <div className="relative">
            <input
              type="text"
              placeholder="Search"
              className="bg-discord-dark-400 text-discord-text-muted text-sm rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-discord-text-link"
            />
            <FaSearch className="absolute right-2 top-1.5 text-xs" />
          </div>
        </div>
      )}
    </div>
  );
};
