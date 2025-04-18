import React from 'react';
import useStore from '../../store';
import type { User } from '../../types';

const StatusIndicator: React.FC<{ status?: string }> = ({ status }) => {
  let bgColor = 'bg-discord-dark-500'; // Default/offline

  if (status === 'online') {
    bgColor = 'bg-discord-green';
  } else if (status === 'idle') {
    bgColor = 'bg-discord-yellow';
  } else if (status === 'dnd') {
    bgColor = 'bg-discord-red';
  }

  return <div className={`w-3 h-3 rounded-full ${bgColor}`} />;
};

const UserItem: React.FC<{ user: User }> = ({ user }) => {
  return (
    <div className="flex items-center py-2 px-3 mx-2 rounded hover:bg-discord-dark-400 cursor-pointer">
      <div className="w-10 h-10 rounded-full bg-discord-dark-400 flex items-center justify-center text-white text-lg font-bold">
        {user.username.charAt(0).toUpperCase()}
      </div>
      <span className="ml-3">{user.username}</span>
    </div>
  );
};

export const MemberList: React.FC = () => {
  const {
    servers,
    ui: { selectedServerId, selectedChannelId },
  } = useStore();

  const selectedServer = servers.find((server) => server.id === selectedServerId);
  const selectedChannel = selectedServer?.channels.find((channel) => channel.id === selectedChannelId);

  // Sort users alphabetically by username
  const sortedUsers = selectedChannel?.users.slice().sort((a, b) => 
    a.username.localeCompare(b.username)
  );

  return (
    <div className="p-3 h-full overflow-y-auto">
      <h3 className="text-xs font-semibold text-discord-channels-default uppercase mb-2 px-2">
        Members — {sortedUsers?.length || 0}
      </h3>
      {sortedUsers?.map((user) => (
        <UserItem key={user.id} user={user} />
      ))}
    </div>
  );
};

export default MemberList;
