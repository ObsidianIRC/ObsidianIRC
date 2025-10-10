import type React from "react";
import { FaEnvelope } from "react-icons/fa";
import useStore from "../../store";
import type { Message as MessageType, User } from "../../types";

interface InviteMessageProps {
  message: MessageType;
  messageUser?: User;
  onUsernameContextMenu: (
    e: React.MouseEvent,
    username: string,
    serverId: string,
    channelId: string,
    avatarElement?: Element | null,
  ) => void;
  joinChannel?: (serverId: string, channelName: string) => void;
}

export const InviteMessage: React.FC<InviteMessageProps> = ({
  message,
  messageUser,
  onUsernameContextMenu,
  joinChannel,
}) => {
  const { servers } = useStore();

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const handleAvatarClick = (e: React.MouseEvent) => {
    const username = message.userId.split("-")[0];
    onUsernameContextMenu(
      e,
      username,
      message.serverId,
      message.channelId,
      e.currentTarget,
    );
  };

  const handleJoinClick = () => {
    if (message.inviteChannel && joinChannel) {
      joinChannel(message.serverId, message.inviteChannel);
    }
  };

  const username = message.userId.split("-")[0];
  const displayName =
    messageUser?.metadata?.["display-name"]?.value || username;
  const userColor = messageUser?.metadata?.color?.value || "#888888";

  // Check if we're already in the channel
  const server = servers.find((s) => s.id === message.serverId);
  const alreadyInChannel = server?.channels.some(
    (c) => c.name === message.inviteChannel,
  );

  return (
    <div className="group relative flex items-start px-4 py-2 hover:bg-discord-dark-500 transition-colors duration-75">
      {/* Invite icon */}
      <div className="flex-shrink-0 mr-3 mt-1">
        <div className="w-8 h-8 rounded-full bg-[#5865F2] flex items-center justify-center text-white">
          <FaEnvelope size={16} />
        </div>
      </div>

      {/* Invite content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-sm font-bold cursor-pointer hover:underline"
            style={{ color: userColor }}
            onClick={handleAvatarClick}
          >
            {displayName}
          </span>
          <span className="text-xs text-discord-text-muted">
            {formatTime(new Date(message.timestamp))}
          </span>
        </div>
        <div className="text-sm text-discord-text-normal mb-2">
          {message.content}
        </div>

        {/* Join button - only show if not already in the channel */}
        {!alreadyInChannel && message.inviteChannel && (
          <button
            onClick={handleJoinClick}
            className="px-4 py-2 bg-discord-green hover:bg-opacity-80 text-white rounded font-medium transition-all text-sm"
            type="button"
          >
            Join {message.inviteChannel}
          </button>
        )}
        {alreadyInChannel && (
          <span className="text-xs text-discord-text-muted italic">
            Already in {message.inviteChannel}
          </span>
        )}
      </div>
    </div>
  );
};
